import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createSidepanelChapterReader } from "../src/sidepanel-chapter-reader.js";
import { collectSidepanelChapters } from "../src/sidepanel-chapter-content.js";
import { createConversationIndex } from "../src/conversation-index.js";
const nodes = [
  { markerKey: "a", sourceKey: "a", parentKey: "", title: "甲", contents: [{ type: "block", text: "引言", html: "<p>引言</p>" }, { type: "child", key: "b" }] },
  { markerKey: "b", sourceKey: "b", parentKey: "a", title: "子章", contents: [{ type: "block", text: "正文", html: "<p>正文</p>" }] },
  { markerKey: "c", sourceKey: "c", parentKey: "", title: "乙", contents: [{ type: "block", text: "结尾", html: "<p>结尾</p>" }] }
];
function setup(overrides = {}) {
  const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true, url: "https://test.local" });
  const { document } = dom.window;
  dom.window.scrollTo = (options, y) => { Object.defineProperty(dom.window, "scrollY", { value: typeof options === "object" ? options.top : y, configurable: true }); };
  let query = "";
  const copied = []; const located = [];
  const reader = createSidepanelChapterReader({ document, locale: "zh", onCopy: async (text) => copied.push(text), onLocate: async (key) => located.push(key), onQueryChange: (value) => { query = value; }, ...overrides });
  const update = (options = {}) => reader.update({ conversationKey: "one", nodes, preferredKey: "a", query, ready: true, ...options });
  document.body.appendChild(update());
  const click = (text) => {
    const item = [...document.querySelectorAll("button")].find((el) => el.textContent === text);
    assert.ok(item, `missing button ${text}`); item.click();
  };
  return { dom, document, reader, update, click, copied, located };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 25));
test("Outline keeps indexed and HTML image labels without mounting images or download links", async () => {
  const s = setup();
  try {
    s.update({ nodes: [{ ...nodes[0], contents: [
      { type: "block", ast: { type: "image", imageKey: "picture:image:0", src: "sediment://file_one", alt: "Description" } },
      { type: "block", ast: { type: "paragraph", children: [{ type: "text", value: "Before " }, { type: "image", imageKey: "picture:image:1", src: "https://images.example.com/image.png" }, { type: "text", value: " after" }] } },
      { type: "block", html: '<p><a href="https://images.example.com/original"><img src="https://images.example.com/preview.png"></a></p>' }
    ] }] });
    const labels = s.reader.element.querySelectorAll('.chapter-image-label'); assert.equal(labels.length, 3);
    assert.ok([...labels].every((node) => node.textContent === "图片"));
    assert.equal(s.reader.element.querySelector("img"), null); assert.equal(s.reader.element.querySelector('a[href*="images.example.com"]'), null);
    labels[0].click(); await settle(); assert.deepEqual(s.located, ["index:picture:image:0"]);
  } finally { s.dom.window.close(); }
});

