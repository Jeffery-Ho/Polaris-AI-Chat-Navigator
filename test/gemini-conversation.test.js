import test from 'node:test';
import assert from 'node:assert/strict';
import { geminiRoute, decodeGeminiRpc, readGeminiConversation, geminiMessages } from '../public/src/gemini-conversation.js';
import { createConversationIndex } from '../src/conversation-index.js';
const turn = (id, parent = null) => [['c_test', id], parent, [['Question '+id]], [[['rc_'+id, ['## Answer '+id]]]]];
test('Gemini routes preserve account and separate shares from signed-in conversations', () => {
  assert.deepEqual(geminiRoute('https://gemini.google.com/u/1/app/test'), {account:'1',kind:'app',id:'test'});
  assert.equal(geminiRoute('https://other.test/app/test'), null);
  assert.equal(geminiRoute('https://gemini.google.com/app'), null);
});
test('RPC envelopes reject missing payloads', () => {
  assert.deepEqual(decodeGeminiRpc(")]}'\n123\n"+JSON.stringify([['wrb.fr','ujx1Bf','[1]']]),'ujx1Bf'), [1]);
  assert.throws(() => decodeGeminiRpc(JSON.stringify([['wrb.fr','ujx1Bf',null]]),'ujx1Bf'));
});
test('signed-in pagination deduplicates overlaps and restores chronology', async () => {
  const pages = []; const cursors = [];
  await readGeminiConversation({route:{kind:'app',id:'test'},rpc:async (id,args) => {
    assert.equal(id,'hNvQHb'); cursors.push(args[2]);
    return args[2] ? [[turn('a')],null] : [[turn('b'),turn('a')],'next'];
  },onPage:p=>pages.push(p)});
  assert.deepEqual(cursors,[null,'next']);
  assert.deepEqual(pages[0].messages.map(m=>m.id),['gemini:a:user','gemini:a:assistant','gemini:b:user','gemini:b:assistant']);
  assert.equal(pages[1].messages.length,0);
});
test('repeated cursors fail instead of declaring a partial conversation complete', async () => {
  await assert.rejects(readGeminiConversation({route:{kind:'app',id:'test'},rpc:async()=>[[turn('a')],'same'],onPage:()=>{}}),/repeated-cursor/);
});
test('candidate selection follows the continued branch', () => {
  const first=turn('a'); first[3][0].push(['chosen',['continued answer']]);
  assert.equal(geminiMessages([first,turn('b',['c_test','a','chosen'])])[1].content.parts[0],'continued answer');
});
test('Gemini index respects its recognition settings and exposes full-text search', async () => {
  const index=createConversationIndex({platform:'gemini'});
  await index.ingest({messages:geminiMessages([turn('a')]),page_info:{has_previous_page:false,has_next_page:false}});index.finish();
  assert.equal(index.status().count,2);
  assert.equal(index.getOutline({enabledLevelsByPlatform:{gemini:[],chatgpt:[2]}}).items.filter(i=>i.type==='ai').length,0);
  assert.equal((await index.search('Answer')).total,1);
});
test('share identity must match the requested snapshot', async () => {
  await assert.rejects(readGeminiConversation({route:{kind:'share',id:'expected'},rpc:async()=>[[null,[turn('a')],null,'wrong']],onPage:()=>{}}),/wrong-conversation/);
});

test('pending Gemini turns retain the user message without inventing an answer', () => {
  const pending=turn('pending');pending[3]=null;
  assert.deepEqual(geminiMessages([pending]).map(m=>m.author.role),['user']);
});
test('Gemini preserves image-only uploads and filenames from attachment records', () => {
  const item=turn('upload');item[2][0][0]=null;
  const image=[null,1,'photo.png','https://lh3.googleusercontent.com/image',null,null,null,null,1,null,null,'image/png',null,null,null,[100,200]];
  item[2][0][4]=[[null,null,null,[image]]];
  const messages=geminiMessages([item]);
  assert.equal(messages[0].content.content_type,'multimodal_text');
  assert.equal(messages[0].content.parts[0].asset_pointer,'https://lh3.googleusercontent.com/image');
  assert.equal(messages[0].content.parts[0].alt,'photo.png');
});
test('history pages publish only new messages and the adjacent branch boundary', async () => {
  const pages=[];
  await readGeminiConversation({route:{kind:'app',id:'test'},rpc:async(id,args)=>args[2]?[[turn('a')],null]:[[turn('c'),turn('b')],'next'],onPage:(payload,options)=>pages.push({payload,options})});
  assert.equal(pages[1].options.older,true);
  assert.equal(pages[1].payload.messages.length,2);
});

test('generated-image rich content keeps image labels alongside answer text',()=>{
 const item=turn('generated');item[3][0][0][12]={'8':[[[[null,null,null,[null,null,'Generated diagram','https://lh3.googleusercontent.com/generated']]]]]};
 const parts=geminiMessages([item])[1].content.parts;
 assert.equal(parts[0],'## Answer generated');
 assert.equal(parts[1].alt,'Generated diagram');
});
