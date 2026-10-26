import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createChatGptNativeNavigation } from "../public/src/chatgpt-native-navigation.js";

test("preparation exports a validated host snapshot and subsequent jumps share its completed load", async () => {
  const s = setup({ virtualized: true });
  s.win.document.querySelector("main").__reactFiber$test = s.win.document.querySelector('[data-message-id="latest"]').__reactFiber$test;
  const payload = { id: "one", current_node: "old", mapping: { old: { parent: null, message: { id: "old" } } } };
  s.scope.queryClient.getQueryData = () => payload;
  try {
    const [first, second] = await Promise.all([s.navigation.prepare("one"), s.navigation.prepare("one")]);
    assert.equal(first.payload, payload); assert.equal(second.payload, payload);
    assert.equal(s.calls.length, 1);
    await s.navigation.reveal("one", { messageId: "old" });
    assert.equal(s.calls.length, 1);
    s.navigation.invalidate(); await s.navigation.prepare("one");
    assert.equal(s.calls.length, 2);
    payload.mapping.old.parent = "missing";
    assert.equal((await s.navigation.prepare("one")).payload, null);
  } finally { s.dom.window.close(); }
});

function setup({ ambiguous = false, virtualized = false, animated = false, reducedMotion = false, hangScrollToKey = false } = {}) {
  const dom = new JSDOM('<main style="overflow-y: auto"><div data-turn-key="latest-turn"><article data-message-id="latest"></article></div></main>', { url: "https://chatgpt.com/c/one" });
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
  const scrolls = [];
  const frames = new Map();
  let nextFrame = 0;
  const scroller = win.document.querySelector("main");
  const entries = [{ turnKey: "old-turn", turn: { messageIds: ["old"] } }, { turnKey: "latest-turn", turn: { messageIds: ["latest"] } }];
  const geometry = { "old-turn": { startPx: 0, endPx: 800 }, "latest-turn": { startPx: 2000, endPx: 2800 } };
  win.matchMedia = () => ({ matches: reducedMotion });
  win.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
  win.cancelAnimationFrame = (id) => frames.delete(id);
  if (animated) {
    Object.defineProperties(scroller, { scrollHeight: { value: 3000 }, clientHeight: { value: 600 } });
    scroller.scrollTop = 2000;
    scroller.getBoundingClientRect = () => ({ top: 0 });
    win.document.querySelector('[data-turn-key]').getBoundingClientRect = () => ({ top: 2000 - scroller.scrollTop });
    scroller.scrollTo = ({ top }) => { scrolls.push(top); scroller.scrollTop = top; };
  }
  function mountOldMessage() {
    const article = win.document.createElement("article"); article.dataset.messageId = "old"; article.textContent = "完整原文";
    win.document.querySelector("main").prepend(article);
  }
  const handle = { async scrollToMessage(id) {
    const messageIds = ["old", "latest"];
    const scrollToKey = () => { jumps.push(id); mountOldMessage(); };
    if (messageIds.includes(id)) scrollToKey();
  } };
  const virtualList = {
    getEntryGeometry: (key) => geometry[key] || null,
    async scrollToKey(key, _target, options) {
      if (options?.signal?.aborted) return;
      jumps.push(key); scroller.scrollTop = geometry[key].startPx; mountOldMessage();
      if (hangScrollToKey) await new Promise(() => {});
    }
  };
  const runtime = (key) => key === "full" ? { loadFull } : { pagination };
  runtime.m = {
    full: function () { return "chatgpt-conversation-full forceFull mergeActiveBranch"; },
    paging: function () { return "externalSignal getDynamicConfig num_turns Number.isInteger"; }
  };
  const fiber = { memoizedProps: { entries }, memoizedState: { memoizedState: { current: scope }, next: ambiguous ? { memoizedState: { current: { ...scope, node: {} } } } : { memoizedState: { current: handle }, next: animated ? { memoizedState: virtualList } : null } }, return: null };
  win.document.querySelector("article").__reactFiber$test = fiber;
  const navigation = createChatGptNativeNavigation({ window: win, loadModule: async () => ({ __webpack_require__: runtime }) });
  async function frame(time) {
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const pending = [...frames.values()]; frames.clear();
    for (const callback of pending) callback(time);
    await Promise.resolve();
  }
  return { dom, win, navigation, calls, scope, jumps, scroller, scrolls, frames, frame, geometry };
}

