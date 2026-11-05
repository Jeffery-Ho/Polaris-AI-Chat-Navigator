import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createSidepanelConversationExport } from '../src/sidepanel-conversation-export.js';

const sample = { title: 'Long conversation', scope: 'complete', messages: [
  { role: 'user', markdown: 'Question', text: 'Question' },
  { role: 'assistant', markdown: '## Answer\n\nBody beyond the focused chapter', text: 'Answer\n\nBody beyond the focused chapter' }
] };
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
function setup({ onRead = async () => sample, copy } = {}) {
  const dom = new JSDOM('<body></body>', { pretendToBeVisual: true });
  const { window: win } = dom; const doc = win.document;
  const copied = [], downloads = [], blobs = [];
  win.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  win.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new win.Event('close')); };
  Object.defineProperty(win.navigator, 'clipboard', { value: { writeText: copy || (async text => copied.push(text)) } });
  win.URL.createObjectURL = blob => { blobs.push(blob); return 'blob:export'; };
  win.URL.revokeObjectURL = () => {};
  win.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
  const control = createSidepanelConversationExport({ document: doc, locale: 'en', onRead });
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
