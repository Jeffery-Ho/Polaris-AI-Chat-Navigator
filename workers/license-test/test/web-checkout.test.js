import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {database} from './d1.js';
import {hash} from '../src/crypto.js';

const site='https://polaris-ai.work';
function environment(){return {DB:database(),LICENSE_HASH_SECRET:'hash-secret-only-used-by-tests-123456789',LICENSE_DELIVERY_ENCRYPTION_KEY:'encryption-key-only-used-by-tests-123456789',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_PRICE_PRO_PROMO:'price_promo',STRIPE_PRICE_PRO_DEFAULT:'price_default',PUBLIC_APP_URL:site,ALLOWED_ORIGINS:`${site},http://127.0.0.1:4317`}}
async function request(env,path,data,headers={Origin:site}){const r=await worker.fetch(new Request(`https://test.invalid${path}`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)}),env);return {status:r.status,data:await r.json()}}

function mockStripe(t,state){
 t.mock.method(globalThis,'fetch',async(input,options)=>{const url=new URL(input);let value;
  if(url.pathname==='/v1/prices/price_promo')value={id:'price_promo',livemode:false,active:true,currency:'usd',unit_amount:1290,type:'one_time'};
  else if(url.pathname==='/v1/checkout/sessions'){state.body=new URLSearchParams(options.body);state.purchaseId=state.body.get('metadata[purchaseId]');state.sessions=(state.sessions||0)+1;const id=state.sessions===1?'cs_test_web':`cs_test_web_${state.sessions}`;value={id,livemode:false,url:`https://checkout.stripe.com/c/pay/${id}`}}
  else if(url.pathname==='/v1/checkout/sessions/cs_test_web')value={id:'cs_test_web',livemode:false,mode:'payment',metadata:{purchaseId:state.purchaseId},payment_status:state.paid?'paid':'unpaid',status:state.paid?'complete':'open',payment_intent:'pi_web',amount_total:1290,currency:'usd',customer_details:{email:'buyer@example.com'}};
  else if(url.pathname==='/v1/payment_intents/pi_web')value={livemode:false,status:state.paid?'succeeded':'processing',latest_charge:{refunded:state.refunded,disputed:false,amount_refunded:state.refunded?1290:0}};
  else throw new Error(`Unexpected request: ${url.href}`);return Response.json(value)});
}
async function event(env,id,purchaseId,type='checkout.session.completed'){const object=type==='charge.refunded'?{payment_intent:'pi_web'}:{id:'cs_test_web',metadata:{purchaseId}};const raw=JSON.stringify({id,type,livemode:false,data:{object}}),ts=Math.floor(Date.now()/1000);return worker.fetch(new Request('https://test.invalid/api/stripe/webhook',{method:'POST',body:raw,headers:{'Stripe-Signature':`t=${ts},v1=${await hash(env.STRIPE_WEBHOOK_SECRET,`${ts}.${raw}`)}`}}),env)}

test('website checkout sells the welcome price and returns to the requesting site',async(t)=>{
 const env=environment(),state={};mockStripe(t,state);
 try{
  assert.equal((await request(env,'/api/checkout/web-session',{planId:'pro'},{})).data.error,'origin_required');
  assert.equal((await request(env,'/api/checkout/web-session',{planId:'pro'},{Origin:'https://attacker.invalid'})).status,403);
  assert.equal((await request(env,'/api/checkout/web-session',{planId:'pro',expectedAmount:1999})).status,409);
  const checkout=await request(env,'/api/checkout/web-session',{planId:'pro',expectedAmount:1290,priceId:'attacker',amount:1});
  assert.equal(checkout.status,200);assert.equal(checkout.data.amount,1290);
  assert.equal(state.body.get('line_items[0][price]'),'price_promo');assert.equal(state.body.get('metadata[channel]'),'web');
  assert.equal(state.body.get('success_url'),`${site}/checkout-return/?result=success&purchase=${checkout.data.purchaseId}`);
  const local=await request(env,'/api/checkout/web-session',{planId:'pro'},{Origin:'http://127.0.0.1:4317'});
  assert.ok(state.body.get('cancel_url').startsWith('http://127.0.0.1:4317/checkout-return/?result=cancel&purchase='));assert.equal(local.status,200);
 }finally{env.DB.close()}
});

