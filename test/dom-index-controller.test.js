import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createDOMIndexController } from "../src/dom-index-controller.js";
import { domMessageBlocks } from "../src/dom-message-blocks.js";

const paragraph = (value) => ({ type: "paragraph", children: [{ type: "text", value }] });
const heading = (value) => ({ type: "heading", level: 2, children: [{ type: "text", value }] });
const pause = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function setup({ url = "https://www.kimi.com/chat/one" } = {}) {
  const dom = new JSDOM('<title>测试会话 - Kimi</title><div id="scroller"></div>', { url, pretendToBeVisual: true });
  const win = dom.window; const scroller = win.document.querySelector("#scroller");
  let source = { messages: [], scroller };
  const controller = createDOMIndexController({ window: win, platform: "kimi", readMessages: () => source, onChange() {} });
  function message(id, role, text, blocks = [role === "user" ? paragraph(text) : heading(text)]) {
    const element = win.document.createElement("article");
    element.dataset.messageId = id;
    const body = win.document.createElement(role === "user" ? "p" : "h2"); body.textContent = text;
    element.append(body);
    return { id, role, blocks, element };
  }
  function mount(messages, extra = {}) {
    scroller.replaceChildren(...messages.map((message) => message.element));
    source = { ...source, ...extra, messages };
  }
  return { win, scroller, controller, message, mount,
    setSource: (value) => { source = value; },
    async ready(retainLoaded = true) { controller.configure(true, { retainLoaded }); await controller.syncMounted(); },
    close() { controller.dispose(); win.close(); }
  };
}

test("DOM index retains unmounted windows without reordering or duplicating messages", async () => {
  const s = setup();
  try {
    const a = s.message("a", "user", "继续"); const b = s.message("b", "assistant", "第一章");
    const c = s.message("c", "user", "继续"); const d = s.message("d", "assistant", "第二章");
    s.mount([a, b]); await s.ready();
    s.mount([b, c, d]); await s.controller.syncMounted();
    s.mount([a, b]); await s.controller.syncMounted();
    const items = s.controller.outline({}).items;
    assert.deepEqual(items.map((item) => item.markerKey), ["index:a", "index:b:0:0", "index:c", "index:d:0:0"]);
    assert.equal(s.controller.snapshot().count, 4);
    assert.equal(s.controller.resolveTarget("index:d:0:0", {}), null);
    assert.equal((await s.controller.search("第二章")).total, 1);
    assert.equal(s.controller.exportConversation().scope, "loaded");
  } finally { s.close(); }
});

test("streaming updates replace a stable message's blocks and keep its user grouping", async () => {
  const s = setup();
  try {
    const user = s.message("u", "user", "说明"); const reply = s.message("a", "assistant", "旧标题");
    s.mount([user, reply]); await s.ready();
    reply.blocks = [paragraph("新引言"), heading("新标题")]; reply.element.innerHTML = "<p>新引言</p><h2>新标题</h2>";
    await s.controller.syncMounted();
    const outline = s.controller.outline({});
    assert.equal(s.controller.snapshot().count, 2);
    assert.equal(outline.items.at(-1).title, "新标题");
    assert.equal(outline.chapters[0].contents[0].text, "说明");
    assert.ok(outline.chapters[0].contents.some((part) => part.text === "新引言"));
    assert.ok(outline.chapters.every((chapter) => chapter.title !== "Full text"));
  } finally { s.close(); }
});

test("a quiet native top stays loaded and a known complete source retains coverage through remounts", async () => {
  const s = setup();
  try {
    Object.defineProperties(s.scroller, { scrollHeight: { value: 500 }, clientHeight: { value: 500 } });
    s.scroller.scrollTo = ({ top }) => { s.scroller.scrollTop = top; };
    const user = s.message("u", "user", "提问");
    s.mount([user]); await s.ready(true);
    assert.equal(s.controller.snapshot().coverage, "loaded");
    assert.equal(s.controller.snapshot().phase, "complete");
    s.mount([user], { coverage: "complete" }); await s.controller.syncMounted();
    assert.equal(s.controller.exportConversation().scope, "complete");
    s.mount([user], { coverage: "loaded" }); await s.controller.syncMounted();
    assert.equal(s.controller.snapshot().coverage, "complete");
  } finally { s.close(); }
});

