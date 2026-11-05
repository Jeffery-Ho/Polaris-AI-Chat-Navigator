import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { installGeminiIndexBridge } from '../public/src/gemini-index-bridge.js';
const tick = (ms=20) => new Promise(resolve=>setTimeout(resolve,ms));
const record = (text='answer') => [['c_test','r_one'],null,[['question']],[[['rc_one',[text]]]]];
const batch = (payload, rpc='hNvQHb') => Response.json([['wrb.fr',rpc,JSON.stringify(payload)]]);
function setup(handler, fakeXHR = false) {
 const dom=new JSDOM('<a href="https://accounts.google.com/SignOutOptions" aria-label="Google Account: Person (person@example.test)"></a>',{url:'https://gemini.google.com/u/1/app/test'});
 const win=dom.window; const events=[];const calls=[];
 Object.defineProperty(win.crypto,'subtle',{value:webcrypto.subtle});
 win.WIZ_global_data={SNlM0e:'secret-token',FdrFJe:'private-session'};
 win.postMessage=data=>events.push(data);
 win.fetch=(url,init)=>{calls.push({url,init});return handler(url,init,calls);};
 if (fakeXHR) win.XMLHttpRequest=class extends win.EventTarget { open(){} send(){} };
 const original=win.fetch;const dispose=installGeminiIndexBridge(win);
 function command(command){win.dispatchEvent(new win.MessageEvent('message',{source:win,origin:win.location.origin,data:{type:'polaris-gemini-command',requestId:'session',command}}));}
 return{win,events,calls,original,command,close(){dispose();win.close();}};
}
test('signed-in reads retain account routing, incremental flags and hashed cache identity',async()=>{
 const s=setup(async()=>batch([[record()],null]));try{
  s.command('start');await tick();
  assert.ok(s.events.some(e=>e.event==='complete'));
  assert.match(s.events.find(e=>e.event==='scope').scope,/^[a-f0-9]{64}$/);
  assert.equal(new URL(s.calls[0].url,'https://gemini.google.com').searchParams.get('authuser'),'1');
  assert.equal(s.events.find(e=>e.event==='page').replace,true);
  assert.equal(JSON.stringify(s.events).includes('secret-token'),false);
  assert.equal(JSON.stringify(s.events).includes('person@example'),false);
 }finally{s.close();}
});
test('native generation invalidates the index immediately and refreshes after stream completion',async()=>{
 let resolveStream;let version=1;
 const s=setup(async url=>String(url).includes('StreamGenerate')?new Promise(resolve=>{resolveStream=resolve;}):batch([[record('answer '+version)],null]));try{
  s.command('start');await tick();
  const native=s.win.fetch('/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate',{method:'POST'});
  assert.equal(s.events.at(-1).event,'dirty');assert.equal(s.events.at(-1).streaming,true);
  version=2;resolveStream(new Response('completed'));await native;await tick(800);
  const pages=s.events.filter(e=>e.event==='page');
  assert.equal(pages.length,2);assert.equal(pages[1].payload.messages[1].content.parts[0],'answer 2');
 }finally{s.close();}
});
test('rate limit reports Retry-After and disposing restores host fetch',async()=>{
 const s=setup(async()=>new Response('',{status:429,headers:{'Retry-After':'10'}}));try{
  s.command('start');await tick();
  const error=s.events.find(e=>e.event==='error');assert.equal(error.reason,'http-429');assert.ok(error.retryAt>Date.now()+8000);
 }finally{s.close();assert.equal(s.win.fetch,s.original);}
});
test('cooldown blocks restarted readers and native-triggered refreshes, then resumes once',async()=>{
 let until=Date.now()+1100;let rpcCalls=0;
 const s=setup(async url=>{
  if(String(url).includes('StreamGenerate'))return new Response('done');
  rpcCalls++;
  return rpcCalls===1?new Response('',{status:429,headers:{'Retry-After':'1.1'}}):batch([[record()],null]);
 });try{
  s.command('start');await tick();until=s.events.find(e=>e.event==='error').retryAt;
  s.command('stop');s.command('start');await tick();assert.equal(rpcCalls,1);
  await s.win.fetch('/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate',{method:'POST'});
  await tick(800);assert.equal(rpcCalls,1,'native generation must not bypass Retry-After');
  await tick(Math.max(0,until-Date.now())+80);
  assert.equal(rpcCalls,2);assert.equal(s.events.at(-1).event,'complete');
 }finally{s.close();}
});
test('late server responses cannot escape a stopped session',async()=>{
 let release; const s=setup(()=>new Promise(resolve=>{release=resolve;}));try{
  s.command('start');await tick();s.command('stop');release(batch([[record()],null]));await tick();
  assert.equal(s.events.some(e=>e.event==='page'||e.event==='complete'),false);
 }finally{s.close();}
});

test('native history scrolling does not invalidate a complete index or trigger a full reread',async()=>{
 const s=setup(async()=>batch([[record()],null]));try{
  s.command('start');await tick();const completed=s.events.filter(e=>e.event==='complete').length;
  await s.win.fetch('/_/BardChatUi/data/batchexecute?rpcids=hNvQHb',{method:'POST',body:new URLSearchParams({'f.req':JSON.stringify([[['hNvQHb',JSON.stringify(['c_test',20,'older-page']),null,'generic']]])})});
  await tick(750);
  assert.equal(s.events.some(e=>e.event==='dirty'),false);
  assert.equal(s.events.filter(e=>e.event==='complete').length,completed);
 }finally{s.close();}
});

test('XHR generation also refreshes without changing native response handling',async()=>{
 const s=setup(async()=>batch([[record()],null]),true);try{
  s.command('start');await tick();
  const request=new s.win.XMLHttpRequest();
  request.open('POST','/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate');request.send('native body');
  assert.equal(s.events.at(-1).streaming,true);
  request.dispatchEvent(new s.win.Event('loadend'));await tick(800);
  assert.equal(s.events.filter(e=>e.event==='complete').length,2);
 }finally{s.close();}
});

test('public shares retain the page token when the browser is already signed in',async()=>{
 const s=setup(async()=>batch([[null,[record()], [null,'Shared test'], 'share-id']], 'ujx1Bf'));try{
  s.win.history.replaceState({},'', '/share/share-id');
  s.command('start');await tick();
  assert.equal(s.events.some(e=>e.event==='complete'),true);
  assert.equal(new URLSearchParams(s.calls[0].init.body).get('at'),'secret-token');
  assert.equal(JSON.stringify(s.events).includes('secret-token'),false);
 }finally{s.close();}
});
