import test from 'node:test';
import assert from 'node:assert/strict';
import { createBillingService } from '../src/billing-service.js';

const FIXTURE_API = "https://billing.invalid";

function fixture(checkoutUrl = "https://checkout.stripe.com/c/pay/cs_test_fixture") {
 const local = {}; const requests = []; let paid = false; let valid = true; let offline = false; let checkoutCount = 0; let now = 1000000000;
 const storage = { async get(key) { return {[key]: structuredClone(local[key])}; }, async set(value) { Object.assign(local,structuredClone(value)); } };
 const fetch = async (url,options={}) => {
  if(offline)throw new Error('offline');
  const path=new URL(url).pathname; const data=options.body?JSON.parse(options.body):{};requests.push({path,data,headers:options.headers});
  if(path==='/api/trial/start')return Response.json({serverTime:now,trialEndsAt:now+604800000,offerEndsAt:now+604800000});
  if(path==='/api/plans')return Response.json({serverTime:now,trialEndsAt:1000000000+604800000,offerEndsAt:1000000000+604800000,plans:[{id:'pro',amount:now<1000000000+604800000?1290:1999,originalAmount:1999,currency:'usd'}]});
  if(path==='/api/checkout/session'){checkoutCount++;return Response.json({purchaseId:'purchase-1',claimToken:'secret-claim',checkoutUrl})}
  if(path.endsWith('/status'))return Response.json({status:paid?'paid':'pending',activationReady:paid});
  if(path==='/api/licenses/claim'||path==='/api/licenses/redeem')return Response.json({activationToken:'device-secret',entitlement:{plan:'pro',status:'active',expiresAt:null},offlineUntil:now+86400000});
  if(path==='/api/licenses/validate')return Response.json({valid,entitlement:{plan:'pro',status:valid?'active':'revoked',expiresAt:null},offlineUntil:now+86400000});
  if(path==='/api/licenses/deactivate')return Response.json({deactivated:true});
  if(path==='/api/licenses/recover')return Response.json({message:'generic'});
  return Response.json({error:'unexpected'},{status:404});
 };
 const service=createBillingService({storage,fetch,now:()=>now,apiUrl:FIXTURE_API,stripeMode:"test"});
 return {service,storage,local,requests,setPaid(){paid=true},revoke(){valid=false},setOffline(){offline=true},advance(ms){now+=ms},checkouts:()=>checkoutCount};
}

test('billing initializes one installation and never exposes credentials in UI state',async()=>{
 const f=fixture();const [a,b]=await Promise.all([f.service.getView(),f.service.getView()]);assert.equal(a.tier,'trial');assert.equal(b.tier,'trial');assert.equal(f.requests.filter(r=>r.path==='/api/trial/start').length,1);assert.equal(a.price.amount,1290);assert.equal(JSON.stringify(a).includes('installationToken'),false);
});

test('concurrent checkout uses one purchase; only a confirmed claim enables Pro',async()=>{
 const f=fixture();const [a,b]=await Promise.all([f.service.checkout(),f.service.checkout()]);assert.equal(a.checkoutUrl,b.checkoutUrl);assert.equal(f.checkouts(),1);assert.equal((await f.service.purchaseStatus()).tier,'trial');f.setPaid();assert.equal((await f.service.purchaseStatus()).tier,'pro');const publicState=await f.service.getView();assert.equal(JSON.stringify(publicState).includes('device-secret'),false);assert.equal(JSON.stringify(publicState).includes('secret-claim'),false);
});

test('redemption uses an installation credential afterward, and offline access has a deadline',async()=>{
 const f=fixture();await f.service.redeem('POL-PRIVATE-KEY');assert.equal(JSON.stringify(f.local).includes('POL-PRIVATE-KEY'),false);f.setOffline();f.advance(600000);assert.equal((await f.service.refresh()).tier,'pro');f.advance(86400001);assert.equal((await f.service.refresh()).tier,'trial');
});