test("trusted totals require an explicit exhausted history source", async () => {
  const s = setup();
  try {
    s.mount([s.message("u", "user", "提问")], { total: 1 }); await s.ready();
    assert.equal(s.controller.snapshot().coverage, "loaded");
    s.mount([s.message("u", "user", "提问")], { total: 1, hasEarlier: false }); await s.controller.syncMounted();
    assert.equal(s.controller.snapshot().coverage, "complete");
    assert.equal(s.controller.snapshot().total, 1);
  } finally { s.close(); }
});

test("route changes discard queued old records and ignore old searches", async () => {
  const s = setup();
  try {
    const large = Array.from({ length: 3000 }, (_, i) => ({ id: `old-${i}`, role: "user", blocks: [paragraph(`旧问题${i}`)] }));
    s.setSource({ messages: large, scroller: s.scroller });
    s.controller.configure(true);
    const oldGeneration = s.controller.snapshot().generation;
    s.win.history.pushState({}, "", "/chat/two");
    s.mount([s.message("new", "user", "新会话")]); await s.ready();
    await pause(30);
    assert.notEqual(s.controller.snapshot().generation, oldGeneration);
    assert.equal(s.controller.snapshot().count, 1);
    assert.deepEqual(s.controller.outline({}).items.map((item) => item.markerKey), ["index:new"]);
  } finally { s.close(); }
});

test("duplicate heading titles use their source ordinal, and image/file targets stay native", async () => {
  const s = setup();
  try {
    const reply = s.message("a", "assistant", "重复", [heading("重复"), paragraph("正文"), heading("重复"),
      { type: "image", src: "https://img.test/pic.png", alt: "示例图", imageKey: "" },
      { type: "attachment", name: "报告.pdf", mimeType: "application/pdf", url: "https://files.test/report.pdf" }]);
    reply.element.innerHTML = '<h2>重复</h2><p>正文</p><h2>重复</h2><img src="https://img.test/pic.png" alt="示例图"><a download="报告.pdf" href="https://files.test/report.pdf">报告.pdf</a>';
    s.mount([reply]); await s.ready();
    assert.equal(s.controller.resolveTarget("index:a:2:0", {}), reply.element.querySelectorAll("h2")[1]);
    assert.equal(s.controller.resolveTarget("index:a:image:0", {}), reply.element.querySelector("img"));
    assert.equal(s.controller.resolveTarget("index:a:attachment:0", {}), reply.element.querySelector("a"));
  } finally { s.close(); }
});

test("duplicate mounted source IDs fail location instead of picking an arbitrary message", async () => {
  const s = setup();
  try {
    const first = s.message("same", "user", "相同问题"); const second = s.message("same", "user", "相同问题");
    s.mount([first, second]); await s.ready();
    assert.deepEqual(s.controller.resolveLocation("index:same", {}), { element: null, reason: "ambiguous-message" });
    assert.equal(s.controller.snapshot().count, 1);
  } finally { s.close(); }
});

test("an authoritative complete native snapshot replaces a regenerated answer branch", async () => {
  const s = setup();
  try {
    const user = s.message("u", "user", "提问"); const old = s.message("old", "assistant", "旧分支");
    s.mount([user, old], { coverage: "complete" }); await s.ready();
    const replacement = s.message("replacement", "assistant", "新分支");
    s.mount([user, replacement], { coverage: "complete" }); await s.controller.syncMounted();
    assert.equal(s.controller.snapshot().count, 2);
    assert.equal(s.controller.snapshot().total, 2);
    assert.equal((await s.controller.search("旧分支")).total, 0);
    assert.deepEqual(s.controller.outline({}).items.map((item) => item.markerKey), ["index:u", "index:replacement:0:0"]);
    s.mount([replacement], { coverage: "loaded", total: 2, hasEarlier: false }); await s.controller.syncMounted();
    assert.equal(s.controller.snapshot().count, 2);
    assert.equal(s.controller.snapshot().coverage, "complete");
  } finally { s.close(); }
});

