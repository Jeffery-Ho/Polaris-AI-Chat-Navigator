import test from 'node:test';
import assert from 'node:assert/strict';
import { createBillingMessageHandler } from '../src/billing-messages.js';

test('billing mutations require a trusted extension page; content can only read public access',async()=>{
 let checkouts=0;const service={getView:async()=>({tier:'trial'}),checkout:async()=>{checkouts++;return {checkoutUrl:'https://checkout.stripe.com/c/pay/cs_test_a'}}};const tabs=[];
 const chrome={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path},tabs:{create:async data=>tabs.push(data)}};
 const handle=createBillingMessageHandler({chrome,service});
 assert.deepEqual(await handle({action:'checkout'},{id:'test',url:'https://chatgpt.com/c/one'}),{ok:false});
 assert.deepEqual(await handle({action:'get'},{id:'foreign',url:'chrome-extension://test/sidepanel.html'}),{ok:false});
 assert.equal((await handle({action:'access'},{id:'test',url:'https://chatgpt.com/c/one'})).view.tier,'trial');
 assert.equal((await handle({action:'checkout'},{id:'test',url:'chrome-extension://test/sidepanel.html'})).ok,true);
 assert.equal(checkouts,1);assert.equal(tabs.length,1);
});

test('known license errors reach the sidepanel and unknown ones stay generic',async()=>{
 const limit=Object.assign(new Error('activation_limit_reached'),{activations:[{id:'act-a'}]});
 const calls=[];
 const service={
  redeem:async key=>{if(key==='full')throw limit;if(key==='bad')throw new Error('invalid_license');throw new Error('D1_ERROR: secret detail');},
  release:async args=>{calls.push(['release',args]);return {tier:'trial'};},
  deactivate:async id=>{calls.push(['deactivate',id]);return {tier:'pro'};}
 };
 const chrome={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path},tabs:{create:async()=>{}}};
 const handle=createBillingMessageHandler({chrome,service});const page={id:'test',url:'chrome-extension://test/sidepanel.html'};
 assert.deepEqual(await handle({action:'redeem',licenseKey:'full'},page),{ok:false,error:'activation_limit_reached',activations:[{id:'act-a'}]});
 assert.deepEqual(await handle({action:'redeem',licenseKey:'bad'},page),{ok:false,error:'invalid_license'});
 assert.deepEqual(await handle({action:'redeem',licenseKey:'x'},page),{ok:false,error:'billing_unavailable'});
 await handle({action:'release',activationId:'act-a',licenseKey:'POL-1'},page);
 await handle({action:'deactivate',activationId:'act-b'},page);
 assert.deepEqual(calls,[['release',{activationId:'act-a',licenseKey:'POL-1'}],['deactivate','act-b']]);
});