test('only the purchasing browser claim can read a paid website license, never before payment or after refund',async(t)=>{
 const env=environment(),state={paid:false,refunded:false};mockStripe(t,state);
 try{
  const {data:checkout}=await request(env,'/api/checkout/web-session',{planId:'pro'});
  const claim={purchaseId:checkout.purchaseId,claimToken:checkout.claimToken};
  assert.deepEqual((await request(env,'/api/web-purchases/claim',claim)).data,{status:'pending'});
  assert.equal((await request(env,'/api/web-purchases/claim',{...claim,claimToken:'x'.repeat(43)})).status,401);
  state.paid=true;assert.equal((await event(env,'evt_web_paid',checkout.purchaseId)).status,200);
  const paid=await request(env,'/api/web-purchases/claim',claim);assert.equal(paid.data.status,'paid');assert.match(paid.data.licenseKey,/^POL-[a-f0-9]{64}$/);
  assert.equal((await request(env,'/api/web-purchases/claim',claim)).data.licenseKey,paid.data.licenseKey);
  // The key redeems in the extension like any other license.
  const install={installationId:'installation-web',installationToken:'test-installation-secret-at-least-32-chars'};
  await request(env,'/api/trial/start',install,{'X-Installation-Token':install.installationToken});
  const redeemed=await request(env,'/api/licenses/redeem',{installationId:install.installationId,licenseKey:paid.data.licenseKey},{'X-Installation-Token':install.installationToken});
  assert.equal(redeemed.status,200);assert.equal(redeemed.data.entitlement.status,'active');
  // Extension-only claim routes do not accept a website purchase.
  assert.equal((await request(env,'/api/licenses/claim',{...claim,installationId:install.installationId},{'X-Installation-Token':install.installationToken})).status,401);
  state.refunded=true;assert.equal((await event(env,'evt_web_refund',checkout.purchaseId,'charge.refunded')).status,200);
  assert.deepEqual((await request(env,'/api/web-purchases/claim',claim)).data,{status:'failed'});
 }finally{env.DB.close()}
});

test('extension purchases cannot be read through the website claim route',async(t)=>{
 const env=environment(),state={};mockStripe(t,state);
 try{
  const install={installationId:'installation-ext',installationToken:'test-installation-secret-at-least-32-chars'},headers={'X-Installation-Token':install.installationToken};
  await request(env,'/api/trial/start',install,headers);
  const {data}=await request(env,'/api/checkout/session',{planId:'pro',installationId:install.installationId},headers);
  assert.equal(state.body.get('success_url'),`${site}/checkout-return/?result=success`);
  assert.equal((await request(env,'/api/web-purchases/claim',{purchaseId:data.purchaseId,claimToken:data.claimToken})).status,401);
 }finally{env.DB.close()}
});

test('license email prefers the Cloudflare Email Sending binding',async(t)=>{
 const env=environment(),state={paid:true,refunded:false},sent=[];mockStripe(t,state);
 env.EMAIL={send:async(message)=>{sent.push(message);return {messageId:'msg_fixture'}}};env.EMAIL_FROM_ADDRESS='license@polaris-ai.work';env.SUPPORT_EMAIL='support@polaris-ai.work';
 try{
  const {data:checkout}=await request(env,'/api/checkout/web-session',{planId:'pro'});
  await event(env,'evt_mail_paid',checkout.purchaseId);
  await worker.scheduled({},env);await worker.scheduled({},env);
  assert.equal(sent.length,1);assert.equal(sent[0].to,'buyer@example.com');assert.deepEqual(sent[0].from,{email:'license@polaris-ai.work',name:'Polaris'});
  assert.equal(sent[0].replyTo,'support@polaris-ai.work');assert.match(sent[0].text,/POL-[a-f0-9]{64}/);assert.match(sent[0].html,/Redeem license/);
 }finally{env.DB.close()}
});
