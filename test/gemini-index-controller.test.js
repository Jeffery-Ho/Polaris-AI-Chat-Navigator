import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createGeminiIndexController } from '../src/gemini-index-controller.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
function setup() {
  const dom=new JSDOM('<title>Test - Google Gemini</title>',{url:'https://gemini.google.com/app/test'});
  const win=dom.window;
  const controller=createGeminiIndexController({window:win,bridgeUrl:'https://extension.test/bridge.js',onChange(){}});
  controller.configure(true);
  const send=(event,extra={},session=controller.snapshot().generation,path=win.location.pathname)=>win.dispatchEvent(new win.MessageEvent('message',{source:win,origin:win.location.origin,data:{type:'polaris-gemini-result',requestId:session,path,event,...extra}}));
  return {win,controller,send,close(){controller.dispose();win.close();}};
}
const payload={messages:[{id:'gemini:a:user',author:{role:'user'},content:{content_type:'text',parts:['hello']}}],page_info:{has_previous_page:false,has_next_page:false}};
test('Gemini lifecycle ingests data and keeps unmounted messages in the native navigation flow',async()=>{
 const s=setup();try{
  s.send('page',{payload});s.send('complete');await tick();
  assert.equal(s.controller.snapshot().count,1);assert.equal(s.controller.snapshot().phase,'complete');
  assert.equal((await s.controller.search('hello')).total,1);
  assert.deepEqual(await s.controller.ensureLocation('index:gemini:a:user',{}), {element:null,reason:'not-mounted'});
  s.controller.configure(false);assert.equal(s.controller.snapshot(),null);
 }finally{s.close();}
});
test('Gemini ignores previous route responses and invalid pages cannot become complete',async()=>{
 const s=setup();try{
  const old=s.controller.snapshot().generation;
  s.win.history.pushState({},'', '/app/next');s.controller.configure(true);
  s.send('page',{payload},old,'/app/test');await tick();assert.equal(s.controller.snapshot().count,0);
  s.send('page',{payload:{broken:true}});s.send('complete');await tick();
  assert.equal(s.controller.snapshot().phase,'error');
 }finally{s.close();}
});

test('Gemini loads an unmounted Maker in the native scroll container', async () => {
 const s=setup();try{
  s.send('page',{payload});s.send('complete');await tick();
  s.win.document.body.innerHTML='<div style="overflow-y:auto"><user-query><div class="query-text">newer message</div></user-query></div>';
  const scroll=s.win.document.body.firstElementChild;
  Object.defineProperties(scroll,{scrollHeight:{value:2000},clientHeight:{value:500}});
  scroll.scrollTop=1000;
  scroll.scrollTo=({top})=>{scroll.scrollTop=top;scroll.querySelector('.query-text').textContent='hello';};
  const result=await s.controller.ensureLocation('index:gemini:a:user',{});
  assert.equal(result.element,scroll.querySelector('.query-text'));
  assert.equal(result.reason,'');assert.equal('readerKey' in result,false);
 }finally{s.close();}
});

test('switching Gemini conversations cancels native loading without switching views', async () => {
 const s=setup();try{
  s.send('page',{payload});s.send('complete');await tick();
  s.win.document.body.innerHTML='<div style="overflow-y:auto"><user-query><div class="query-text">other</div></user-query></div>';
  const scroll=s.win.document.body.firstElementChild;
  Object.defineProperties(scroll,{scrollHeight:{value:2000},clientHeight:{value:500}});scroll.scrollTo=()=>{};
  const pending=s.controller.ensureLocation('index:gemini:a:user',{});
  s.win.history.pushState({},'', '/app/next');s.controller.configure(true);
  assert.deepEqual(await pending,{element:null,reason:'source-changed'});
 }finally{s.close();}
});

test('native readiness waits for a matching message and updates after mounting',async()=>{
 const s=setup();try{
  s.send('page',{payload});s.send('complete');await tick();
  assert.equal(s.controller.snapshot().native.phase,'preparing');
  s.win.document.body.innerHTML='<user-query><div class="query-text">hello</div></user-query>';
  await tick();assert.equal(s.controller.snapshot().native.phase,'ready');
 }finally{s.close();}
});
test('dirty and stale read events cannot leave an obsolete export marked complete',async()=>{
 const s=setup();try{
  s.send('page',{payload,runId:1});s.send('complete',{runId:1});await tick();
  assert.ok(s.controller.exportConversation());
  s.send('dirty',{runId:2,streaming:true});await tick();assert.equal(s.controller.exportConversation(),null);
  s.send('complete',{runId:1});await tick();assert.equal(s.controller.snapshot().phase,'loading');
 }finally{s.close();}
});
test('incremental older pages preserve the newest messages',async()=>{
 const s=setup();try{
  s.send('page',{payload});
  s.send('page',{payload:{...payload,messages:[{...payload.messages[0],id:'gemini:older:user',content:{content_type:'text',parts:['older']}}]},older:true,replace:false});
  s.send('complete');await tick();assert.equal(s.controller.snapshot().count,2);
  assert.deepEqual(s.controller.exportConversation().messages.map(m=>m.markdown),['older','hello']);
 }finally{s.close();}
});

test('verified Gemini snapshots persist with the account lease and cannot be overwritten by a dirty run',async()=>{
 const dom=new JSDOM('<user-query><div class="query-text">hello</div></user-query>',{url:'https://gemini.google.com/app/test'});
 const win=dom.window;const writes=[];
 const cache={read:async()=>({lease:'lease',snapshot:null}),write:async(...args)=>writes.push(args)};
 const controller=createGeminiIndexController({window:win,bridgeUrl:'https://extension.test/bridge.js',onChange(){},cache});
 try{
 controller.configure(true);
 const send=(event,extra={})=>win.dispatchEvent(new win.MessageEvent('message',{source:win,origin:win.location.origin,data:{type:'polaris-gemini-result',requestId:controller.snapshot().generation,path:win.location.pathname,event,...extra}}));
 send('scope',{scope:'a'.repeat(64)});send('page',{payload});send('complete');await tick();
 assert.equal(controller.snapshot().native.phase,'ready');
 await new Promise(resolve=>setTimeout(resolve,130));
 assert.equal(writes[0][1],'gemini:app:test');assert.equal(writes[0][2],'lease');assert.equal(writes[0][3].records.length,1);
 send('dirty',{streaming:true});await tick();assert.equal(controller.exportConversation(),null);
 }finally{controller.dispose();win.close();}
});

test('native body readiness does not require server wording to match rendered labels',async()=>{
 const s=setup();try{
  s.win.document.body.innerHTML='<user-query><div class="query-content"><h5>You said</h5><div class="query-text">rendered with a different label</div></div></user-query>';
  s.send('page',{payload});s.send('complete');await tick();
  assert.equal(s.controller.snapshot().native.phase,'ready');
  assert.equal((await s.controller.ensureLocation('index:gemini:a:user',{})).reason,'not-mounted');
 }finally{s.close();}
});
