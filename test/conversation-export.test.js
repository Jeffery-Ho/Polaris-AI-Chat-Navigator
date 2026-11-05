import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildConversationExport, collectDOMConversation } from '../src/conversation-export.js';
import { createConversationIndex } from '../src/conversation-index.js';

const message = (id, role, text) => ({ id, author: { role }, content: { content_type: 'text', parts: [text] } });
test('full indexed export includes unrecognized body and user messages in source order', async () => {
  const index = createConversationIndex();
  await index.ingest({ title: '长会话', page_info: { has_previous_page: false, has_next_page: false }, messages: [message('u','user','完整问题'), message('a','assistant','纯正文'), message('u2','user','第二个问题'), message('a2','assistant','## 章节\n\n```js\nconst x = 1;\n```')] });
  assert.equal(index.exportConversation(), null);
  index.finish();
  const conversation = index.exportConversation();
  assert.deepEqual(conversation.messages.map(item => item.role), ['user','assistant','user','assistant']);
  const dom = new JSDOM();
  try {
    const data = buildConversationExport({ document: dom.window.document, conversation, locale: 'zh' });
    assert.match(data.text, /完整问题[\s\S]*纯正文[\s\S]*第二个问题[\s\S]*const x = 1/);
    assert.match(data.markdown, /## 用户\n\n完整问题/);
    assert.match(data.markdown, /```js\nconst x = 1;/);
    const html = new JSDOM(data.html);
    assert.equal(html.window.document.querySelectorAll('section').length, 4);
    assert.equal(html.window.document.querySelector('pre code').textContent, 'const x = 1;');
    html.window.close();
  } finally { dom.window.close(); }
});

test('DOM export preserves full questions, prose, lists, tables and code, excluding page controls', () => {
  const dom = new JSDOM('<div id="u">完整问题<br>第二行</div><article><p>正文 <strong>重点</strong></p><ol><li>第一项</li><li>第二项</li></ol><table><tr><th>名称</th><th>值</th></tr><tr><td>甲</td><td>1</td></tr></table><pre><code>let x = `value`;</code></pre><button>Copy host button</button></article>');
  try {
    const doc = dom.window.document;
    const conversation = collectDOMConversation({ document: doc, containers: [doc.querySelector('article')], users: [{ element: doc.querySelector('#u') }], title: '测试', url: 'https://example.com/chat' });
    const data = buildConversationExport({ document: doc, conversation });
    assert.equal(conversation.scope, 'loaded');
    assert.match(data.text, /完整问题\n第二行/);
    assert.ok(!data.text.includes('Copy host button'));
    assert.match(data.markdown, /\*\*重点\*\*/);
    assert.match(data.markdown, /1\. 第一项\n2\. 第二项/);
    assert.match(data.markdown, /\| 名称 \| 值 \|/);
    assert.match(data.markdown, /```\nlet x = `value`;/);
  } finally { dom.window.close(); }
});

test('HTML export sanitizes message markup, escapes titles and uses image labels without remote fetches', () => {
  const dom = new JSDOM();
  try {
    const data = buildConversationExport({ document: dom.window.document, conversation: { title: '</title><script>bad()</script>', messages: [
      { role: 'assistant', html: '<p onclick="bad()">正文<script>bad()</script><a href="javascript:bad()">危险链接</a><img src="https://example.com/a.png" alt="附件"></p>' },
      { role: 'user', markdown: '<script>bad()</script>' }
    ] } });
    const html = new JSDOM(data.html);
    assert.equal(html.window.document.querySelector('script, [onclick], img, a[href^="javascript:"]'), null);
    assert.match(html.window.document.body.textContent, /附件/);
    assert.match(html.window.document.body.textContent, /<script>bad\(\)<\/script>/);
    assert.ok(!data.filename.includes('/'));
    html.window.close();
  } finally { dom.window.close(); }
});

test('export attribution uses the published app name in both formats without changing copied text', () => {
  const dom = new JSDOM();
  try {
    const conversation = { title: 'Example', messages: [{ role: 'assistant', markdown: 'Body', text: 'Body' }] };
    for (const [locale, appName, expected] of [
      ['zh', 'Polaris: AI Chat Navigator', '由 Polaris: AI Chat Navigator 本地导出'],
      ['en', 'Another Published Name', 'Exported locally by Another Published Name']
    ]) {
      const data = buildConversationExport({ document: dom.window.document, conversation, locale, appName });
      const privacyNote = locale === 'zh'
      ? '不上传会话内容'
      : 'No conversation content is uploaded';
    assert.ok(data.markdown.endsWith(`---\n\n${expected} · ${privacyNote}\n`));
      const exported = new JSDOM(data.html);
      assert.equal(exported.window.document.body.lastElementChild.tagName, 'FOOTER');
      assert.equal(exported.window.document.querySelector('footer').textContent, `${expected} · ${privacyNote}`);
      assert.ok(!data.text.includes(appName));
      exported.window.close();
    }
    const escaped = buildConversationExport({ document: dom.window.document, conversation, locale: 'zh', appName: '<Release> *Name*' });
    assert.ok(escaped.markdown.includes('由 \\<Release\\> \\*Name\\* 本地导出 · '));
    const exported = new JSDOM(escaped.html);
    assert.equal(exported.window.document.querySelector('footer').firstChild.textContent, '由 <Release> *Name* 本地导出 · 不上传会话内容');
    assert.equal(exported.window.document.querySelector('release'), null);
    exported.window.close();
  } finally { dom.window.close(); }
});

test('Markdown export neutralizes remote resources and raw HTML while retaining code and normal links', () => {
  const dom = new JSDOM();
  try {
    const markdown = '![tracking](https://example.invalid/pixel?private=value)\n\n<img src="https://example.invalid/raw" onerror="bad()">\n\n[unsafe](javascript:bad)\n\n[Docs](https://example.com/docs)\n\n```html\n<img src="https://example.invalid/code">\n```';
    const data = buildConversationExport({ document: dom.window.document, conversation: {
      title: '<img src="https://example.invalid/title">', messages: [{ role: 'assistant', markdown }]
    } });
    assert.doesNotMatch(data.markdown, /!\[tracking\]|pixel\?private=value|\]\(<javascript:/);
    assert.match(data.markdown, /\\\[tracking\\\]/);
    assert.match(data.markdown, /\\<img src="https:\/\/example.invalid\/raw" onerror="bad\(\)"\\>/);
    assert.match(data.markdown, /\[Docs\]\(<https:\/\/example.com\/docs>\)/);
    assert.match(data.markdown, /```html\n<img src="https:\/\/example.invalid\/code">\n```/);
    assert.ok(data.markdown.startsWith('# \\<img'));
    const html = new JSDOM(data.html);
    assert.equal(html.window.document.querySelector('img, script, [onerror]'), null);
    html.window.close();
  } finally { dom.window.close(); }
});
