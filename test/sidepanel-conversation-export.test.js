import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createSidepanelConversationExport } from '../src/sidepanel-conversation-export.js';

const sample = { title: 'Long conversation', scope: 'complete', messages: [
  { role: 'user', markdown: 'Question', text: 'Question' },
  { role: 'assistant', markdown: '## Answer\n\nBody beyond the focused chapter', text: 'Answer\n\nBody beyond the focused chapter' }
] };
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
function setup({ onRead = async () => sample, copy, locale = 'en' } = {}) {
  const dom = new JSDOM('<body></body>', { pretendToBeVisual: true });
  const { window: win } = dom; const doc = win.document;
  const copied = [], downloads = [], blobs = [];
  win.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  win.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new win.Event('close')); };
  Object.defineProperty(win.navigator, 'clipboard', { value: { writeText: copy || (async text => copied.push(text)) } });
  win.URL.createObjectURL = blob => { blobs.push(blob); return 'blob:export'; };
  win.URL.revokeObjectURL = () => {};
  win.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
  const control = createSidepanelConversationExport({ document: doc, locale, onRead });
  doc.body.append(control.element); control.update({ key: 'chat-1', enabled: true, complete: true });
  return { dom, doc, win, control, copied, downloads, blobs };
}

test('global copy opens an optional MD/HTML export dialog only after clipboard success', async () => {
  const s = setup();
  try {
    s.doc.querySelector('.conversation-copy-button').click(); await settle();
    assert.equal(s.copied.length, 1);
    assert.match(s.copied[0], /Question[\s\S]*Body beyond the focused chapter/);
    const dialog = s.doc.querySelector('dialog[open]'); assert.ok(dialog);
    assert.equal(dialog.querySelector('h2').textContent, 'Export');
    assert.equal(dialog.querySelector('.conversation-export-success'), null);
    assert.equal(dialog.querySelectorAll('.conversation-export-format').length, 2);
    assert.ok(!dialog.textContent.includes('PDF'));
    dialog.querySelector('.conversation-export-save').click();
    assert.deepEqual(s.downloads, ['Long conversation.md']);
    assert.equal(dialog.querySelector('.conversation-export-footer').querySelectorAll('button').length, 1);
    assert.equal(dialog.lastElementChild.className, 'conversation-export-footer');
    assert.ok(!dialog.textContent.includes('Download started'));
    assert.equal(dialog.querySelector('[role="alert"]').hidden, true);
    assert.equal(dialog.querySelector('.conversation-export-close').getAttribute('aria-label'), 'Close');
    assert.ok(dialog.querySelector('.conversation-export-header .conversation-export-close svg'));
    assert.equal(s.blobs[0].type, 'text/markdown;charset=utf-8');
    dialog.querySelector('[data-format="html"]').click();
    dialog.querySelector('.conversation-export-save').click();
    assert.equal(s.downloads[1], 'Long conversation.html');
    assert.equal(s.blobs[1].type, 'text/html;charset=utf-8');
    dialog.querySelector('.conversation-export-close').click();
    assert.equal(s.doc.querySelector('dialog'), null);
    assert.equal(s.doc.activeElement, s.doc.querySelector('.conversation-copy-button'));
  } finally { s.dom.window.close(); }
});

test('failed clipboard writes show retry feedback without a false success dialog', async () => {
  let fail = true;
  const s = setup({ copy: async () => { if (fail) throw new Error('Denied'); } });
  try {
    const trigger = s.doc.querySelector('.conversation-copy-button');
    trigger.click(); await settle();
    assert.equal(s.doc.querySelector('dialog'), null);
    assert.match(s.doc.querySelector('[role="status"]').textContent, /Copy failed/);
    assert.equal(trigger.disabled, false);
    fail = false; trigger.click(); await settle();
    assert.ok(s.doc.querySelector('dialog[open]'));
  } finally { s.dom.window.close(); }
});

