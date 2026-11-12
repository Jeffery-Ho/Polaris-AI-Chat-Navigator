import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createConversationIndex } from "../src/conversation-index.js";
import { appendIndexedChapterBlock } from "../src/indexed-chapter-content.js";
import { chapterTreeText } from "../src/sidepanel-chapter-state.js";

const paragraph = (value) => ({ type: "paragraph", children: [{ type: "text", value }] });
const message = (id, text = id, role = "user", extra = {}) => ({ id, role, blocks: [paragraph(text)], ...extra });
const order = (index) => index.exportConversation().messages.map((record) => record.text);

test("structured windows retain known order and insert newly mounted messages between adjacent anchors", async () => {
  const index = createConversationIndex({ platform: "kimi" });
  await index.upsertMessages([message("u1", "继续"), message("a1", "首轮", "assistant"), message("u3", "继续"), message("a3", "末轮", "assistant")]);
  await index.upsertMessages([message("a1", "首轮", "assistant"), message("u2", "继续"), message("a2", "中间轮", "assistant"), message("u3", "继续")]);
  assert.deepEqual(order(index), ["继续", "首轮", "继续", "中间轮", "继续", "末轮"]);
  await index.upsertMessages([message("u1", "继续"), message("a1", "已更新首轮", "assistant")]);
  assert.deepEqual(order(index), ["继续", "已更新首轮", "继续", "中间轮", "继续", "末轮"]);
  assert.equal((await index.search("继续")).total, 3, "identical prompts are separate messages");
  assert.equal((await index.search("已更新首轮")).total, 1);
  await index.upsertMessages([message("old")], { older: true });
  await index.upsertMessages([message("new")]);
  assert.deepEqual(order(index), ["old", "继续", "已更新首轮", "继续", "中间轮", "继续", "末轮", "new"]);
});

test("structured updates deduplicate each window and authoritative replacement removes old branches", async () => {
  const index = createConversationIndex();
  await index.upsertMessages([message("u1", "旧内容"), message("u1", "新内容"), message("removed")]);
  assert.deepEqual(order(index), ["新内容", "removed"]);
  assert.equal(index.getOutline().items.length, 2);
  assert.equal((await index.search("新内容")).total, 1);
  await index.upsertMessages([message("u2"), message("u1", "新内容")], { replace: true, coverage: "complete" });
  assert.deepEqual(order(index), ["u2", "新内容"]);
  assert.equal((await index.search("removed")).total, 0);
});

test("unchanged windows retain the revision and cancelled windows cannot commit", async () => {
  const index = createConversationIndex();
  await index.upsertMessages([message("u")]);
  const revision = index.status().revision;
  await index.upsertMessages([message("u")]);
  assert.equal(index.status().revision, revision);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(index.upsertMessages([message("late")], { signal: controller.signal }), { name: "AbortError" });
  assert.deepEqual(order(index), ["u"]);
});

test("structured coverage keeps a ready loaded window distinct from a complete conversation", async () => {
  const index = createConversationIndex();
  await index.upsertMessages([message("u")]);
  assert.equal(index.status().phase, "complete");
  assert.equal(index.status().coverage, "loaded");
  assert.equal(index.status().total, null);
  assert.equal(index.exportConversation().scope, "loaded");
  assert.equal(index.exportConversation("complete").scope, "loaded", "a caller cannot promote incomplete history");
  await index.upsertMessages([message("u")], { coverage: "complete" });
  assert.equal(index.status().total, 1);
  assert.equal(index.exportConversation().scope, "complete");
  assert.equal(index.exportConversation("loaded").scope, "loaded");
  await index.upsertMessages([message("u")], { complete: false });
  assert.equal(index.exportConversation(), null);
});

test("explicit replyTo owns headings and preambles independently of neighboring questions", async () => {
  const index = createConversationIndex();
  await index.upsertMessages([
    message("u1", "第一个问题"), message("u2", "第二个问题"),
    message("a1", "", "assistant", { replyTo: "u1", blocks: [paragraph("属于第一个问题的前言"), { type: "heading", level: 2, children: [{ type: "text", value: "章节" }] }, paragraph("章节内容")] }),
    message("orphan", "独立回答", "assistant", { replyTo: "" }),
    message("a2", "属于第二个问题", "assistant")
  ]);
  const tree = index.getOutline();
  assert.match(chapterTreeText(tree.chapters, "index:u1"), /属于第一个问题的前言[\s\S]*章节内容/);
  assert.doesNotMatch(chapterTreeText(tree.chapters, "index:u2"), /第一个问题的前言|独立回答/);
  assert.match(chapterTreeText(tree.chapters, "index:u2"), /属于第二个问题/);
  assert.equal(tree.items.find((item) => item.title === "章节").groupKey, "index:u1");
  assert.equal(tree.chapters.find((node) => node.markerKey === "index:orphan").parentKey, "");
  assert.equal(tree.chapters.some((node) => node.markerKey === "index:a1"), false);
});