test("image ordinals follow parsed media and skip avatars, hidden, control and reasoning images", async () => {
  const s = setup();
  try {
    const reply = s.message("a", "assistant", "图片");
    reply.element.innerHTML = '<div class="avatar"><img src="https://img.test/repeat.png" alt="同图"></div><div class="thinking"><img src="https://img.test/repeat.png" alt="同图"></div><img hidden src="https://img.test/repeat.png" alt="同图"><img src="https://img.test/pixel.png" width="1" height="1"><button><img src="https://img.test/repeat.png" alt="同图"></button><img src="https://img.test/repeat.png" alt="同图" class="body-first"><img src="https://img.test/repeat.png" alt="同图" class="body-second">';
    reply.blocks = domMessageBlocks(reply.element);
    s.mount([reply]); await s.ready();
    assert.equal(s.controller.resolveTarget("index:a:image:0", {}), reply.element.querySelector(".body-first"));
    assert.equal(s.controller.resolveTarget("index:a:image:1", {}), reply.element.querySelector(".body-second"));
  } finally { s.close(); }
});

test("Kimi duplicate file labels use attachment ordinals and omit file metadata", async () => {
  const s = setup();
  try {
    const user = s.message("u", "user", "附件");
    user.element.innerHTML = '<div class="file-card-info" data-native="first">报告<div class="file-card-info-detail"><span class="file-ext">MD</span><span class="file-size">56 KB</span></div></div><div class="file-card-info">其他文件<div class="file-card-info-detail"><span class="file-ext">PDF</span></div></div><div class="file-card-info" data-native="last">报告<div class="file-card-info-detail"><span class="file-ext">MD</span><span class="file-size">72 KB</span></div></div><p>分析附件</p>';
    user.blocks = domMessageBlocks(user.element, { role: "user" });
    s.mount([user]); await s.ready();
    assert.equal(s.controller.resolveTarget("index:u:attachment:0", {}), user.element.querySelector('[data-native="first"]'));
    assert.equal(s.controller.resolveTarget("index:u:attachment:2", {}), user.element.querySelector('[data-native="last"]'));
  } finally { s.close(); }
});

async function waitForBackfill(controller, timeout = 6000) {
  const deadline = Date.now() + timeout;
  await pause(5);
  while (controller.snapshot()?.backfill?.phase === "running" && Date.now() < deadline) await pause(10);
  // Allow the restore frame to remove the mask.
  await pause(80);
  return controller.snapshot()?.backfill?.phase;
}

// A scroller whose older page mounts above the reader when its top is reached,
// keeping the reader's message in place like a native anchored list.
function lazyHistory(s, { older, newer }) {
  let loaded = false; const seen = [];
  Object.defineProperties(s.scroller, {
    scrollHeight: { get: () => loaded ? 1000 : 500 }, clientHeight: { value: 400 }
  });
  newer.element.getBoundingClientRect = () => ({ top: (loaded ? 900 : 400) - s.scroller.scrollTop });
  s.scroller.scrollTo = ({ top }) => {
    seen.push({ top, opacity: s.scroller.style.opacity, masked: Boolean(s.win.document.querySelector("[data-polaris-backfill]")) });
    s.scroller.scrollTop = top;
    if (top <= 0 && !loaded) { loaded = true; s.mount([older, newer]); s.scroller.scrollTop = 500; }
  };
  s.scroller.scrollTop = 100;
  return { seen, viewportTop: () => newer.element.getBoundingClientRect().top };
}

test("long mode backfills older messages beneath a mask and restores the reader's place", async () => {
  const s = setup();
  try {
    const older = s.message("old", "assistant", "更早章节"); const newer = s.message("new", "user", "当前问题");
    s.scroller.style.opacity = "0.9";
    s.mount([newer]);
    const page = lazyHistory(s, { older, newer });
    const before = page.viewportTop();
    s.controller.configure(true, { retainLoaded: true, backfill: true }); await s.controller.syncMounted();
    assert.equal(await waitForBackfill(s.controller), "done");
    assert.ok(page.seen.length > 0);
    assert.ok(page.seen.every((entry) => entry.opacity === "0" && entry.masked), "the list must be hidden whenever it is scrolled");
    assert.deepEqual(s.controller.outline({}).items.map((item) => item.markerKey), ["index:old:0:0", "index:new"]);
    assert.equal(s.controller.snapshot().coverage, "loaded", "reaching the top is not proof of complete history");
    assert.equal(page.viewportTop(), before);
    assert.equal(s.scroller.style.opacity, "0.9");
    assert.equal(s.win.document.querySelector("[data-polaris-backfill]"), null);
  } finally { s.close(); }
});

