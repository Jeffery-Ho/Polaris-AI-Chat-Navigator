import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createDOMIndexController } from "../src/dom-index-controller.js";

function setup({ onChange = () => {} } = {}) {
  const dom = new JSDOM('<main><div id="messages"></div><button>Load earlier</button></main>', { url: "https://chatgpt.com/c/one" });
  const win = dom.window;
  const scroller = win.document.querySelector("#messages");
  const loadEarlier = win.document.querySelector("button");
  Object.defineProperties(scroller, { scrollHeight: { value: 3000 }, clientHeight: { value: 500 } });
  scroller.scrollTop = 1800;
  let messages = [];
  const scrolls = []; const loads = [];
  const controller = createDOMIndexController({ window: win, platform: "chatgpt", readMessages: () => ({ messages, scroller, loadEarlier, hasEarlier: true }), onChange });
  scroller.scrollTo = (options) => { scrolls.push(options); scroller.scrollTop = options.top; };
  loadEarlier.addEventListener("click", () => loads.push(true));
  const message = (id, text = id) => {
    const element = win.document.createElement("article"); element.innerHTML = "<h2></h2>";
    element.firstChild.textContent = text;
    return { id, role: "assistant", element, blocks: [{ type: "heading", level: 2, children: [{ type: "text", value: text }] }] };
  };
  return { win, controller, scroller, scrolls, loads, message,
    mount(values) { messages = values; scroller.replaceChildren(...values.map((value) => value.element)); },
    async ready(retainLoaded = false) { controller.configure(true, { retainLoaded }); await controller.syncMounted(); },
    close() { controller.dispose(); win.close(); }
  };
}

test("initial loaded-message indexing publishes real progress without re-covering later page updates", async () => {
  const snapshots = [];
  const s = setup({ onChange: () => snapshots.push(s.controller.snapshot()) });
  try {
    s.mount([s.message("one"), s.message("two")]);
    await s.ready(true);
    const loading = snapshots.filter(snapshot => snapshot?.phase === "loading");
    assert.deepEqual(loading[0]?.progress, { count: 0, total: 2 });
    assert.deepEqual(loading.at(-1)?.progress, { count: 2, total: 2 });
    assert.equal(s.controller.snapshot().phase, "complete");
    assert.equal(s.controller.snapshot().progress, undefined);
    snapshots.length = 0;
    s.mount([s.message("three")]); await s.controller.syncMounted();
    assert.equal(snapshots.some(snapshot => snapshot?.progress), false);
    assert.equal(s.controller.snapshot().count, 3);
    assert.deepEqual(s.scrolls, []); assert.deepEqual(s.loads, []);
  } finally { s.close(); }
});

test("opening and resynchronizing a loaded-history index never moves the host or clicks its loader", async () => {
  const s = setup();
  try {
    s.mount([s.message("current")]);
    await s.ready(true);
    for (let i = 0; i < 3; i++) await s.ready(true);
    s.win.document.dispatchEvent(new s.win.Event("visibilitychange"));
    s.win.history.pushState({}, "", "/c/two");
    s.mount([s.message("next")]); await s.ready(true);
    assert.deepEqual(s.scrolls, []); assert.deepEqual(s.loads, []);
    assert.equal(s.scroller.scrollTop, 1800);
    assert.equal(s.controller.snapshot().count, 1);
  } finally { s.close(); }
});

test("follow-page mode removes unmounted content from navigation, search and export", async () => {
  const s = setup();
  try {
    s.mount([s.message("old")]); await s.ready();
    s.mount([s.message("current")]); await s.controller.syncMounted();
    assert.equal(s.controller.snapshot().count, 1);
    assert.deepEqual(s.controller.outline().items.map((item) => item.title), ["current"]);
    assert.equal((await s.controller.search("old")).total, 0);
    assert.equal(s.controller.exportConversation().messages.length, 1);
    s.mount([]); await s.controller.syncMounted();
    assert.equal(s.controller.snapshot().count, 0);
  } finally { s.close(); }
});

test("switching back to follow-page releases accumulated history and switching on does not restore it", async () => {
  const s = setup();
  try {
    s.mount([s.message("old")]); await s.ready(true);
    s.mount([s.message("current")]); await s.controller.syncMounted();
    assert.equal(s.controller.snapshot().count, 2);
    await s.ready(false);
    assert.equal(s.controller.snapshot().count, 1);
    await s.ready(true);
    assert.equal(s.controller.snapshot().count, 1);
    assert.equal((await s.controller.search("old")).total, 0);
    assert.deepEqual(s.scrolls, []); assert.deepEqual(s.loads, []);
  } finally { s.close(); }
});

test("a missing original is reported immediately and remains readable without loading history", async () => {
  const s = setup();
  try {
    const old = s.message("old");
    s.mount([old]); await s.ready(true);
    s.mount([s.message("current")]); await s.controller.syncMounted();
    // If a regression tries to scan, remount the target so this test fails fast.
    s.scroller.scrollTo = (options) => { s.scrolls.push(options); s.mount([old]); };
    assert.deepEqual(await s.controller.ensureLocation("index:old:0:0", {}), { element: null, reason: "not-mounted" });
    assert.equal((await s.controller.search("old")).total, 1);
    assert.equal(s.controller.exportConversation().scope, "loaded");
    assert.deepEqual(s.scrolls, []); assert.deepEqual(s.loads, []);
  } finally { s.close(); }
});

test("rebuild releases retained history, invalidates the old generation and reads mounted messages only", async () => {
  const s = setup();
  try {
    s.mount([s.message("old")]); await s.ready(true);
    s.mount([s.message("current")]); await s.controller.syncMounted();
    const previous = s.controller.snapshot().generation;
    assert.equal(s.controller.snapshot().count, 2);
    await s.controller.rebuild();
    assert.notEqual(s.controller.snapshot().generation, previous);
    assert.equal(s.controller.snapshot().count, 1);
    assert.equal((await s.controller.search("old")).total, 0);
    assert.deepEqual(s.controller.exportConversation().messages.map(message => message.text), ["current"]);
    assert.deepEqual(s.scrolls, []); assert.deepEqual(s.loads, []);
  } finally { s.close(); }
});

test("retained reading returns the full indexed reply without locating or loading its original", async () => {
  const s = setup();
  try {
    const reply = s.message("old", "Retained heading");
    reply.blocks.push({ type: "paragraph", children: [{ type: "text", value: "Retained body" }] });
    s.mount([reply]); await s.ready(true);
    s.mount([s.message("current")]); await s.controller.syncMounted();
    const chapter = s.controller.retainedChapter("index:old:0:0");
    assert.equal(chapter.contents.length, 2);
    assert.equal(chapter.contents[1].text, "Retained body");
    assert.equal(s.controller.retainedChapter("index:missing"), null);
    assert.deepEqual(s.scrolls, []); assert.deepEqual(s.loads, []);
  } finally { s.close(); }
});

test("re-reading only refreshes mounted content and never activates the native history loader", async () => {
  const s = setup();
  try {
    s.mount([s.message("current", "before")]); await s.ready(true);
    s.mount([s.message("current", "after")]);
    // A loader invocation must fail the assertion without waiting for a timeout.
    s.scroller.scrollTo = (options) => { s.scrolls.push(options); s.controller.dispose(); };
    await s.controller.retry();
    assert.deepEqual(s.scrolls, []); assert.deepEqual(s.loads, []);
    assert.equal((await s.controller.search("after")).total, 1);
  } finally { s.close(); }
});