test('handoff prompt copies only its displayed text and preserves the selected export format', async () => {
  for (const locale of ['zh', 'en']) {
    const s = setup({ locale });
    try {
      s.doc.querySelector('.conversation-copy-button').click(); await settle();
      const dialog = s.doc.querySelector('dialog[open]');
      const card = dialog.querySelector('.conversation-export-handoff');
      assert.equal(card.previousElementSibling.className, 'conversation-export-formats');
      assert.equal(card.nextElementSibling.className, 'conversation-export-footer');
      const prompt = card.querySelector('.conversation-export-prompt').textContent;
      assert.match(prompt, locale === 'zh' ? /完整对话记录/ : /complete conversation/);
      assert.match(prompt, locale === 'zh' ? /User（用户）.*Assistant（AI 回复）/ : /User questions and Assistant replies/);
      assert.match(prompt, locale === 'zh' ? /最后三轮问答.*最后一条消息继续.*不足三轮/ : /last three exchanges.*final message.*fewer than three/);
      dialog.querySelector('[data-format="html"]').click();
      card.querySelector('button').click(); await settle();
      assert.deepEqual(s.copied.slice(1), [prompt]);
      assert.equal(card.querySelector('button').getAttribute('aria-label'), locale === 'zh' ? '已复制 Prompt' : 'Prompt copied');
      assert.equal(card.querySelector('button').textContent, '');
      assert.equal(card.querySelector('[role="status"]').hidden, true);
      assert.equal(s.doc.querySelector('dialog[open]'), dialog);
      dialog.querySelector('.conversation-export-save').click();
      assert.deepEqual(s.downloads, ['Long conversation.html']);
    } finally { s.dom.window.close(); }
  }
});

test('partial conversation handoff does not claim that the export contains the complete history', async () => {
  for (const locale of ['zh', 'en']) {
    const s = setup({ locale, onRead: async () => ({ ...sample, scope: 'page' }) });
    try {
      s.doc.querySelector('.conversation-copy-button').click(); await settle();
      const prompt = s.doc.querySelector('.conversation-export-prompt').textContent;
      assert.doesNotMatch(prompt, /完整对话记录|complete conversation/);
      assert.match(prompt, locale === 'zh' ? /可能不包含更早的消息/ : /earlier messages may be missing/);
    } finally { s.dom.window.close(); }
  }
});

test('prompt clipboard failures stay retryable and pending clicks cannot duplicate writes', async () => {
  let attempt = 0, rejectCopy, resolveCopy;
  const s = setup({ copy: () => {
    if (++attempt === 1) return Promise.resolve();
    return new Promise((resolve, reject) => { resolveCopy = resolve; rejectCopy = reject; });
  } });
  try {
    s.doc.querySelector('.conversation-copy-button').click(); await settle();
    const card = s.doc.querySelector('.conversation-export-handoff');
    const button = card.querySelector('button');
    button.click(); button.click();
    assert.equal(attempt, 2);
    assert.equal(button.disabled, true);
    rejectCopy(new Error('Denied')); await settle();
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute('aria-label'), 'Copy prompt');
    assert.equal(card.querySelector('[role="status"]').hidden, false);
    assert.match(card.querySelector('[role="status"]').textContent, /Copy failed.*manually/);
    button.click(); resolveCopy(); await settle();
    assert.equal(button.getAttribute('aria-label'), 'Prompt copied');
    assert.equal(card.querySelector('[role="status"]').hidden, true);
  } finally { s.dom.window.close(); }
});

test('changing conversation cancels pending reads and closes export of the prior conversation', async () => {
  let resolve;
  const s = setup({ onRead: () => new Promise(done => { resolve = done; }) });
  try {
    s.doc.querySelector('.conversation-copy-button').click();
    s.control.update({ key: 'chat-2', enabled: true });
    resolve(sample); await settle();
    assert.equal(s.copied.length, 0);
    assert.equal(s.doc.querySelector('dialog'), null);
    s.doc.querySelector('.conversation-copy-button').click(); resolve(sample); await settle();
    assert.ok(s.doc.querySelector('dialog'));
    s.control.update({ key: 'chat-3', enabled: false });
    assert.equal(s.doc.querySelector('dialog'), null);
    assert.equal(s.doc.querySelector('.conversation-copy-button').disabled, true);
  } finally { s.dom.window.close(); }
});
