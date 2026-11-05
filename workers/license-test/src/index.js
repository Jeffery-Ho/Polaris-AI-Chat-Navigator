import {randomToken,hash,equal,seal,unseal,verifyWebhook} from './crypto.js';
import {ApiError,stripe} from './stripe.js';
const DAY=86400000, PLAN='pro', json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const stmt=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const one=(env,sql,...args)=>stmt(env,sql,...args).first();
function configured(env){if(!env.DB||!env.LICENSE_HASH_SECRET||env.LICENSE_HASH_SECRET.length<32||!env.LICENSE_DELIVERY_ENCRYPTION_KEY||env.LICENSE_DELIVERY_ENCRYPTION_KEY.length<32)throw new ApiError(503,'test_environment_not_configured');}
function text(value,max=256){if(typeof value!=='string'||!value.trim()||value.length>max)throw new ApiError(400,'invalid_request');return value.trim();}
const installationHash=(env,id)=>hash(env.LICENSE_HASH_SECRET,`installation:${text(id)}`);
const bearer=req=>(req.headers.get('authorization')||'').replace(/^Bearer /,'');
async function readText(req, limit) {
 if(Number(req.headers.get('Content-Length'))>limit)throw new ApiError(413,'request_too_large');
 if(!req.body)return '';
 const reader=req.body.getReader(),decoder=new TextDecoder();let bytes=0,raw='';
 try {
  while(true){
   const {done,value}=await reader.read();if(done)break;
   bytes+=value.byteLength;
   if(bytes>limit){await reader.cancel();throw new ApiError(413,'request_too_large')}
   raw+=decoder.decode(value,{stream:true});
  }
  return raw+decoder.decode();
 }finally{reader.releaseLock()}
}
async function body(req){const raw=await readText(req,16384);try{return JSON.parse(raw)}catch{throw new ApiError(400,'invalid_json')}}
async function installation(env,id,token){
 const idHash=await installationHash(env,id), row=await one(env,'SELECT * FROM polaris_billing_installations WHERE id_hash=?',idHash);
 if(!row||!equal(row.secret_hash,await hash(env.LICENSE_HASH_SECRET,`installation-secret:${text(token)}`)))throw new ApiError(401,'invalid_installation');return row;
}
function entitlement(status='active'){return {plan:PLAN,status,expiresAt:null};}
async function rateLimit(env,req,path){
 const bucket=await hash(env.LICENSE_HASH_SECRET,`rate:${req.headers.get('CF-Connecting-IP')||'local'}:${path}:${Math.floor(Date.now()/60000)}`);
 const row=await stmt(env,'INSERT INTO polaris_billing_rate_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count',bucket,Date.now()+120000).first();
 if(row.count>30)throw new ApiError(429,'rate_limited');
}
async function issueActivation(env,license,install){
 const now=Date.now();await stmt(env,"INSERT INTO polaris_billing_activations(id,license_id,installation_hash,created_at) VALUES(?,?,?,?) ON CONFLICT(license_id,installation_hash) DO NOTHING",crypto.randomUUID(),license.id,install.id_hash,now).run();
 const activation=await one(env,'SELECT * FROM polaris_billing_activations WHERE license_id=? AND installation_hash=?',license.id,install.id_hash);
 const token=await hash(env.LICENSE_HASH_SECRET,`activation:${activation.id}:${activation.generation}`);
 await stmt(env,"UPDATE polaris_billing_activations SET credential_hash=?,status='active',last_validated_at=? WHERE id=? AND generation=?",await hash(env.LICENSE_HASH_SECRET,`credential:${token}`),now,activation.id,activation.generation).run();
 return json({activationToken:token,entitlement:entitlement(),validatedAt:now,offlineUntil:now+DAY});
}
async function purchaseOwner(env,req,id,claimToken,installationId){
 const purchase=await one(env,'SELECT * FROM polaris_billing_purchase_intents WHERE id=?',id);
 if(!purchase||purchase.claim_expires_at<Date.now()||!equal(purchase.claim_hash,await hash(env.LICENSE_HASH_SECRET,`claim:${text(claimToken)}`)))throw new ApiError(401,'invalid_claim');
 const install=await installation(env,installationId,req.headers.get('X-Installation-Token'));
 if(install.id_hash!==purchase.installation_hash)throw new ApiError(401,'invalid_claim');return {purchase,install};
}
async function webhook(env,req){
 if(!env.STRIPE_WEBHOOK_SECRET)throw new ApiError(503,'webhook_not_configured');
 const raw=await readText(req,262144);
 if(!await verifyWebhook(raw,req.headers.get('Stripe-Signature'),env.STRIPE_WEBHOOK_SECRET))throw new ApiError(400,'invalid_signature');
 let event;try{event=JSON.parse(raw)}catch{throw new ApiError(400,'invalid_json')}
 if(event.livemode!==false)throw new ApiError(400,'live_mode_rejected');
 if(await one(env,'SELECT id FROM polaris_billing_stripe_events WHERE id=?',event.id))return json({received:true});
 const relevant=['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','charge.refunded','charge.dispute.created','payment_intent.payment_failed'];
 if(!relevant.includes(event.type))return json({received:true});
 const object=event.data?.object;let purchase;
 if(event.type.startsWith('checkout.session.'))purchase=await one(env,'SELECT * FROM polaris_billing_purchase_intents WHERE session_id=?',object.id);
 else purchase=await one(env,'SELECT * FROM polaris_billing_purchase_intents WHERE payment_intent_id=?',event.type.startsWith('payment_intent.')?object.id:object.payment_intent);
 // A session can be delivered before checkout creation has saved its Stripe ID. Retry safely.
 if(!purchase&&event.type.startsWith('checkout.session.')&&object.metadata?.purchaseId)throw new ApiError(503,'purchase_not_ready');
 if(!purchase)return json({received:true});
 const session=await stripe(env,`checkout/sessions/${encodeURIComponent(purchase.session_id)}`);
 if(session.metadata?.purchaseId!==purchase.id||session.mode!=='payment')throw new ApiError(400,'purchase_mismatch');
 let status='pending',intent;
 if(session.payment_intent){intent=await stripe(env,`payment_intents/${encodeURIComponent(session.payment_intent)}?expand[]=latest_charge`);}
 const refunded=intent?.latest_charge?.refunded||intent?.latest_charge?.disputed||Number(intent?.latest_charge?.amount_refunded)>0;
 if(refunded)status='revoked';
 else if(session.payment_status==='paid'&&intent?.status==='succeeded')status='paid';
 else if(session.status==='expired')status='canceled';
 else if(event.type==='checkout.session.async_payment_failed'||event.type==='payment_intent.payment_failed')status='failed';
 const actions=[stmt(env,"UPDATE polaris_billing_purchase_intents SET status=CASE WHEN status='revoked' THEN 'revoked' ELSE ? END,payment_intent_id=? WHERE id=?",status,session.payment_intent||null,purchase.id)];
 if(status==='paid'){
  if(session.amount_total!==purchase.amount||session.currency!=='usd')throw new ApiError(400,'amount_mismatch');
  const existing=await one(env,'SELECT id FROM polaris_billing_licenses WHERE purchase_id=?',purchase.id);
  if(!existing){
   const email=text(session.customer_details?.email,320).toLowerCase(),key=`POL-${randomToken()}`,id=crypto.randomUUID();
   actions.push(stmt(env,"INSERT INTO polaris_billing_licenses(id,purchase_id,key_hash,delivery_cipher,email_hash,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM polaris_billing_purchase_intents WHERE id=? AND status='paid') ON CONFLICT(purchase_id) DO NOTHING",id,purchase.id,await hash(env.LICENSE_HASH_SECRET,`license:${key}`),await seal(env.LICENSE_DELIVERY_ENCRYPTION_KEY,{email,key}),await hash(env.LICENSE_HASH_SECRET,`email:${email}`),Date.now(),purchase.id));
   actions.push(stmt(env,"INSERT INTO polaris_billing_email_deliveries(id,license_id,next_attempt_at,created_at) SELECT ?,id,?,? FROM polaris_billing_licenses WHERE id=?",crypto.randomUUID(),Date.now(),Date.now(),id));
  }
 }else if(status==='revoked')actions.push(stmt(env,"UPDATE polaris_billing_licenses SET status='revoked' WHERE purchase_id=?",purchase.id));
 actions.push(stmt(env,'INSERT INTO polaris_billing_stripe_events(id,type,processed_at) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING',event.id,event.type,Date.now()));
 await env.DB.batch(actions);return json({received:true});
}
async function route(req,env){
 const url=new URL(req.url),path=url.pathname;
 if(path==='/health'&&req.method==='GET')return json({ok:true,env:'test',version:'0.1.2'});
 const routes=new Set(['/api/trial/start','/api/plans','/api/checkout/session','/api/stripe/webhook','/api/licenses/claim','/api/licenses/redeem','/api/licenses/validate','/api/licenses/recover','/api/licenses/deactivate']);
 if(!routes.has(path)&&!/^\/api\/purchases\/[^/]+\/status$/.test(path))throw new ApiError(404,'not_found');
 configured(env);
 if(path==='/api/stripe/webhook' &&req.method==='POST')return webhook(env,req);
 await rateLimit(env,req,path.replace(/^\/api\/purchases\/[^/]+\/status$/, '/api/purchases/:id/status'));
 if(path==='/api/trial/start'&&req.method==='POST'){
  const data=await body(req),idHash=await installationHash(env,data.installationId),secret=text(data.installationToken);if(secret.length<32)throw new ApiError(400,'invalid_installation_token');
  await stmt(env,'INSERT INTO polaris_billing_installations(id_hash,secret_hash,trial_ends_at,created_at) VALUES(?,?,?,?) ON CONFLICT(id_hash) DO NOTHING',idHash,await hash(env.LICENSE_HASH_SECRET,`installation-secret:${secret}`),Date.now()+7*DAY,Date.now()).run();
  const row=await installation(env,data.installationId,secret);return json({trialEndsAt:row.trial_ends_at,offerEndsAt:row.trial_ends_at,serverTime:Date.now()});
 }
 if(path==='/api/plans'&&req.method==='GET'){
  const row=await installation(env,url.searchParams.get('installationId'),req.headers.get('X-Installation-Token'));
  return json({serverTime:Date.now(),trialEndsAt:row.trial_ends_at,offerEndsAt:row.trial_ends_at,plans:[{id:PLAN,currency:'usd',amount:row.trial_ends_at>Date.now()?1290:1999,originalAmount:1999,billing:'one_time',maxActivations:null}]});
 }
 if(path==='/api/checkout/session'&&req.method==='POST'){
  const data=await body(req);if(data.planId!==PLAN)throw new ApiError(400,'invalid_plan');
  const row=await installation(env,data.installationId,req.headers.get('X-Installation-Token'));
  const promo=row.trial_ends_at>Date.now(),priceId=promo?env.STRIPE_PRICE_PRO_PROMO:env.STRIPE_PRICE_PRO_DEFAULT;
  if(!priceId)throw new ApiError(503,'prices_not_configured');
  const amount=promo?1290:1999;
  if(data.expectedAmount!==undefined&&data.expectedAmount!==amount)throw new ApiError(409,'price_changed');
  const price=await stripe(env,`prices/${encodeURIComponent(priceId)}`);
  if(price.active!==true||price.currency!=='usd'||price.unit_amount!==amount||price.type!=='one_time')throw new ApiError(503,'price_configuration_mismatch');
  const publicUrl=new URL(env.PUBLIC_APP_URL);if(publicUrl.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(publicUrl.hostname))throw new ApiError(503,'invalid_return_origin');
  const id=crypto.randomUUID(),claim=randomToken();
  await stmt(env,'INSERT INTO polaris_billing_purchase_intents(id,installation_hash,claim_hash,claim_expires_at,amount,created_at) VALUES(?,?,?,?,?,?)',id,row.id_hash,await hash(env.LICENSE_HASH_SECRET,`claim:${claim}`),Date.now()+DAY,amount,Date.now()).run();
  const session=await stripe(env,'checkout/sessions',{method:'POST',idempotencyKey:id,body:{mode:'payment','line_items[0][price]':priceId,'line_items[0][quantity]':'1','metadata[purchaseId]':id,success_url:new URL('/checkout-return?result=success',publicUrl).href,cancel_url:new URL('/checkout-return?result=cancel',publicUrl).href}});
  if(!session.id?.startsWith('cs_test_')||new URL(session.url).origin!=='https://checkout.stripe.com')throw new ApiError(502,'invalid_test_checkout');
  await stmt(env,'UPDATE polaris_billing_purchase_intents SET session_id=? WHERE id=?',session.id,id).run();return json({checkoutUrl:session.url,purchaseId:id,claimToken:claim});
 }
 const match=path.match(/^\/api\/purchases\/([^/]+)\/status$/);
 if(match&&req.method==='GET'){
  const {purchase}=await purchaseOwner(env,req,match[1],bearer(req),req.headers.get('X-Installation-Id'));
  const license=await one(env,'SELECT status FROM polaris_billing_licenses WHERE purchase_id=?',purchase.id);
  return json({status:purchase.status==='revoked'?'failed':purchase.status,activationReady:purchase.status==='paid'&&license?.status==='active'});
 }
 if(path==='/api/licenses/claim'&&req.method==='POST'){
  const data=await body(req),{purchase,install}=await purchaseOwner(env,req,data.purchaseId,data.claimToken,data.installationId);
  const license=await one(env,"SELECT * FROM polaris_billing_licenses WHERE purchase_id=? AND status='active'",purchase.id);
  if(purchase.status!=='paid'||!license)throw new ApiError(409,'activation_not_ready');return issueActivation(env,license,install);
 }
 if(path==='/api/licenses/redeem'&&req.method==='POST'){
  const data=await body(req),install=await installation(env,data.installationId,req.headers.get('X-Installation-Token'));
  const license=await one(env,"SELECT * FROM polaris_billing_licenses WHERE key_hash=? AND status='active'",await hash(env.LICENSE_HASH_SECRET,`license:${text(data.licenseKey)}`));
  if(!license)throw new ApiError(400,'invalid_license');return issueActivation(env,license,install);
 }
 if(['/api/licenses/validate','/api/licenses/deactivate'].includes(path)&&req.method==='POST'){
  const data=await body(req),activation=await one(env,"SELECT a.*,l.status AS license_status FROM polaris_billing_activations a JOIN polaris_billing_licenses l ON l.id=a.license_id WHERE a.credential_hash=?",await hash(env.LICENSE_HASH_SECRET,`credential:${text(data.activationToken)}`));
  if(!activation||activation.status!=='active'||activation.license_status!=='active')return json({valid:false,entitlement:entitlement('revoked')});
  if(path.endsWith('deactivate')){await stmt(env,"UPDATE polaris_billing_activations SET status='revoked',credential_hash=NULL,generation=generation+1 WHERE id=? AND credential_hash=?",activation.id,activation.credential_hash).run();return json({deactivated:true})}
  await stmt(env,'UPDATE polaris_billing_activations SET last_validated_at=? WHERE id=?',Date.now(),activation.id).run();return json({valid:true,entitlement:entitlement(),validatedAt:Date.now(),offlineUntil:Date.now()+DAY});
 }
 if(path==='/api/licenses/recover'&&req.method==='POST'){
  const data=await body(req),email=text(data.email,320).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new ApiError(400,'invalid_email');
  const emailHash=await hash(env.LICENSE_HASH_SECRET,`email:${email}`);
  // One queued email per license per hour. Identical response for unknown and known emails.
  await stmt(env,"INSERT INTO polaris_billing_email_deliveries(id,license_id,next_attempt_at,created_at) SELECT lower(hex(randomblob(16))),l.id,?,? FROM polaris_billing_licenses l WHERE l.email_hash=? AND l.status='active' AND NOT EXISTS(SELECT 1 FROM polaris_billing_email_deliveries e WHERE e.license_id=l.id AND e.created_at>?)",Date.now(),Date.now(),emailHash,Date.now()-3600000).run();
  return json({message:'If an eligible purchase exists, recovery instructions will be sent.'});
 }
 throw new ApiError(404,'not_found');
}
export default {
 async fetch(req,env){
  const origin=req.headers.get('Origin'),allowed=(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim());
  if(origin&&!allowed.includes(origin))return json({error:'origin_not_allowed'},403);
  let response;
  try{response=req.method==='OPTIONS'?new Response(null,{status:204}):await route(req,env)}catch(error){response=json({error:error instanceof ApiError?error.code:'service_unavailable'},error instanceof ApiError?error.status:503)}
  if(origin){response.headers.set('Access-Control-Allow-Origin',origin);response.headers.set('Vary','Origin');response.headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');response.headers.set('Access-Control-Allow-Headers','Content-Type, Authorization, X-Installation-Token, X-Installation-Id')}
  return response;
 },
 async scheduled(_controller,env){
  configured(env);await stmt(env,'DELETE FROM polaris_billing_rate_limits WHERE expires_at<?',Date.now()).run();
  if(!env.EMAIL_PROVIDER_API_KEY||!env.EMAIL_FROM_ADDRESS)return;
  const jobs=await stmt(env,"SELECT e.*,l.delivery_cipher,l.status AS license_status FROM polaris_billing_email_deliveries e JOIN polaris_billing_licenses l ON l.id=e.license_id WHERE e.status='pending' AND e.next_attempt_at<=? LIMIT 20",Date.now()).all();
  for(const job of jobs.results){
   if(job.license_status!=='active'){await stmt(env,"UPDATE polaris_billing_email_deliveries SET status='canceled' WHERE id=?",job.id).run();continue;}
   try{
    const payload=await unseal(env.LICENSE_DELIVERY_ENCRYPTION_KEY,job.delivery_cipher);
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.EMAIL_PROVIDER_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':job.id},body:JSON.stringify({from:env.EMAIL_FROM_ADDRESS,to:[payload.email],subject:'Your Polaris Pro License',text:`Polaris Pro — lifetime access\n\nYour license: ${payload.key}\n\nOpen Polaris Settings → Redeem License on your devices.\nSupport: ${env.SUPPORT_EMAIL||env.EMAIL_FROM_ADDRESS}`})});
    if(!response.ok)throw new Error('email_unavailable');
    await stmt(env,"UPDATE polaris_billing_email_deliveries SET status='sent',attempt_count=attempt_count+1 WHERE id=?",job.id).run();
   }catch{await stmt(env,'UPDATE polaris_billing_email_deliveries SET attempt_count=attempt_count+1,next_attempt_at=? WHERE id=?',Date.now()+Math.min(DAY,60000*2**Math.min(job.attempt_count,10)),job.id).run()}
  }
 }
};
