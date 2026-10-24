import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createChatGptNativeNavigation } from "../public/src/chatgpt-native-navigation.js";

function setup({ ambiguous = false, virtualized = false } = {}) {
  const dom = new JSDOM('<main><article data-message-id="latest"></article></main>', { url: "https://chatgpt.com/c/one" });
  const win = dom.window;
  win.__reactRouterManifest = { entry: { imports: ["/cdn/assets/runtime.js"] } };
  const token = {};
  const pagination = { scope: token };
  const calls = [];
  const scope = { scope: token, node: {}, get: () => ({ complete: false, oldestMessageId: "latest" }), set() {}, query: { setData() {} }, queryClient: { getQueryData: () => ({ id: "one" }) } };
  async function loadFull(current, id, signal) {
    const queryKey = ["chatgpt-conversation-full", id]; const options = { forceFull: true, mergeActiveBranch: true };
    calls.push({ current, id, signal, queryKey, options });
    if (!virtualized) mountOldMessage();
  }
  const jumps = [];
  function mountOldMessage() {
    const article = win.document.createElement("article"); article.dataset.messageId = "old"; article.textContent = "完整原文";
    win.document.querySelector("main").prepend(article);
  }
  const handle = { async scrollToMessage(id) {
    const messageIds = ["old", "latest"];
    const scrollToKey = () => { jumps.push(id); mountOldMessage(); };
    if (messageIds.includes(id)) scrollToKey();
  } };
  const runtime = (key) => key === "full" ? { loadFull } : { pagination };
  runtime.m = {
    full: function () { return "chatgpt-conversation-full forceFull mergeActiveBranch"; },
    paging: function () { return "externalSignal getDynamicConfig num_turns Number.isInteger"; }
  };
  const fiber = { memoizedState: { memoizedState: { current: scope }, next: ambiguous ? { memoizedState: { current: { ...scope, node: {} } } } : { memoizedState: { current: handle } } }, return: null };
  win.document.querySelector("article").__reactFiber$test = fiber;
  const navigation = createChatGptNativeNavigation({ window: win, loadModule: async () => ({ __webpack_require__: runtime }) });
  return { dom, win, navigation, calls, scope, jumps };
}

test("full history in the model still needs the host virtual list to reveal an off-screen message", async () => {
  const s = setup({ virtualized: true });
  try {
    const result = await s.navigation.reveal("one", { messageId: "old" });
    assert.equal(result.ok, true);
    assert.deepEqual(s.jumps, ["old"]);
    assert.equal(s.win.document.querySelector('[data-message-id="old"]')?.textContent, "完整原文");
    assert.equal(s.win.location.href, "https://chatgpt.com/c/one");
  } finally { s.dom.window.close(); }
});

test("cover preparation loads history and validates the native list without scrolling the current reading position", async () => {
  const s = setup({ virtualized: true });
  try {
    assert.equal((await s.navigation.reveal("one", { prepare: true })).ok, true);
    assert.equal(s.calls.length, 1);
    assert.deepEqual(s.jumps, []);
    assert.equal(s.win.document.querySelector('[data-message-id="old"]'), null, "preparation must not force every virtual row into the DOM");
  } finally { s.dom.window.close(); }
});

test("native navigation hydrates the existing ChatGPT list without changing URL or inserting its own message UI", async () => {
  const s = setup();
  try {
    const signal = new AbortController().signal;
    const result = await s.navigation.reveal("one", { signal });
    assert.equal(result.ok, true);
    assert.equal(s.calls.length, 1); assert.equal(s.calls[0].current, s.scope); assert.equal(s.calls[0].signal, signal);
    assert.equal(s.win.document.querySelector('main [data-message-id="old"]').textContent, "完整原文");
    assert.equal(s.win.location.href, "https://chatgpt.com/c/one");
    assert.equal(s.win.document.querySelectorAll('main article').length, 2);
  } finally { s.dom.window.close(); }
});

test("native integration refuses ambiguous scopes and changed conversations", async () => {
  const s = setup({ ambiguous: true });
  try {
    assert.equal((await s.navigation.reveal("one")).reason, "native-list-unavailable");
    assert.equal(s.calls.length, 0);
    s.win.history.pushState({}, "", "/c/two");
    assert.equal((await s.navigation.reveal("one")).reason, "source-changed");
    assert.equal(s.calls.length, 0);
  } finally { s.dom.window.close(); }
});