test("indexed user attachments render as source-linked Image labels in their original text order", async () => {
  const index = createConversationIndex({ imagePlaceholder: "[图片]" });
  const image = (id) => ({ type: "image", src: `sediment://file_${id}`, alt: "" });
  await index.upsertMessages([{ id: "user", role: "user", blocks: [
    { type: "paragraph", children: [{ type: "text", value: "前文" }] }, image("one"),
    { type: "paragraph", children: [{ type: "text", value: "中间" }] }, image("two"),
    { type: "paragraph", children: [{ type: "text", value: "结尾" }] }
  ] }]);
  const s = setup();
  try {
    s.update({ conversationKey: "user-images", nodes: index.getOutline().chapters, virtualized: true });
    const labels = s.reader.element.querySelectorAll(".chapter-image-label"); assert.equal(labels.length, 2);
    assert.deepEqual([...s.reader.element.querySelectorAll(".chapter-tree-content")].map((part) => part.textContent), ["前文", "图片", "中间", "图片", "结尾"]);
    labels[1].click(); await settle(); assert.deepEqual(s.located, ["index:user:image:1"]);
    assert.equal(s.reader.element.querySelector("img"), null);
    s.document.querySelector(".chapter-node-dot").click(); s.click("复制本章"); await settle();
    assert.equal(s.copied[0], "前文\n\n[图片]\n\n中间\n\n[图片]\n\n结尾");
  } finally { s.dom.window.close(); }
});
test("ChatGPT user prompt renders, expands its answer, copies and locates the user source", async () => {
  const source = new JSDOM('<main><div id="user">可以在模拟器里面安装系统相册么</div><article><p>iOS Simulator 自带系统照片 App。</p></article></main>');
  const user = source.window.document.getElementById("user");
  const chapters = collectSidepanelChapters([source.window.document.querySelector("article")], [], {
    userMessages: [{ element: user, markerKey: "user", title: user.textContent }]
  });
  const s = setup();
  s.update({ nodes: chapters });
  assert.equal(s.reader.element.querySelector(".chapter-node-title").textContent, user.textContent);
  assert.ok(!s.reader.element.textContent.includes("Full text"));
  s.click(user.textContent);
  assert.match(s.reader.element.textContent, /iOS Simulator 自带系统照片 App。/);
  s.document.querySelector('.chapter-node-dot[data-key="user"]').click();
  s.click("复制本章"); await settle();
  assert.equal(s.copied[0], "可以在模拟器里面安装系统相册么\n\niOS Simulator 自带系统照片 App。");
  s.click("定位原文"); await settle();
  assert.deepEqual(s.located, ["user"]);
  source.window.close(); s.dom.window.close();
});
test("indexed outline virtualizes metadata and reads only visible expanded chapter content", async () => {
  const requested = [];
  const s = setup({ onLoadChapter: async (key, format) => {
    requested.push([key, format]);
    return format === "text" ? { text: "完整正文" } : { contents: [{ type: "block", text: "按需正文", ast: { type: "paragraph", children: [{ type: "text", value: "按需正文" }] } }] };
  } });
  try {
    const metadata = Array.from({ length: 20000 }, (_, index) => ({ markerKey: `index:${index}`, sourceKey: `index:${index}`, parentKey: "", title: `章节 ${index}`, contents: [{ type: "block", lazy: true }] }));
    s.reader.update({ conversationKey: "indexed", nodes: metadata, query: "", ready: true, virtualized: true, contentRevision: 1 });
    await settle();
    assert.ok(s.document.querySelectorAll('.chapter-node-title').length <= 120);
    assert.deepEqual(requested, [["index:0", undefined]]);
    assert.match(s.reader.element.textContent, /按需正文/);
    s.document.querySelector('.chapter-node-dot[data-key="index:0"]').click();
    s.click("复制本章"); await settle();
    assert.equal(s.copied.at(-1), "完整正文");
    assert.deepEqual(requested.at(-1), ["index:0", "text"]);
    s.reader.update({ conversationKey: "another", nodes: [], query: "", ready: true, virtualized: true });
    assert.ok(!s.reader.element.textContent.includes("按需正文"));
  } finally { s.dom.window.close(); }
});