test("off-screen Maker navigation scrolls through intermediate positions before native target arrival", async () => {
  const s = setup({ virtualized: true, animated: true });
  try {
    const pending = s.navigation.reveal("one", { messageId: "old" });
    await s.frame(0); await s.frame(150);
    assert.ok(s.scroller.scrollTop > 0 && s.scroller.scrollTop < 2000, "the conversation must visibly travel before arriving");
    assert.deepEqual(s.jumps, [], "native instant alignment must wait for the scroll animation");
    for (const time of [300, 450, 600]) await s.frame(time);
    assert.equal((await pending).ok, true);
    assert.equal(s.scroller.scrollTop, 0);
    assert.deepEqual(s.jumps, ["old-turn"]);
  } finally { s.dom.window.close(); }
});

test("scrolling follows updated virtual row geometry and ends at the revised target", async () => {
  const s = setup({ virtualized: true, animated: true });
  try {
    const pending = s.navigation.reveal("one", { messageId: "old" });
    await s.frame(0); await s.frame(150);
    s.geometry["old-turn"] = { startPx: 300, endPx: 1100 };
    for (const time of [300, 450, 600]) await s.frame(time);
    assert.equal((await pending).ok, true);
    assert.equal(s.scrolls.at(-1), 300, "remeasured rows must not leave the animation aiming at stale geometry");
    assert.equal(s.scroller.scrollTop, 300);
  } finally { s.dom.window.close(); }
});

test("aborting or manually scrolling cancels pending movement without a late native jump", async () => {
  for (const manual of [false, true]) {
    const s = setup({ virtualized: true, animated: true });
    try {
      const controller = new AbortController();
      const pending = s.navigation.reveal("one", { messageId: "old", signal: controller.signal });
      await s.frame(0); await s.frame(150);
      const top = s.scroller.scrollTop;
      if (manual) s.scroller.dispatchEvent(new s.win.Event("wheel"));
      else controller.abort();
      assert.equal((await pending).reason, manual ? "navigation-cancelled" : "source-changed");
      await s.frame(600);
      assert.equal(s.scroller.scrollTop, top);
      assert.equal(s.frames.size, 0);
      assert.deepEqual(s.jumps, []);
    } finally { s.dom.window.close(); }
  }
});

test("reduced motion reveals directly, and cover preparation never starts animation", async () => {
  const s = setup({ virtualized: true, animated: true, reducedMotion: true });
  try {
    assert.equal((await s.navigation.reveal("one", { prepare: true })).ok, true);
    assert.equal(s.scroller.scrollTop, 2000);
    assert.equal((await s.navigation.reveal("one", { messageId: "old" })).ok, true);
    assert.equal(s.frames.size, 0); assert.deepEqual(s.scrolls, []);
    assert.deepEqual(s.jumps, ["old-turn"]);
  } finally { s.dom.window.close(); }
});

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

test("a host scrollToKey that never settles still reports the revealed message", async () => {
  const s = setup({ virtualized: true, animated: true, reducedMotion: true, hangScrollToKey: true });
  const limits = [];
  s.win.setTimeout = (callback, delay) => { limits.push(delay); queueMicrotask(callback); return 1; };
  try {
    assert.equal((await s.navigation.reveal("one", { messageId: "old" })).ok, true);
    assert.deepEqual(s.jumps, ["old-turn"]);
    assert.ok(limits.includes(2000));
  } finally { s.dom.window.close(); }
});

test("an instant reveal lands on the target without the approach animation", async () => {
  const s = setup({ virtualized: true, animated: true });
  try {
    assert.equal((await s.navigation.reveal("one", { messageId: "old", instant: true })).ok, true);
    assert.equal(s.frames.size, 0); assert.deepEqual(s.scrolls, []);
    assert.deepEqual(s.jumps, ["old-turn"]);
  } finally { s.dom.window.close(); }
});