test("an explicit user root precedes its answer content even when mounted after the answer", async () => {
  const index = createConversationIndex();
  await index.upsertMessages([message("a", "回答", "assistant", { replyTo: "u" }), message("u", "提问")]);
  assert.equal(chapterTreeText(index.getOutline().chapters), "提问\n\n回答");
});

test("structured attachments and images retain names, metadata and source targets in both roles", async () => {
  const index = createConversationIndex({ platform: "kimi" });
  const upload = { type: "attachment", name: "需求说明.pdf", mimeType: "application/pdf", url: "https://www.kimi.com/files/spec" };
  const picture = { type: "image", src: "https://images.example.com/reference.png", alt: "参考图" };
  const source = [message("u", "分析附件", "user", { blocks: [paragraph("分析附件"), upload, picture] }),
    message("a", "", "assistant", { replyTo: "u", blocks: [paragraph("附件分析"), { ...upload, name: "分析结果.pdf" }, { ...picture, alt: "结果图" }] })];
  await index.upsertMessages(source);
  const tree = index.getOutline();
  const user = tree.items.find((item) => item.type === "user");
  assert.equal(user.title, "分析附件");
  assert.deepEqual(user.imageUrls, [picture.src]);
  assert.equal(user.thumbnailSrc, picture.src);
  assert.equal(user.imageCount, 1);
  assert.equal(user.attachments[0].name, upload.name);
  assert.equal(tree.targets.get("index:u:attachment:0").attachmentKey, "u:attachment:0");
  assert.equal(tree.targets.get("index:u:image:0").imageKey, "u:image:0");
  const file = tree.items.find((item) => item.attachment);
  assert.equal(file.title, "分析结果.pdf");
  assert.equal(tree.targets.get(file.markerKey).blockType, "attachment");
  assert.equal(tree.items.find((item) => item.image)?.groupKey, "index:u");
  assert.equal((await index.search("需求说明.pdf")).total, 1);
  assert.equal((await index.search("www.kimi.com/files")).total, 0, "attachment URLs are not visible search text");
  assert.equal(tree.chapters.find((node) => node.markerKey === "index:u").contents[1].ast.type, "attachment");
  assert.equal(Object.hasOwn(upload, "attachmentKey"), false, "caller-owned AST is not mutated");
  assert.equal(Object.hasOwn(picture, "imageKey"), false);
});

test("user titles prefer pure question text regardless of preceding attachments or inline images", async () => {
  const index = createConversationIndex({ imagePlaceholder: "[图片]" });
  const file = { type: "attachment", name: "历史记录.md" };
  const image = { type: "image", src: "https://cdn.test/input.png", alt: "图片说明" };
  await index.upsertMessages([
    message("mixed", "", "user", { blocks: [file, image, { type: "paragraph", children: [
      { type: "text", value: "复述 " }, image, { type: "text", value: " 最后三轮对话" }
    ] }] }),
    message("files", "", "user", { blocks: [file, { ...file, name: "补充.pdf" }] }),
    message("images", "", "user", { blocks: [image, image] })
  ]);
  const { items, chapters } = index.getOutline();
  assert.equal(items[0].title, "复述 最后三轮对话");
  assert.equal(chapters[0].title, "复述 最后三轮对话");
  assert.equal(items[1].title, "历史记录.md\n\n补充.pdf");
  assert.equal(items[2].title, "[图片]");
  assert.deepEqual(chapters[0].contents.map((part) => part.ast.type), ["attachment", "image", "paragraph"]);
  assert.match(chapterTreeText(chapters, "index:mixed"), /历史记录.md[\s\S]*图片说明[\s\S]*复述 图片说明 最后三轮对话/);
});

test("structured formatting respects platform level, strong and list settings without reading code as headings", async () => {
  const index = createConversationIndex({ platform: "kimi" });
  await index.upsertMessages([message("u"), message("a", "", "assistant", { blocks: [
    { type: "heading", level: 2, children: [{ type: "text", value: "二级标题" }] },
    { type: "heading", level: 3, children: [{ type: "text", value: "三级标题" }] },
    { type: "paragraph", children: [{ type: "strong", children: [{ type: "text", value: "加粗标题" }] }] },
    { type: "list", ordered: false, items: [{ inline: [{ type: "text", value: "列表标题：正文" }], children: [] }] },
    { type: "codeBlock", value: "## 代码中的标题", language: "md" }
  ] })]);
  const config = { enabledLevelsByPlatform: { kimi: [1, 2] }, enabledStrongByPlatform: { kimi: false }, enabledUnorderedListByPlatform: { kimi: false } };
  assert.deepEqual(index.getOutline(config).items.filter((item) => item.type === "ai").map((item) => item.title), ["二级标题"]);
  assert.match(chapterTreeText(index.getOutline(config).chapters), /三级标题[\s\S]*加粗标题[\s\S]*列表标题[\s\S]*代码中的标题/);
});

