import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createChatGptConversationCover, stepStates } from "../src/chatgpt-conversation-cover.js";

function setup() {
  const dom = new JSDOM('<nav>会话</nav><main aria-busy="false"><textarea>未发送的草稿</textarea></main>', { url: "https://chatgpt.com/c/one" });
  let retries = 0;
  const cover = createChatGptConversationCover({ window: dom.window, locale: "zh", onRetry: () => retries++ });
  const update = (fields = {}) => cover.update({ generation: "one", title: "用户的会话标题", phase: "loading", count: 14, native: { phase: "loading" }, ...fields });
  const shadow = () => dom.window.document.getElementById("polaris-conversation-cover").shadowRoot;
  const step = (name) => shadow().querySelector(`.step.${name}`).dataset.state;
  return { dom, cover, update, shadow, step, root: () => dom.window.document.getElementById("polaris-conversation-cover"), retries: () => retries,
    finish() { cover.dispose(); dom.window.close(); } };
}

test("step states map data reading and native preparation separately", () => {
  assert.deepEqual(stepStates({ phase: "loading", native: { phase: "preparing" } }), { read: "active", prepare: "active" });
  assert.deepEqual(stepStates({ phase: "loading", native: { phase: "ready" } }), { read: "active", prepare: "done" });
  assert.deepEqual(stepStates({ phase: "loading", native: { phase: "loading" } }), { read: "active", prepare: "pending" });
  assert.deepEqual(stepStates({ phase: "complete", native: { phase: "loading" } }), { read: "done", prepare: "active" });
  assert.deepEqual(stepStates({ phase: "complete", native: { phase: "preparing" } }), { read: "done", prepare: "active" });
  assert.deepEqual(stepStates({ phase: "complete", native: { phase: "error" } }), { read: "done", prepare: "error" });
  assert.deepEqual(stepStates({ phase: "partial", native: { phase: "loading" } }), { read: "error", prepare: "pending" });
  assert.deepEqual(stepStates({ phase: "error" }), { read: "error", prepare: "pending" });
});

test("inline progress keeps both reading steps until native readiness, preserving the draft and main state", () => {
  const s = setup(); const main = s.dom.window.document.querySelector("main");
  try {
    s.update();
    assert.equal(s.shadow().querySelector(".number").textContent, "14");
    assert.equal(s.shadow().querySelector(".title").textContent, "用户的会话标题");
    assert.equal(s.step("read"), "active"); assert.equal(s.step("prepare"), "pending");
    assert.ok(s.shadow().querySelector(".step.read svg"));
    assert.equal(s.shadow().querySelector(".retry").hidden, true);
    assert.equal(s.shadow().querySelector(".partial").hidden, true);
    assert.equal(main.hasAttribute("inert"), false);
    assert.equal(main.getAttribute("aria-busy"), "false");
    s.update({ phase: "complete", native: { phase: "preparing" } });
    assert.ok(s.root(), "API completion must not hide a cover before host preparation completes");
    assert.equal(s.step("read"), "done"); assert.equal(s.step("prepare"), "active");
    s.update({ phase: "complete", native: { phase: "ready" } });
    assert.equal(s.root(), null);
    assert.equal(main.hasAttribute("inert"), false);
    assert.equal(main.getAttribute("aria-busy"), "false");
    assert.equal(main.querySelector("textarea").value, "未发送的草稿");
  } finally { s.finish(); }
});

test("partial reading dismisses only this conversation, and error recovery offers a real retry", () => {
  const s = setup();
  try {
    s.update({ phase: "complete", native: { phase: "error" } });
    const shadow = s.shadow();
    assert.equal(s.step("prepare"), "error");
    assert.match(shadow.querySelector(".status").textContent, /还没准备好/);
    assert.equal(shadow.querySelector(".retry").hidden, false);
    shadow.querySelector(".retry").click(); assert.equal(s.retries(), 1);
    shadow.querySelector(".partial").click(); assert.equal(s.root(), null);
    s.update({ count: 20 }); assert.equal(s.root(), null);
    s.update({ generation: "two" }); assert.ok(s.root());
    s.cover.update(null); assert.equal(s.root(), null);
  } finally { s.finish(); }
});

