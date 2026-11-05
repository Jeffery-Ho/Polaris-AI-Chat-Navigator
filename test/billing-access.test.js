import test from 'node:test';
import assert from 'node:assert/strict';
import {billingAllowsIndex,billingAllowsPlatform} from '../src/billing-access.js';

test('initialized free access uses only the selected platforms and excludes full indexing',()=>{
 const free={available:true,fullAccess:false,platforms:['chatgpt','claude']};assert.equal(billingAllowsIndex(free),false);assert.equal(billingAllowsPlatform(free,'chatgpt'),true);assert.equal(billingAllowsPlatform(free,'gemini'),false);
 for(const tier of ['trial','pro']){assert.equal(billingAllowsIndex({...free,tier,fullAccess:true}),true);assert.equal(billingAllowsPlatform({...free,tier,fullAccess:true},'gemini'),true)}
 assert.equal(billingAllowsIndex(null),true);assert.equal(billingAllowsPlatform({available:false},'gemini'),true);
});
