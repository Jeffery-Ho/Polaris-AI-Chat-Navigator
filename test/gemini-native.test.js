import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createConversationIndex } from '../src/conversation-index.js';
import { resolveGeminiLocation } from '../src/gemini-native.js';
async function outline(messages) {
 const index=createConversationIndex({platform:'gemini'});
 await index.ingest({messages:messages.map(([id,role,text])=>({id,author:{role},content:{content_type:'text',parts:[text]}})),page_info:{has_previous_page:false,has_next_page:false}});
 return index.getOutline();
}
test('native IDs disambiguate identical prompts and ignore button labels',async()=>{
 const tree=await outline([['gemini:r_one:user','user','继续'],['gemini:r_two:user','user','继续']]);
 const dom=new JSDOM('<div class="conversation-container" id="r_one"><user-query><div class="query-text">继续<button>Copy</button></div></user-query></div><div class="conversation-container" id="r_two"><user-query><div class="query-text">继续</div></user-query></div>');
 try{assert.equal(resolveGeminiLocation(dom.window.document,tree,'index:gemini:r_two:user').element.closest('.conversation-container').id,'r_two');}finally{dom.window.close();}
});
test('tables and repeated headings locate their own native elements',async()=>{
 const tree=await outline([['gemini:r_one:assistant','assistant','## Same\n\nOne\n\n## Same\n\nTwo\n\n| A | B |\n|---|---|\n| 1 | 2 |']]);
 const dom=new JSDOM('<div class="conversation-container" id="r_one"><model-response><message-content><h2>Same</h2><p>One</p><h2>Same</h2><p>Two</p><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table></message-content></model-response></div>');
 try{
 const keys=tree.items.filter(i=>i.title==='Same');
 assert.equal(resolveGeminiLocation(dom.window.document,tree,keys[1].markerKey).element,dom.window.document.querySelectorAll('h2')[1]);
 const tableKey=[...tree.targets].find(([,target])=>target.blockType==='table')[0];
 assert.equal(resolveGeminiLocation(dom.window.document,tree,tableKey).element.tagName,'TABLE');
 }finally{dom.window.close();}
});

test('Gemini native containers expose the response id without the RPC r_ prefix',async()=>{
 const tree=await outline([['gemini:r_9ff7afa37e937396:user','user','继续'],['gemini:r_other:user','user','继续']]);
 const dom=new JSDOM('<div class="conversation-container" id="9ff7afa37e937396"><user-query><div class="query-content"><h5>You said 继续</h5><div class="query-text"><p class="query-text-line">继续</p></div></div></user-query></div>');
 try{assert.equal(resolveGeminiLocation(dom.window.document,tree,'index:gemini:r_9ff7afa37e937396:user').element.closest('.conversation-container').id,'9ff7afa37e937396');}finally{dom.window.close();}
});
