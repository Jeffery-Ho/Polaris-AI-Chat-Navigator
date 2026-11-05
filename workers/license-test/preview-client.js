/* Test-only browser adapter. No secret Stripe key belongs in this file. */
class PolarisBillingClient {
 constructor(baseUrl) {
  this.baseUrl=baseUrl;
  const key=`polaris-billing-test:${baseUrl}`;
  this.storageKey=key;
  try{this.session=JSON.parse(localStorage.getItem(key)||'null')}catch{this.session=null}
  if(!this.session){this.session={installationId:crypto.randomUUID(),installationToken:crypto.randomUUID()+crypto.randomUUID()};this.save()}
 }
 save(){localStorage.setItem(this.storageKey,JSON.stringify(this.session))}
 async call(path,data,headers={}){
  const response=await fetch(this.baseUrl+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Installation-Token':this.session.installationToken,...headers},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(15000),cache:'no-store'});
  const result=await response.json();if(!response.ok)throw new Error(result.error||`HTTP ${response.status}`);return result;
 }
 async initialize(){const health=await this.call('/health');if(health.env!=='test')throw new Error('test_environment_required');await this.call('/api/trial/start',this.session);return this.call(`/api/plans?installationId=${encodeURIComponent(this.session.installationId)}`)}
 async checkout(){const result=await this.call('/api/checkout/session',{planId:'pro',installationId:this.session.installationId});const url=new URL(result.checkoutUrl);if(url.origin!=='https://checkout.stripe.com'||!url.pathname.includes('cs_test_'))throw new Error('invalid_test_checkout');this.session.purchase=result;this.save();return result}
 async status(){if(!this.session.purchase)throw new Error('no_pending_purchase');return this.call(`/api/purchases/${encodeURIComponent(this.session.purchase.purchaseId)}/status`,undefined,{Authorization:`Bearer ${this.session.purchase.claimToken}`,'X-Installation-Id':this.session.installationId})}
 async claim(){const result=await this.call('/api/licenses/claim',{...this.session.purchase,installationId:this.session.installationId});this.session.activationToken=result.activationToken;delete this.session.purchase;this.save();return result}
 async redeem(licenseKey){const result=await this.call('/api/licenses/redeem',{licenseKey,installationId:this.session.installationId});this.session.activationToken=result.activationToken;this.save();return result}
 async validate(){if(!this.session.activationToken)return {valid:false};return this.call('/api/licenses/validate',{activationToken:this.session.activationToken})}
 recover(email){return this.call('/api/licenses/recover',{email})}
 async deactivate(){const result=await this.call('/api/licenses/deactivate',{activationToken:this.session.activationToken});delete this.session.activationToken;this.save();return result}
}
