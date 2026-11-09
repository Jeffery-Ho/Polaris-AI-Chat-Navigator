import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createDOMIndexController } from "../src/dom-index-controller.js";
import { domMessageBlocks } from "../src/dom-message-blocks.js";

const paragraph = (value) => ({ type: "paragraph", children: [{ type: "text", value }] });
const heading = (value) => ({ type: "heading", level: 2, children: [{ type: "text", value }] });
const pause = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForIdle(controller) {
  const deadline = Date.now() + 4000;
  while (controller.snapshot()?.refreshing && Date.now() < deadline) await pause(10);
  assert.equal(controller.snapshot()?.refreshing, false, "native reading should settle");
}

function setup({ url = "https://www.kimi.com/chat/one" } = {}) {
  const dom = new JSDOM('<title>测试会话 - Kimi</title><div id="scroller"></div>', { url });
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
    async ready(full = false) { controller.configure(true, { readFull: full }); await controller.syncMounted(); },
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
    await waitForIdle(s.controller);
    assert.equal(s.controller.snapshot().coverage, "loaded");
    assert.equal(s.controller.snapshot().phase, "complete");
    assert.equal(s.controller.snapshot().native.phase, "ready");
    assert.equal(s.controller.snapshot().refreshing, false);
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

test("native history rehydrates an unmounted message before reporting a located heading", async () => {
  const s = setup();
  try {
    const older = s.message("old", "assistant", "目标章节"); const newer = s.message("new", "user", "新问题");
    Object.defineProperties(s.scroller, { scrollHeight: { value: 2000 }, clientHeight: { value: 500 } });
    s.mount([older]); await s.ready();
    s.mount([newer]); await s.controller.syncMounted(); s.scroller.scrollTop = 1000;
    s.scroller.scrollTo = ({ top }) => {
      s.scroller.scrollTop = top;
      if (top < 900) s.mount([older, newer]);
    };
    const located = await s.controller.ensureLocation("index:old:0:0", {});
    assert.equal(located.element, older.element.querySelector("h2"));
    assert.equal(located.reason, "");
    assert.equal(located.element.isConnected, true);
  } finally { s.close(); }
});

test("user input cancels native navigation while retaining readable indexed messages", async () => {
  const s = setup();
  try {
    const older = s.message("old", "assistant", "旧标题"); const newer = s.message("new", "user", "新问题");
    s.mount([older]); await s.ready(); s.mount([newer]); await s.controller.syncMounted();
    Object.defineProperties(s.scroller, { scrollHeight: { value: 2000 }, clientHeight: { value: 500 } });
    s.scroller.scrollTop = 1000; s.scroller.scrollTo = ({ top }) => { s.scroller.scrollTop = top; };
    const pending = s.controller.ensureLocation("index:old:0:0", {});
    await pause(); s.win.dispatchEvent(new s.win.WheelEvent("wheel"));
    assert.deepEqual(await pending, { element: null, reason: "user-cancelled" });
    assert.equal(s.controller.snapshot().count, 2);
    assert.equal(s.controller.snapshot().native.phase, "ready");
    assert.equal((await s.controller.search("旧标题")).total, 1);
  } finally { s.close(); }
});

test("route changes cancel native navigation and disposal releases its pending waits", async () => {
  const s = setup();
  try {
    const older = s.message("old", "assistant", "旧标题");
    s.mount([older]); await s.ready(); s.mount([]); await s.controller.syncMounted();
    Object.defineProperties(s.scroller, { scrollHeight: { value: 2000 }, clientHeight: { value: 500 } });
    s.scroller.scrollTop = 1000; s.scroller.scrollTo = ({ top }) => { s.scroller.scrollTop = top; };
    const pending = s.controller.ensureLocation("index:old:0:0", {});
    await pause(); s.win.history.pushState({}, "", "/chat/two"); await s.ready();
    assert.deepEqual(await pending, { element: null, reason: "source-changed" });
    const idle = s.controller.retry(); s.controller.dispose(); await idle;
    assert.equal(s.controller.snapshot(), null);
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

test("turning off full reading cancels scanning without clearing the currently loaded index", async () => {
  const s = setup();
  try {
    Object.defineProperties(s.scroller, { scrollHeight: { value: 2000 }, clientHeight: { value: 500 } });
    s.scroller.scrollTop = 1000; s.scroller.scrollTo = ({ top }) => { s.scroller.scrollTop = top; };
    s.mount([s.message("u", "user", "提问")]); await s.ready(true); await pause();
    s.controller.configure(true, { readFull: false }); await pause(10);
    assert.equal(s.controller.snapshot().count, 1);
    assert.equal(s.controller.snapshot().refreshing, false);
    s.controller.configure(false); assert.equal(s.controller.snapshot(), null);
  } finally { s.close(); }
});

test("native history collects older pages through an explicit load action without inventing completeness", async () => {
  const s = setup();
  try {
    const older = s.message("old", "user", "更早的问题"); const newer = s.message("new", "user", "当前问题");
    const load = s.win.document.createElement("button"); load.textContent = "Load earlier"; s.win.document.body.append(load);
    Object.defineProperties(s.scroller, { scrollHeight: { value: 500 }, clientHeight: { value: 500 } });
    s.scroller.scrollTo = ({ top }) => { s.scroller.scrollTop = top; };
    s.mount([newer], { loadEarlier: load, hasEarlier: true });
    load.addEventListener("click", () => { load.remove(); s.mount([older, newer], { loadEarlier: null, hasEarlier: false }); });
    await s.ready(true); await waitForIdle(s.controller);
    assert.deepEqual(s.controller.outline({}).items.map((item) => item.markerKey), ["index:old", "index:new"]);
    assert.equal(s.controller.snapshot().coverage, "loaded");
    assert.equal(s.controller.snapshot().refreshing, false);
  } finally { s.close(); }
});

test("native navigation timeout leaves previously read content available", async () => {
  const s = setup();
  try {
    const older = s.message("old", "assistant", "旧标题");
    s.mount([older]); await s.ready(); s.mount([]); await s.controller.syncMounted();
    let clock = 0;
    Object.defineProperty(s.win.performance, "now", { value: () => { clock += 25000; return clock; } });
    assert.deepEqual(await s.controller.ensureLocation("index:old:0:0", {}), { element: null, reason: "native-load-timeout" });
    assert.equal(s.controller.snapshot().count, 1);
    assert.equal((await s.controller.search("旧标题")).total, 1);
    assert.equal(s.controller.exportConversation().scope, "loaded");
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

for (const reverseFlow of [false, true]) {
  test(`full reading visits both ends from a middle virtual window (column-reverse: ${reverseFlow})`, async () => {
    const s = setup();
    try {
      const messages = Array.from({ length: 5 }, (_, i) => s.message(`u${i}`, "user", `问题${i}`));
      s.scroller.style.display = "flex";
      s.scroller.style.flexDirection = reverseFlow ? "column-reverse" : "column";
      Object.defineProperties(s.scroller, { scrollHeight: { value: 500 }, clientHeight: { value: 100 } });
      const initialTop = reverseFlow ? -200 : 200;
      s.scroller.scrollTop = initialTop;
      const visited = [];
      s.scroller.scrollTo = ({ top }) => {
        s.scroller.scrollTop = top; visited.push(top);
        const position = Math.round((reverseFlow ? top + 400 : top) / 100);
        s.mount([messages[position]]);
      };
      s.mount([messages[2]]);
      await s.ready(true); await waitForIdle(s.controller);
      assert.deepEqual(s.controller.outline({}).items.map((item) => item.markerKey), messages.map((message) => `index:${message.id}`));
      assert.ok(visited.includes(reverseFlow ? -400 : 0));
      assert.ok(visited.includes(reverseFlow ? 0 : 400));
      assert.equal(s.scroller.scrollTop, initialTop);
      assert.equal(s.controller.snapshot().coverage, "loaded");
      assert.equal(s.controller.snapshot().historyError, "");
    } finally { s.close(); }
  });
}

for (const reverseFlow of [false, true]) {
  test(`retry preserves the newer sweep and eventually visits both ends (column-reverse: ${reverseFlow})`, async () => {
    const s = setup();
    try {
      const messages = Array.from({ length: 5 }, (_, i) => s.message(`u${i}`, "user", `问题${i}`));
      s.scroller.style.cssText = `display:flex;flex-direction:${reverseFlow ? "column-reverse" : "column"}`;
      Object.defineProperties(s.scroller, { scrollHeight: { value: 500 }, clientHeight: { value: 100 } });
      const initialTop = reverseFlow ? -200 : 200; let clock = 0; const visits = [];
      Object.defineProperty(s.win.performance, "now", { value: () => clock });
      s.scroller.scrollTop = initialTop;
      s.scroller.scrollTo = ({ top }) => {
        if (top > s.scroller.scrollTop) clock += 11000;
        s.scroller.scrollTop = top; visits.push(top);
        s.mount([messages[Math.round((reverseFlow ? top + 400 : top) / 100)]]);
      };
      s.mount([messages[2]]); await s.ready(true); await waitForIdle(s.controller);
      assert.equal(s.controller.snapshot().historyError, "native-load-timeout");
      const nextStart = visits.length;
      await s.controller.retry();
      assert.equal(visits[nextStart], reverseFlow ? -220 : 180, "retry resumes the newer sweep with overlap");
      assert.ok(s.controller.outline({}).items.some((item) => item.markerKey === "index:u3"));
      let final;
      for (let attempt = 0; attempt < 3; attempt++) {
        final = await s.controller.retry();
        if (!final.reason) break;
      }
      assert.equal(final.reason, "");
      assert.deepEqual(s.controller.outline({}).items.map((item) => item.markerKey), messages.map((message) => `index:${message.id}`));
      assert.equal(s.scroller.scrollTop, initialTop);
      assert.equal(s.controller.snapshot().coverage, "loaded");
    } finally { s.close(); }
  });
}

test("column-reverse native navigation reaches negative history offsets before reporting success", async () => {
  const s = setup();
  try {
    const older = s.message("old", "assistant", "旧章节"); const middle = s.message("middle", "user", "当前问题");
    s.scroller.style.cssText = "display:flex;flex-direction:column-reverse";
    Object.defineProperties(s.scroller, { scrollHeight: { value: 500 }, clientHeight: { value: 100 } });
    s.mount([older]); await s.ready(); s.mount([middle]); await s.controller.syncMounted();
    s.scroller.scrollTop = -200;
    s.scroller.scrollTo = ({ top }) => { s.scroller.scrollTop = top; if (top <= -400) s.mount([older]); };
    const result = await s.controller.ensureLocation("index:old:0:0", {});
    assert.equal(result.element, older.element.querySelector("h2"));
    assert.equal(result.reason, "");
    assert.equal(s.scroller.scrollTop, -400);
  } finally { s.close(); }
});

test("cancelling a column-reverse full scan preserves the user's chosen scroll position", async () => {
  const s = setup();
  try {
    s.scroller.style.cssText = "display:flex;flex-direction:column-reverse";
    Object.defineProperties(s.scroller, { scrollHeight: { value: 1000 }, clientHeight: { value: 100 } });
    s.mount([s.message("u", "user", "问题")]); s.scroller.scrollTop = -300;
    s.scroller.scrollTo = ({ top }) => { s.scroller.scrollTop = top; };
    await s.ready(true); await pause();
    s.scroller.scrollTop = -175; s.win.dispatchEvent(new s.win.WheelEvent("wheel"));
    await waitForIdle(s.controller);
    assert.equal(s.scroller.scrollTop, -175);
    assert.equal(s.controller.snapshot().historyError, "user-cancelled");
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

for (const reverseFlow of [false, true]) {
  test(`retry resumes a budget-limited scan beyond the previously read history (column-reverse: ${reverseFlow})`, async () => {
    const s = setup();
    try {
      const messages = Array.from({ length: 30 }, (_, i) => s.message(`u${i}`, "user", `问题${i}`));
      s.scroller.style.cssText = `display:flex;flex-direction:${reverseFlow ? "column-reverse" : "column"}`;
      Object.defineProperties(s.scroller, { scrollHeight: { value: 3000 }, clientHeight: { value: 100 } });
      const initialTop = reverseFlow ? 0 : 2900; let clock = 0;
      Object.defineProperty(s.win.performance, "now", { value: () => clock });
      s.scroller.scrollTop = initialTop;
      s.scroller.scrollTo = ({ top }) => {
        clock += 11000; s.scroller.scrollTop = top;
        const position = Math.round((reverseFlow ? top + 2900 : top) / 100);
        s.mount([messages[position]]);
      };
      s.mount([messages[29]]);
      await s.ready(true); await waitForIdle(s.controller);
      assert.equal(s.controller.snapshot().historyError, "native-load-timeout");
      const firstCount = s.controller.snapshot().count;
      assert.equal(firstCount, 2);
      assert.equal(s.scroller.scrollTop, initialTop);
      const result = await s.controller.retry();
      assert.equal(result.reason, "native-load-timeout");
      assert.ok(s.controller.snapshot().count > firstCount, "retry must read a new earlier message");
      assert.ok(s.controller.outline({}).items.some((item) => item.markerKey === "index:u27"));
      assert.equal(s.scroller.scrollTop, initialTop);
      assert.equal(s.controller.snapshot().coverage, "loaded");
    } finally { s.close(); }
  });
}
