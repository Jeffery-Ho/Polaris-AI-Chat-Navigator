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