test('server revocation immediately removes cached Pro and validates no original license',async()=>{
 const f=fixture();await f.service.redeem('POL-PRIVATE-KEY');f.revoke();assert.notEqual((await f.service.refresh()).tier,'pro');const validation=f.requests.find(r=>r.path==='/api/licenses/validate');assert.deepEqual(validation.data,{activationToken:'device-secret'});
});

test('trial expiry requires two replaceable platforms without restarting the trial',async()=>{
 const f=fixture();await f.service.getView();await f.service.rememberPlatform('claude');await f.service.rememberPlatform('chatgpt');f.advance(8*86400000);const expired=await f.service.getView();assert.equal(expired.tier,'free');assert.equal(expired.needsPlatformChoice,true);assert.deepEqual(expired.suggestedPlatforms,['chatgpt','claude']);await assert.rejects(f.service.selectPlatforms(['chatgpt','claude','gemini']));await f.service.selectPlatforms(['chatgpt','gemini']);assert.equal((await f.service.getView()).needsPlatformChoice,false);await f.service.selectPlatforms(['kimi','grok']);assert.deepEqual((await f.service.getView()).platforms,['kimi','grok']);
});

test('installation stays stable across worker restarts and deactivation requires server confirmation',async()=>{
 const f=fixture();await f.service.redeem('POL-PRIVATE-KEY');const old=f.requests.find(r=>r.path==='/api/trial/start').data.installationId;const restarted=createBillingService({storage:f.storage,fetch:async(url,options)=>{assert.equal(options.headers['X-Installation-Token'].length>=32,true);if(url.endsWith('/api/licenses/validate'))return Response.json({valid:true,entitlement:{plan:'pro',status:'active'},offlineUntil:Date.now()+10000});return Response.json({serverTime:Date.now(),plans:[{id:'pro',amount:1290,currency:'usd'}]})},apiUrl:FIXTURE_API});await restarted.getView();assert.equal(f.local['polaris-billing-v1'].installationId,old);await f.service.deactivate();assert.notEqual((await f.service.getView()).tier,'pro');
});

test('cached access checks never start network requests and recovery can initialize a previously unavailable service',async()=>{
 const local={};let online=false,calls=0;
 const storage={async get(key){return {[key]:local[key]}},async set(value){Object.assign(local,value)}};
 const service=createBillingService({storage,fetch:async url=>{calls++;if(!online)return Response.json({error:'not_found'},{status:404});if(url.endsWith('/api/trial/start'))return Response.json({serverTime:1000,trialEndsAt:604801000,offerEndsAt:604801000});return Response.json({serverTime:1000,trialEndsAt:604801000,offerEndsAt:604801000,plans:[{id:'pro',currency:'usd',amount:1290}]})},now:()=>1000,apiUrl:FIXTURE_API});
 assert.equal((await service.getAccess()).available,false);assert.equal(calls,0);assert.equal((await service.getView()).available,false);online=true;assert.equal((await service.refresh()).tier,'trial');
});

test('content access is available while a license network request is still pending',async()=>{
 const local={};let release;let started=false;
 const storage={async get(key){return {[key]:local[key]}},async set(value){Object.assign(local,value)}};
 const service=createBillingService({storage,fetch:async()=>{if(started)return Response.json({error:'unavailable'},{status:503});started=true;return new Promise(resolve=>{release=()=>resolve(Response.json({error:'unavailable'},{status:503}))})},apiUrl:FIXTURE_API});
 const refresh=service.getView();while(!started)await new Promise(resolve=>setTimeout(resolve,0));
 const access=await Promise.race([service.getAccess(),new Promise(resolve=>setTimeout(()=>resolve(null),100))]);release();await refresh;assert.equal(access?.available,false);
});