test("disposing a loading cover restores pre-existing inert state without removing host content", () => {
  const s = setup(); const main = s.dom.window.document.querySelector("main");
  try {
    main.setAttribute("inert", ""); main.removeAttribute("aria-busy");
    s.update(); s.cover.dispose();
    assert.equal(main.hasAttribute("inert"), true);
    assert.equal(main.hasAttribute("aria-busy"), false);
    assert.equal(main.querySelector("textarea").value, "未发送的草稿");
  } finally { s.finish(); }
});

test("without a conversation the host page stays free of notices and releases the reading cover", () => {
  const s = setup(); const doc = s.dom.window.document; const main = doc.querySelector("main");
  const notice = () => doc.getElementById("polaris-conversation-notice");
  try {
    s.cover.update(null, "dark");
    assert.equal(notice(), null);
    assert.equal(s.root(), null);
    assert.equal(main.hasAttribute("inert"), false);
    s.update();
    assert.equal(notice(), null); assert.ok(s.root());
    s.cover.update(null);
    assert.equal(s.root(), null); assert.equal(main.hasAttribute("inert"), false); assert.equal(notice(), null);
    assert.equal(main.querySelector("textarea").value, "未发送的草稿");
  } finally { s.finish(); }
});

test("the cover keeps a plain Polaris background without decorative shapes", () => {
  const s = setup();
  try {
    s.update();
    assert.equal(s.shadow().querySelector(".backdrop"), null);
    assert.equal(s.shadow().querySelectorAll("svg").length, 2, "only the two step icons are drawn");
  } finally { s.finish(); }
});

test("the cover reports whether it is showing and announces a manual dismissal", () => {
  const dom = new JSDOM("<main></main>", { url: "https://chatgpt.com/c/one" });
  let dismissals = 0;
  const cover = createChatGptConversationCover({ window: dom.window, locale: "zh", onDismiss: () => dismissals++ });
  try {
    assert.equal(cover.isShowing(), false);
    cover.update({ generation: "one", phase: "loading", count: 1, native: { phase: "loading" } });
    assert.equal(cover.isShowing(), true);
    dom.window.document.getElementById("polaris-conversation-cover").shadowRoot.querySelector(".surface")
      .dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(cover.isShowing(), false); assert.equal(dismissals, 1);
  } finally { cover.dispose(); dom.window.close(); }
});

test("an empty pending read waits without a card until messages arrive, never failing merely because time elapsed", () => {
  const dom = new JSDOM("<main><textarea></textarea></main>", { url: "https://chatgpt.com/c/one" });
  const win = dom.window; let time = 0; const timers = []; let changes = 0;
  Object.defineProperty(win.performance, "now", { value: () => time });
  win.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return timers.length; };
  win.clearTimeout = () => {};
  const cover = createChatGptConversationCover({ window: win, locale: "zh", onStateChange: () => changes++ });
  const notice = () => win.document.getElementById("polaris-conversation-notice");
  const loading = (fields = {}) => cover.update({ generation: "one", phase: "loading", count: 0, native: { phase: "loading" }, ...fields });
  try {
    cover.update(null);
    assert.equal(notice(), null);
    loading();
    assert.equal(notice(), null, "the home-page notice leaves when a conversation opens");
    assert.equal(cover.isShowing(), false, "a route and pending request do not confirm conversation content");
    assert.equal(cover.isWaiting(), true);
    assert.equal(win.document.querySelector("main").hasAttribute("inert"), false);
    time = 60000; for (const timer of timers) timer.callback(); loading();
    assert.equal(changes, 0); assert.equal(timers.length, 0);
    assert.equal(cover.isStalled(), false); assert.equal(cover.isWaiting(), true);
    assert.equal(cover.isShowing(), false, "elapsed time must not reveal an empty progress card");
    assert.equal(notice(), null);
    loading({ count: 3 });
    assert.equal(cover.isShowing(), true); assert.equal(cover.isStalled(), false);
    const shadow = win.document.getElementById("polaris-conversation-cover").shadowRoot;
    assert.equal(shadow.querySelector(".number").textContent, "3");
    assert.equal(shadow.querySelector(".read").dataset.state, "active");
    assert.equal(shadow.querySelector(".retry").hidden, true); assert.equal(shadow.querySelector(".partial").hidden, true);
    assert.equal(notice(), null);
    loading({ generation: "two" });
    assert.equal(cover.isShowing(), false, "switching conversations must remove the previous card immediately");
    assert.equal(cover.isWaiting(), true);
    cover.update({ generation: "two", phase: "error", count: 0 }, "dark");
    assert.equal(cover.isStalled(), true, "only an explicit failed read exposes the sidepanel recovery state");
    assert.equal(cover.isShowing(), false);
    assert.equal(notice(), null, "an error must not create a floating notice in dark mode either");
    cover.update(null);
    assert.equal(cover.isStalled(), false);
  } finally { cover.dispose(); dom.window.close(); }
});

