import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

test('test worker reports its environment without exposing configuration', async () => {
 const response = await worker.fetch(new Request('https://test.invalid/health'), {});
 assert.equal(response.status, 200);
 assert.deepEqual(await response.json(), {ok:true,env:'test',version:'0.1.3'});
});

test('API fails closed when storage or test secrets are missing', async () => {
 const response=await worker.fetch(new Request('https://test.invalid/api/checkout/session',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}}),{});
 assert.equal(response.status,503);
 assert.deepEqual(await response.json(),{error:'test_environment_not_configured'});
});

import {database} from './d1.js';
import {hash} from '../src/crypto.js';
const install={installationId:'installation-a',installationToken:'test-installation-secret-at-least-32-chars'};
function environment(){return {DB:database(),LICENSE_HASH_SECRET:'hash-secret-only-used-by-tests-123456789',LICENSE_DELIVERY_ENCRYPTION_KEY:'encryption-key-only-used-by-tests-123456789',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_PRICE_PRO_PROMO:'price_promo',STRIPE_PRICE_PRO_DEFAULT:'price_default',PUBLIC_APP_URL:'http://127.0.0.1:4317',ALLOWED_ORIGINS:'http://127.0.0.1:4317'}}
async function request(env,path,data,headers={}){const r=await worker.fetch(new Request(`https://test.invalid${path}`,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Installation-Token':install.installationToken,...headers},body:data===undefined?undefined:JSON.stringify(data)}),env);return {status:r.status,data:await r.json()}}

test('trial is idempotent; another secret cannot take ownership; server returns welcome pricing',async()=>{
 const env=environment();try{const a=await request(env,'/api/trial/start',install);const b=await request(env,'/api/trial/start',install);assert.equal(a.status,200);assert.equal(a.data.trialEndsAt,b.data.trialEndsAt);assert.ok(a.data.trialEndsAt-Date.now()>6.9*86400000);
 assert.equal((await request(env,'/api/trial/start',{...install,installationToken:'another-secret-with-at-least-32-characters'})).status,401);
 const plans=await request(env,'/api/plans?installationId=installation-a');assert.equal(plans.data.plans[0].amount,1290);assert.equal(plans.data.plans[0].maxActivations,null);
 assert.equal((await request(env,'/api/checkout/session',{planId:'arbitrary',installationId:install.installationId})).status,400);
 }finally{env.DB.close()}
});

test('checkout, signed fulfillment and retryable claim never unlock unpaid or refunded orders',async(t)=>{
 const env=environment();let paid=false,refunded=false,purchaseId,checkoutBody,deliveredLicense,deliveries=0;
 t.mock.method(globalThis,'fetch',async(input,options)=>{const url=new URL(input);let value;
 if(url.hostname==='api.resend.com'){deliveries++;deliveredLicense=JSON.parse(options.body).text.match(/POL-[a-f0-9]+/)[0];return Response.json({id:'email_fixture'})}
 if(url.pathname==='/v1/prices/price_promo')value={id:'price_promo',livemode:false,active:true,currency:'usd',unit_amount:1290,type:'one_time'};
 else if(url.pathname==='/v1/checkout/sessions'){checkoutBody=new URLSearchParams(options.body);purchaseId=checkoutBody.get('metadata[purchaseId]');value={id:'cs_test_fixture',livemode:false,url:'https://checkout.stripe.com/c/pay/cs_test_fixture'}}
 else if(url.pathname==='/v1/checkout/sessions/cs_test_fixture')value={id:'cs_test_fixture',livemode:false,mode:'payment',metadata:{purchaseId},payment_status:paid?'paid':'unpaid',status:paid?'complete':'open',payment_intent:'pi_test',amount_total:1290,currency:'usd',customer_details:{email:'buyer@example.com'}};
 else if(url.pathname==='/v1/payment_intents/pi_test')value={livemode:false,status:paid?'succeeded':'processing',latest_charge:{refunded,disputed:false,amount_refunded:refunded?1290:0}};
 else throw new Error(`Unexpected Stripe request: ${url.pathname}`);return Response.json(value)});
 async function event(id,type='checkout.session.completed',invalid=false){const object=type==='charge.refunded'?{payment_intent:'pi_test'}:{id:'cs_test_fixture',metadata:{purchaseId}};const raw=JSON.stringify({id,type,livemode:false,data:{object}}),ts=Math.floor(Date.now()/1000);const r=await worker.fetch(new Request('https://test.invalid/api/stripe/webhook',{method:'POST',body:raw,headers:{'Stripe-Signature':`t=${ts},v1=${invalid?'bad':await hash(env.STRIPE_WEBHOOK_SECRET,`${ts}.${raw}`)}`}}),env);return r}
 try{
 await request(env,'/api/trial/start',install);const checkout=await request(env,'/api/checkout/session',{planId:'pro',installationId:install.installationId,amount:1,priceId:'attacker'});assert.equal(checkout.status,200);assert.equal(checkoutBody.get('line_items[0][price]'),'price_promo');assert.equal(checkoutBody.get('mode'),'payment');
 const claim={purchaseId:checkout.data.purchaseId,claimToken:checkout.data.claimToken,installationId:install.installationId};
 assert.equal((await request(env,'/api/licenses/claim',claim)).status,409);
 assert.equal((await event('evt_bad',undefined,true)).status,400);
 assert.equal((await event('evt_pending')).status,200);assert.equal((await request(env,'/api/licenses/claim',claim)).status,409);
 paid=true;assert.equal((await event('evt_paid')).status,200);assert.equal((await event('evt_paid')).status,200);
 const a=await request(env,'/api/licenses/claim',claim),b=await request(env,'/api/licenses/claim',claim);assert.equal(a.status,200);assert.equal(a.data.activationToken,b.data.activationToken);assert.equal((await request(env,'/api/licenses/validate',{activationToken:a.data.activationToken})).data.valid,true);
 assert.equal((await request(env,'/api/licenses/claim',{...claim,installationId:'someone-else'})).status,401);
 assert.equal((await request(env,`/api/purchases/${claim.purchaseId}/status`,undefined,{'Authorization':`Bearer ${claim.claimToken}`,'X-Installation-Id':install.installationId})).data.activationReady,true);
 env.EMAIL_PROVIDER_API_KEY='mail_fixture';env.EMAIL_FROM_ADDRESS='test@example.com';await worker.scheduled({},env);assert.match(deliveredLicense,/^POL-[a-f0-9]{64}$/);await worker.scheduled({},env);assert.equal(deliveries,1);
 for(const id of ['installation-b','installation-c','installation-d']){await request(env,'/api/trial/start',{...install,installationId:id});const redeemed=await request(env,'/api/licenses/redeem',{installationId:id,licenseKey:deliveredLicense});assert.equal(redeemed.status,200);assert.equal((await request(env,'/api/licenses/validate',{activationToken:redeemed.data.activationToken})).data.valid,true)}
 assert.equal((await request(env,'/api/licenses/recover',{email:'unknown@example.com'})).data.message,(await request(env,'/api/licenses/recover',{email:'buyer@example.com'})).data.message);
 await request(env,'/api/licenses/deactivate',{activationToken:a.data.activationToken});assert.equal((await request(env,'/api/licenses/validate',{activationToken:a.data.activationToken})).data.valid,false);
 const renewed=await request(env,'/api/licenses/claim',claim);assert.notEqual(renewed.data.activationToken,a.data.activationToken);
 refunded=true;assert.equal((await event('evt_refund','charge.refunded')).status,200);assert.equal((await request(env,'/api/licenses/validate',{activationToken:renewed.data.activationToken})).data.valid,false);
 assert.equal((await event('evt_late_paid')).status,200);assert.equal((await request(env,'/api/licenses/claim',claim)).status,409);
 }finally{env.DB.close()}
});

test('unapproved browser origins and live Stripe keys fail closed',async()=>{const env=environment();try{assert.equal((await request(env,'/api/trial/start',install,{Origin:'https://attacker.invalid'})).status,403);await request(env,'/api/trial/start',install);env.STRIPE_SECRET_KEY='sk_live_never_send';assert.equal((await request(env,'/api/checkout/session',{planId:'pro',installationId:install.installationId})).data.error,'test_stripe_not_configured')}finally{env.DB.close()}});

test('trial expiry changes the server price to $19.99 without restarting the trial',async(t)=>{
 const env=environment(),start=Date.now();try{await request(env,'/api/trial/start',install);t.mock.method(Date,'now',()=>start+8*86400000);const plans=await request(env,'/api/plans?installationId=installation-a');assert.equal(plans.data.plans[0].amount,1999);const again=await request(env,'/api/trial/start',install);assert.ok(again.data.trialEndsAt<Date.now())}finally{env.DB.close()}
});

test('an expired Checkout quote cannot silently create a higher-price order',async(t)=>{
 const env=environment(),start=Date.now();
 try{
  await request(env,'/api/trial/start',install);
  t.mock.method(Date,'now',()=>start+8*86400000);
  const checkout=await request(env,'/api/checkout/session',{planId:'pro',installationId:install.installationId,expectedAmount:1290});
  assert.equal(checkout.status,409);assert.equal(checkout.data.error,'price_changed');
  assert.equal((await env.DB.prepare('SELECT count(*) AS count FROM polaris_billing_purchase_intents').first()).count,0);
 }finally{env.DB.close()}
});

test('unknown routes stay 404 before initialization and oversized streams are canceled early',async()=>{
 const unknown=await worker.fetch(new Request('https://test.invalid/unrelated'),{});
 assert.equal(unknown.status,404);
 const env=environment();let chunks=0,canceled=false;
 try {
  const stream=new ReadableStream({pull(controller){chunks++;if(chunks<=1000)controller.enqueue(new Uint8Array(1024).fill(32));else controller.close()},cancel(){canceled=true}});
  const response=await worker.fetch(new Request('https://test.invalid/api/trial/start',{method:'POST',body:stream,duplex:'half',headers:{'Content-Type':'application/json'}}),env);
  assert.equal(response.status,413);assert.equal(canceled,true);assert.ok(chunks<100);
 }finally{env.DB.close()}
});