test("repeated native titles expose occurrence ordinals without merging their source keys", async () => {
  const index = createConversationIndex();
  const heading = { type: "heading", level: 2, children: [{ type: "text", value: "相同标题" }] };
  await index.upsertMessages([message("u"), message("a", "", "assistant", { blocks: [heading, paragraph("正文"), heading] })]);
  const tree = index.getOutline();
  const headings = tree.items.filter((item) => item.title === "相同标题");
  assert.deepEqual(headings.map((item) => tree.targets.get(item.markerKey).ordinal), [0, 1]);
  assert.deepEqual(headings.map((item) => tree.targets.get(item.markerKey).blockOrdinal), [0, 2]);
});

test("bold list titles obey only the strong toggle while textual lists obey their own toggles", async () => {
  const index = createConversationIndex({ platform: "kimi" });
  const list = (ordered, label) => ({ type: "list", ordered, items: [
    { inline: [{ type: "strong", children: [{ type: "text", value: `${label}加粗标题` }] }, { type: "text", value: "：正文" }], children: [] },
    { inline: [{ type: "text", value: `${label}文本标题：正文` }], children: [] }
  ] });
  await index.upsertMessages([message("u"), message("a", "", "assistant", { blocks: [list(false, "无序"), list(true, "有序")] })]);
  const titles = (strong, unordered, ordered) => index.getOutline({ enabledStrongByPlatform: { kimi: strong },
    enabledUnorderedListByPlatform: { kimi: unordered }, enabledOrderedListByPlatform: { kimi: ordered } }).items.filter((item) => item.type === "ai").map((item) => item.title);
  assert.deepEqual(titles(false, true, true), ["无序文本标题", "有序文本标题"]);
  assert.deepEqual(titles(true, false, false), ["无序加粗标题", "有序加粗标题"]);
  assert.deepEqual(titles(false, false, false), []);
});

test("list recognition keeps clear short titles and rejects prose and nested structural content", async () => {
  const index = createConversationIndex();
  const item = (value, children = []) => ({ inline: [{ type: "text", value }], children });
  await index.upsertMessages([message("u"), message("a", "", "assistant", { blocks: [{ type: "list", ordered: false, items: [
    item("独立标题"), item(`长说明：${"解释".repeat(65)}`), item("甲：正文"), item("长度".repeat(25)), item("短句。后面还有正文"),
    item(`超长说明：${"解释".repeat(100)}`),
    item("嵌套列表", [{ type: "list", ordered: false, items: [item("子标题")] }]),
    item("含代码", [{ type: "codeBlock", value: "const x=1" }]),
    item("含引用", [{ type: "quote", blocks: [paragraph("引文")] }]),
    item("含表格", [{ type: "table", headers: [[{ type: "text", value: "表头" }]], rows: [] }])
  ] }] })]);
  assert.deepEqual(index.getOutline().items.filter((item) => item.type === "ai").map((item) => item.title), ["独立标题", "长说明", "甲：正文"]);
  assert.match(chapterTreeText(index.getOutline().chapters), /短句。后面还有正文[\s\S]*const x=1/);
});

test("invalid structured windows reject atomically and public attachment projection strips arbitrary metadata", async () => {
  const index = createConversationIndex();
  await index.upsertMessages([message("u")]);
  await assert.rejects(index.upsertMessages([message("new"), message("invalid", "", "tool")]), /unsupported-format/);
  assert.deepEqual(order(index), ["u"]);
  await index.upsertMessages([message("file", "", "user", { blocks: [{ type: "attachment", name: "原文.txt", metadata: { token: "secret" } }] })]);
  assert.doesNotMatch(JSON.stringify(index.exportConversation()), /secret|metadata/);
});

test("indexed attachment renderer uses text and accepts only safe HTTP links", () => {
  const dom = new JSDOM("<main></main>", { url: "https://www.kimi.com/chat/test" });
  try {
    const doc = dom.window.document;
    const main = doc.querySelector("main");
    appendIndexedChapterBlock(main, { type: "attachment", name: "<img onerror=alert(1)>.pdf", mimeType: "application/pdf", url: "https://www.kimi.com/files/a" }, doc);
    assert.equal(main.querySelector("a").textContent, "<img onerror=alert(1)>.pdf");
    assert.equal(main.querySelector("a").href, "https://www.kimi.com/files/a");
    assert.match(main.textContent, /application\/pdf/);
    assert.equal(main.querySelector("img"), null);
    appendIndexedChapterBlock(main, { type: "attachment", name: "无效链接.txt", url: "javascript:alert(1)" }, doc);
    appendIndexedChapterBlock(main, { type: "attachment", name: "无链接.txt" }, doc);
    assert.equal(main.querySelectorAll("a").length, 1);
    assert.match(main.textContent, /无效链接.txt/);
    assert.match(main.textContent, /无链接.txt/);
  } finally { dom.window.close(); }
});