test("native conversation content confirms loading before the history API returns a count", () => {
  const dom = new JSDOM('<main><infinite-scroller class="chat-history"><user-query><div class="query-text">An existing conversation message</div></user-query></infinite-scroller></main>', { url: 'https://gemini.google.com/app/example' });
  const cover = createChatGptConversationCover({ window: dom.window });
  try {
    cover.update({ generation: 'one', phase: 'loading', count: 0, native: { phase: 'loading' } });
    assert.equal(cover.isShowing(), true);
    const root = dom.window.document.querySelector('#polaris-conversation-cover');
    assert.equal(root.shadowRoot.querySelector('.number').textContent, '', 'unknown counts must not be presented as zero');
    cover.update({ generation: 'one', phase: 'error', count: 0, native: { phase: 'loading' } });
    assert.equal(cover.isShowing(), false);
    assert.equal(cover.isStalled(), true);
  } finally { cover.dispose(); dom.window.close(); }
});

test("reading status stays inline and never disables or covers a third-party plugin panel", () => {
  const s = setup(); const doc = s.dom.window.document; const main = doc.querySelector('main');
  const plugin = doc.createElement('section'); plugin.setAttribute('role', 'dialog');
  plugin.style.cssText = 'position:fixed;z-index:1000;inset:24px;background:white';
  const action = doc.createElement('button'); action.textContent = 'Plugin settings'; plugin.append(action); main.append(plugin);
  action.focus();
  const originalStyle = plugin.getAttribute('style');
  try {
    s.update();
    assert.equal(main.hasAttribute('inert'), false, 'a plugin inside main must remain interactive');
    assert.equal(main.getAttribute('aria-busy'), 'false', 'reading must not mark the native app or its plugins busy');
    assert.equal(doc.activeElement, action, 'loading must not steal focus from another extension');
    assert.equal(s.root().parentElement, main, 'status must be mounted in the native content flow');
    assert.notEqual(s.root().style.position, 'fixed');
    assert.equal(s.root().style.zIndex, '', 'loading must not enter an overlay stacking contest');
    assert.equal(plugin.getAttribute('style'), originalStyle);
    s.cover.dispose();
    assert.equal(doc.activeElement, action);
    assert.equal(plugin.parentElement, main);
  } finally { s.finish(); }
});

test("inline status follows native rerenders without replacing messages or plugin nodes", async () => {
  const s = setup(); const doc = s.dom.window.document;
  try {
    const main = doc.querySelector('main'); const header = doc.createElement('header'); main.prepend(header);
    s.update(); const root = s.root();
    assert.equal(header.nextElementSibling, root);
    root.remove(); await new Promise(resolve => s.dom.window.setTimeout(resolve, 0));
    assert.equal(s.root(), root, 'reinsert the owned status if the native renderer removes it');
    assert.equal(root.parentElement, main);
    const next = doc.createElement('main'); next.innerHTML = '<p>New native message</p><button>Other plugin</button>';
    main.replaceWith(next);
    await new Promise(resolve => s.dom.window.setTimeout(resolve, 0));
    assert.equal(root.parentElement, next);
    assert.equal(doc.querySelectorAll('#polaris-conversation-cover').length, 1);
    assert.equal(next.querySelector('p').textContent, 'New native message');
    assert.equal(next.querySelector('button').textContent, 'Other plugin');
    next.setAttribute('aria-busy', 'true'); next.setAttribute('inert', '');
    s.cover.dispose();
    assert.equal(next.getAttribute('aria-busy'), 'true', 'do not undo attributes owned by the native page or another plugin');
    assert.equal(next.hasAttribute('inert'), true);
  } finally { s.finish(); }
});