test("bullet menu does not navigate source; title expands inline; focus and return work", async () => {
  const s = setup();
  s.document.querySelector('.chapter-node-dot[data-key="b"]').click();
  assert.deepEqual(s.located, []);
  assert.ok(s.document.querySelector('[role="menu"]'));
  s.click("进入当前节点");
  assert.match(s.reader.element.textContent, /全部章节/);
  assert.equal(s.reader.element.querySelectorAll('.chapter-node-title').length, 1);
  assert.match(s.reader.element.textContent, /正文/);
  s.click("全部章节");
  assert.equal(s.reader.element.querySelectorAll('.chapter-node-title').length, 3);
  s.click("子章"); assert.match(s.reader.element.textContent, /正文/);
  assert.deepEqual(s.located, []);
  await settle(); s.dom.window.close();
});
test("chapter copy includes folded descendants but excludes other chapters; menu keyboard and navigation remain independent", async () => {
  const s = setup();
  const dot = s.document.querySelector('.chapter-node-dot[data-key="a"]'); dot.click();
  s.click("复制本章"); await settle();
  assert.equal(s.copied[0], "甲\n\n引言\n\n子章\n\n正文");
  assert.equal(s.document.querySelector('[role="status"]').textContent, "已复制");
  s.document.activeElement.dispatchEvent(new s.dom.window.KeyboardEvent("keydown", { key: "End", bubbles: true }));
  assert.equal(s.document.activeElement.textContent, "复制本章");
  s.document.activeElement.dispatchEvent(new s.dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(s.document.activeElement, dot); assert.equal(s.document.querySelector('[role="menu"]'), null);
  dot.click(); s.click("定位原文"); await settle(); assert.deepEqual(s.located, ["a"]);
  s.dom.window.close();
});
test("failed copy keeps menu and gives nearby error, disappearing node closes it", async () => {
  const s = setup({ onCopy: async () => { throw new Error("denied"); } });
  s.document.querySelector('.chapter-node-dot[data-key="a"]').click();
  s.click("复制本章"); await settle();
  assert.match(s.document.querySelector('[role="status"]').textContent, /失败/);
  s.update({ nodes: [nodes[2]] }); assert.equal(s.document.querySelector('[role="menu"]'), null);
  s.dom.window.close();
});
test("conversation switches restore independent expansion and focus", () => {
  const s = setup();
  s.document.querySelector('.chapter-node-dot[data-key="b"]').click(); s.click("进入当前节点");
  s.update({ conversationKey: "two" }); assert.equal(s.reader.element.querySelectorAll('.chapter-node-title').length, 3);
  s.update(); assert.equal(s.reader.element.querySelectorAll('.chapter-node-title').length, 1);
  assert.match(s.reader.element.textContent, /全部章节/); s.dom.window.close();
});
test("streaming update preserves selected text until selection clears", () => {
  const s = setup();
  const paragraph = s.reader.element.querySelector("p");
  const range = s.document.createRange(); range.selectNodeContents(paragraph);
  const selection = s.document.getSelection(); selection.addRange(range);
  const changed = structuredClone(nodes); changed[0].contents[0].html = "<p>更新正文</p>";
  s.update({ nodes: changed });
  assert.equal(selection.toString(), "引言"); assert.equal(s.reader.element.querySelector("p"), paragraph);
  selection.removeAllRanges(); s.document.dispatchEvent(new s.dom.window.Event("selectionchange"));
  assert.match(s.reader.element.textContent, /更新正文/); s.dom.window.close();
});
test("search ancestor can collapse and cached conversation renders immediately while refreshing", () => {
  const s = setup();
  s.update({ query: "子章" });
  s.click("甲");
  assert.equal(s.reader.element.querySelectorAll('.chapter-node-title').length, 1);
  s.update({ conversationKey: "two", ready: false });
  assert.match(s.reader.element.textContent, /正在读取/);
  s.update({ ready: false });
  assert.match(s.reader.element.textContent, /甲/);
  assert.ok(!s.reader.element.textContent.includes("正在读取"));
  s.dom.window.close();
});
test("disclosure is revealed by entering the bullet, retained across repaint and hidden on leaving the row", () => {
  const s = setup();
  let row = s.reader.element.querySelector('.chapter-node-dot[data-key="a"]').parentElement;
  assert.ok(!row.classList.contains("is-controls-visible"));
  row.querySelector(".chapter-node-dot").dispatchEvent(new s.dom.window.Event("pointerenter"));
  assert.ok(row.classList.contains("is-controls-visible"));
  s.click("甲");
  row = s.reader.element.querySelector('.chapter-node-dot[data-key="a"]').parentElement;
  assert.ok(row.classList.contains("is-controls-visible"));
  row.dispatchEvent(new s.dom.window.Event("pointerleave"));
  assert.ok(!row.classList.contains("is-controls-visible"));
  s.dom.window.close();
});

test("copy feedback appears outside the icon menu and is cleared on suspend", async () => {
  const s = setup();
  try {
    s.document.querySelector('.chapter-node-dot').click();
    const menu = s.document.querySelector('[role="menu"]');
    for (const item of menu.querySelectorAll('[role="menuitem"]')) {
      assert.ok(item.querySelector('svg[aria-hidden="true"]'));
    }
    s.click("复制本章"); await settle();
    const tip = s.document.querySelector('.chapter-action-tip');
    assert.equal(tip.textContent, "已复制");
    assert.equal(tip.getAttribute('role'), 'status');
    assert.equal(menu.contains(tip), false);
    assert.ok(!menu.textContent.includes("已复制"));
    s.document.querySelector('.chapter-node-dot').getBoundingClientRect = () => ({ left: 100, top: 300, bottom: 328 });
    menu.getBoundingClientRect = () => ({ width: 210, height: 150 });
    tip.getBoundingClientRect = () => ({ width: 96, height: 32 });
    s.dom.window.dispatchEvent(new s.dom.window.Event('resize'));
    assert.equal(tip.style.top, '292px');
    assert.equal(tip.style.left, '157px');
    assert.equal(Number.parseFloat(menu.style.top) - Number.parseFloat(tip.style.top) - 32, 8);
    s.reader.suspend();
    assert.equal(tip.isConnected, false);
  } finally { s.dom.window.close(); }
});