test('an expired offer waits for server pricing and refreshes across the catalog cache interval',async()=>{
 const f=fixture();await f.service.getView();f.advance(604800000-1000);await f.service.refresh();
 const before=f.requests.length;f.advance(1001);
 assert.equal((await f.service.getAccess()).price,null);
 assert.equal(f.requests.length,before);
 assert.equal((await f.service.getView()).price.amount,1999);
 assert.equal(f.requests.length,before+1);
});

test('checkout crossing the offer deadline requires confirmation of the refreshed price',async()=>{
 const f=fixture();await f.service.getView();f.advance(604800001);
 await assert.rejects(f.service.checkout(),/price_changed/);
 assert.equal(f.checkouts(),0);
 assert.equal((await f.service.getView()).price.amount,1999);
 await f.service.checkout();assert.equal(f.checkouts(),1);
});

test("an unconfigured billing API never contacts the network and refuses checkout", async () => {
  let calls = 0;
  const local = {};
  const storage = {
    async get(key) { return { [key]: local[key] }; },
    async set(value) { Object.assign(local, value); }
  };
  const service = createBillingService({
    storage,
    fetch: async () => { calls += 1; throw new Error("network"); },
    now: () => 1000
  });
  const view = await service.getView();
  assert.equal(view.available, false);
  assert.equal(view.tier, "unavailable");
  assert.equal(calls, 0);
  await assert.rejects(service.checkout(), /billing_unavailable/);
  assert.equal(calls, 0);
  assert.equal(JSON.stringify(local).includes("workers.dev"), false);
});

test("checkout accepts only a live Stripe session when live mode is selected", async () => {
  const rejected = fixture("https://checkout.stripe.com/c/pay/cs_test_fixture");
  rejected.service = createBillingService({ storage: rejected.storage, fetch: async (url, options) => {
    const path = new URL(url).pathname;
    if (path === "/api/trial/start") return Response.json({ serverTime: 1000000000, trialEndsAt: 1000000000 + 604800000, offerEndsAt: 1000000000 + 604800000 });
    if (path === "/api/plans") return Response.json({ serverTime: 1000000000, plans: [{ id: "pro", amount: 1290, originalAmount: 1999, currency: "usd" }] });
    if (path === "/api/checkout/session") return Response.json({ purchaseId: "purchase-1", claimToken: "secret-claim", checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_fixture" });
    return Response.json({ error: "unexpected" }, { status: 404 });
  }, now: () => 1000000000, apiUrl: FIXTURE_API, stripeMode: "live" });
  await rejected.service.getView();
  await assert.rejects(rejected.service.checkout(), /invalid_live_checkout/);
  const accepted = createBillingService({
    storage: { async get(key) { return { [key]: undefined }; }, async set() {} },
    fetch: async (url) => {
      const path = new URL(url).pathname;
      if (path === "/api/trial/start") return Response.json({ serverTime: 1000000000, trialEndsAt: 1000000000 + 604800000, offerEndsAt: 1000000000 + 604800000 });
      if (path === "/api/plans") return Response.json({ serverTime: 1000000000, plans: [{ id: "pro", amount: 1290, originalAmount: 1999, currency: "usd" }] });
      if (path === "/api/checkout/session") return Response.json({ purchaseId: "purchase-1", claimToken: "secret-claim", checkoutUrl: "https://checkout.stripe.com/c/pay/cs_live_fixture" });
      return Response.json({ error: "unexpected" }, { status: 404 });
    },
    now: () => 1000000000,
    apiUrl: FIXTURE_API,
    stripeMode: "live"
  });
  assert.equal((await accepted.checkout()).checkoutUrl, "https://checkout.stripe.com/c/pay/cs_live_fixture");
});

test("checkout still rejects a live Stripe session and does not store it", async () => {
  const f = fixture("https://checkout.stripe.com/c/pay/cs_live_fixture");
  await f.service.getView();
  await assert.rejects(f.service.checkout(), /invalid_test_checkout/);
  assert.equal((await f.service.getView()).hasPurchase, false);
  assert.equal(JSON.stringify(f.local).includes("cs_live_"), false);
});