test("inline status waits for a native content mount without creating a body-level overlay", async () => {
  const dom = new JSDOM('<body><nav>Native navigation</nav></body>', { url: 'https://chatgpt.com/c/one' });
  const doc = dom.window.document;
  const cover = createChatGptConversationCover({ window: dom.window });
  try {
    cover.update({ generation: 'one', phase: 'loading', count: 3 });
    assert.equal(cover.isWaiting(), true);
    assert.equal(cover.isShowing(), false);
    assert.equal(doc.querySelector('#polaris-conversation-cover'), null);
    const main = doc.createElement('main'); main.innerHTML = '<textarea>draft</textarea>'; doc.body.append(main);
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    assert.equal(cover.isShowing(), true);
    assert.equal(doc.querySelector('#polaris-conversation-cover').parentElement, main);
    assert.equal(main.hasAttribute('inert'), false);
    assert.equal(main.querySelector('textarea').value, 'draft');
    cover.dispose();
    main.append(doc.createElement('p'));
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    assert.equal(doc.querySelector('#polaris-conversation-cover'), null);
  } finally { cover.dispose(); dom.window.close(); }
});

test("horizontal alignment uses the conversation list rather than the page main containing a sidebar", async () => {
  const s = setup(); const doc = s.dom.window.document;
  try {
    const main = doc.querySelector('main');
    main.innerHTML = '<aside>Native sidebar</aside><section><div class="native-conversation-list"><div class="conversation-container">Reply</div></div></section>';
    const list = main.querySelector('.native-conversation-list');
    s.update();
    assert.equal(s.root().parentElement, list, 'auto horizontal margins must be relative to the conversation list');
    assert.equal(list.querySelector('.conversation-container').textContent, 'Reply');
    assert.equal(main.querySelector('aside').textContent, 'Native sidebar');
    const replacement = doc.createElement('div'); replacement.className = 'native-conversation-list';
    replacement.innerHTML = '<div class="conversation-container">Updated reply</div>';
    list.replaceWith(replacement);
    await new Promise(resolve => s.dom.window.setTimeout(resolve, 0));
    assert.equal(s.root().parentElement, replacement);
    assert.equal(s.root().style.position, '');
    assert.equal(main.hasAttribute('inert'), false);
  } finally { s.finish(); }
});

test("Gemini status waits for read messages, then anchors to history before native turns mount", () => {
  const dom = new JSDOM('<main class="chat-app"><div class="native-top-actions"><button>Upgrade</button></div><div class="chat-history-scroll-container"><infinite-scroller class="chat-history"></infinite-scroller></div></main>', { url: 'https://gemini.google.com/app/example' });
  const doc = dom.window.document;
  const cover = createChatGptConversationCover({ window: dom.window });
  try {
    const history = doc.querySelector('infinite-scroller.chat-history');
    const actions = doc.querySelector('.native-top-actions');
    cover.update({ generation: 'one', phase: 'loading', count: 0, native: { phase: 'loading' } });
    assert.equal(doc.querySelector('#polaris-conversation-cover'), null);
    assert.equal(cover.isWaiting(), true);
    cover.update({ generation: 'one', phase: 'loading', count: 40, native: { phase: 'loading' } });
    assert.equal(doc.querySelector('#polaris-conversation-cover').parentElement, history);
    cover.update({ generation: 'one', phase: 'complete', count: 40, native: { phase: 'preparing' } });
    assert.equal(cover.isShowing(), true, 'progress remains visible while native messages are still absent');
    assert.equal(doc.querySelector('#polaris-conversation-cover').parentElement, history);
    assert.equal(actions.parentElement, doc.querySelector('main'));
    assert.equal(doc.querySelector('main').hasAttribute('inert'), false);
  } finally { cover.dispose(); dom.window.close(); }
});

test("Gemini progress appears in the empty final history list without waiting for native message nodes", async () => {
  const dom = new JSDOM('<main><chat-window></chat-window></main>', { url: 'https://gemini.google.com/app/example' });
  const doc = dom.window.document;
  const cover = createChatGptConversationCover({ window: dom.window });
  try {
    cover.update({ generation: 'one', phase: 'complete', count: 40, native: { phase: 'preparing' } });
    assert.equal(cover.isShowing(), false, 'do not mount in an intermediate container');
    const history = doc.createElement('infinite-scroller'); history.className = 'chat-history';
    doc.querySelector('chat-window').append(history);
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    const root = doc.querySelector('#polaris-conversation-cover');
    assert.equal(cover.isShowing(), true, 'an empty final list must be enough to show preparation progress');
    assert.equal(root.parentElement, history);
    const turn = doc.createElement('div'); turn.className = 'conversation-container'; history.append(turn);
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    assert.equal(doc.querySelector('#polaris-conversation-cover'), root);
    assert.equal(root.parentElement, history);
  } finally { cover.dispose(); dom.window.close(); }
});