test("user input stops backfill, restores the page and continue resumes it", async () => {
  const s = setup();
  try {
    const older = s.message("old", "assistant", "更早章节"); const newer = s.message("new", "user", "当前问题");
    s.mount([newer]);
    const page = lazyHistory(s, { older, newer });
    const before = page.viewportTop();
    s.controller.configure(true, { retainLoaded: true, backfill: true }); await s.controller.syncMounted();
    await pause(5);
    assert.equal(s.controller.snapshot().backfill.phase, "running");
    assert.ok(s.win.document.querySelector("[data-polaris-backfill]"));
    s.win.dispatchEvent(new s.win.Event("pointerdown"));
    assert.equal(await waitForBackfill(s.controller), "stopped");
    assert.equal(page.viewportTop(), before);
    assert.equal(s.scroller.style.opacity, "");
    assert.equal(s.win.document.querySelector("[data-polaris-backfill]"), null);
    void s.controller.backfill({ resume: true });
    assert.equal(await waitForBackfill(s.controller), "done");
    assert.ok(s.controller.outline({}).items.some((item) => item.markerKey === "index:old:0:0"));
  } finally { s.close(); }
});

test("backfill timeout keeps read messages and removes the mask", async () => {
  const s = setup();
  try {
    const older = s.message("old", "assistant", "更早章节"); const newer = s.message("new", "user", "当前问题");
    s.mount([newer]); lazyHistory(s, { older, newer });
    let clock = 0;
    Object.defineProperty(s.win.performance, "now", { configurable: true, value: () => { clock += 100000; return clock; } });
    s.controller.configure(true, { retainLoaded: true, backfill: true }); await s.controller.syncMounted();
    assert.equal(await waitForBackfill(s.controller), "timeout");
    assert.equal(s.controller.snapshot().count, 1);
    assert.equal(s.scroller.style.opacity, "");
    assert.equal(s.win.document.querySelector("[data-polaris-backfill]"), null);
  } finally { s.close(); }
});

test("backfill runs once per index, never in Follow the page mode, and not after a confirmed rebuild", async () => {
  const s = setup();
  try {
    const scrolls = [];
    s.scroller.scrollTo = ({ top }) => scrolls.push(top);
    s.mount([s.message("u", "user", "问题")]);
    await s.ready(true); await pause(30);
    assert.equal(scrolls.length, 0);
    assert.equal(s.controller.snapshot().backfill, undefined);
    s.controller.configure(true, { retainLoaded: true, backfill: true }); await s.controller.syncMounted();
    assert.equal(await waitForBackfill(s.controller), "done");
    s.mount([s.message("u", "user", "问题"), s.message("a", "assistant", "回答")]); await s.controller.syncMounted();
    await pause(30);
    assert.equal(s.controller.snapshot().backfill.phase, "done", "later batches do not start another backfill");
    await s.controller.rebuild(); await pause(30);
    assert.equal(s.controller.snapshot().backfill, undefined);
  } finally { s.close(); }
});

test("disposing during backfill restores the list and removes the mask", async () => {
  const s = setup();
  try {
    const older = s.message("old", "assistant", "更早章节"); const newer = s.message("new", "user", "当前问题");
    s.mount([newer]); lazyHistory(s, { older, newer });
    s.controller.configure(true, { retainLoaded: true, backfill: true }); await s.controller.syncMounted();
    await pause(5);
    assert.ok(s.win.document.querySelector("[data-polaris-backfill]"));
    s.controller.dispose();
    await pause(250);
    assert.equal(s.scroller.style.opacity, "");
    assert.equal(s.win.document.querySelector("[data-polaris-backfill]"), null);
  } finally { s.win.close(); }
});

test("backfill waits while the page is hidden and continues once it is visible again", async () => {
  const s = setup();
  try {
    let hidden = true;
    Object.defineProperty(s.win.document, "hidden", { configurable: true, get: () => hidden });
    const older = s.message("old", "assistant", "更早章节"); const newer = s.message("new", "user", "当前问题");
    s.mount([newer]);
    const page = lazyHistory(s, { older, newer });
    s.controller.configure(true, { retainLoaded: true, backfill: true }); await s.controller.syncMounted();
    await pause(300);
    assert.equal(s.controller.snapshot().backfill.phase, "running");
    assert.equal(page.seen.length, 0, "no scrolling while the user cannot see the page");
    hidden = false; s.win.document.dispatchEvent(new s.win.Event("visibilitychange"));
    assert.equal(await waitForBackfill(s.controller), "done");
    assert.ok(page.seen.length > 0);
  } finally { s.close(); }
});
