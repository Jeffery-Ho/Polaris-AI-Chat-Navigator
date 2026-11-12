import test from "node:test";
import assert from "node:assert/strict";
import { createConversationIndex, indexedSnippet } from "../src/conversation-index.js";
import { chapterTreeText } from "../src/sidepanel-chapter-state.js";
import { parseChapterMarkdown } from "../src/chapter-markdown.js";

const message = (id, text, role = "assistant", extra = {}) => ({ id, role, blocks: parseChapterMarkdown(text) || [{ type: "paragraph", children: [{ type: "text", value: text }] }], ...extra });

test("initial indexing publishes readable batches while subsequent updates remain atomic", async t => {
  let clock = 0;
  t.mock.method(performance, "now", () => clock += 10);
  const batches = [];
  let initial = true;
  const index = createConversationIndex({ yieldTask: async () => {
    if (initial) {
      assert.equal(index.status().phase, "loading");
      const titles = index.getOutline().items.map(item => item.title);
      assert.ok(titles.length > 0, "already indexed messages must be readable before the remaining batch finishes");
      batches.push(titles);
      assert.equal(index.exportConversation(), null, "partial indexing must not enable exports");
    } else {
      assert.equal(index.getOutline().items[0].title, "Earliest loaded message", "updates to a ready index stay atomic");
    }
  } });
  await index.upsertMessages([message("first", "Earliest loaded message", "user"), message("second", "Next loaded message", "user")], { progressive: true });
  assert.deepEqual(batches[0], ["Earliest loaded message"]);
  assert.equal(index.status().phase, "complete");
  assert.equal(index.exportConversation().messages.length, 2);
  initial = false;
  await index.upsertMessages([message("first", "Updated message", "user")], { progressive: true });
  assert.equal(index.getOutline().items[0].title, "Updated message");
});

test("outline and chapters preserve headings, list options, tables, code, user text and duplicate titles", async () => {
  const index = createConversationIndex();
  await index.upsertMessages([message("u", "长问题", "user"), message("a", "前言\n\n## 重复\n\n正文\n\n- **列表标题**：解释\n\n## 重复\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nconst answer = 42;\n``` ")]);
  const outline = index.getOutline();
  assert.equal(outline.items.filter((item) => item.title === "重复").length, 2);
  assert.equal(new Set(outline.items.map((item) => item.key)).size, outline.items.length);
  assert.ok(outline.items.some((item) => item.title === "列表标题"));
  assert.ok(outline.items.some((item) => item.level === 3 && item.title === "A | B"));
  assert.ok(outline.chapters.some((node) => node.contents.some((part) => part.ast?.type === "codeBlock")));
  assert.equal(chapterTreeText(outline.chapters).split("重复").length - 1, 2);
  assert.ok(!index.getOutline({ enabledLevelsByPlatform: { chatgpt: [1] } }).items.some((item) => item.title === "重复"));
});

test("answers belong to their user chapter instead of an untitled Full text wrapper", async () => {
  const index = createConversationIndex();
  await index.upsertMessages([message("lead", "没有问题的前言"), message("u", "问题", "user"), message("a", "前言段落\n\n## 小节\n\n小节正文")]);
  const { chapters } = index.getOutline();
  const byKey = new Map(chapters.map((node) => [node.markerKey, node]));
  assert.equal(byKey.has("index:a"), false, "an answer with a user gets no synthetic root");
  const user = byKey.get("index:u");
  assert.deepEqual(user.contents.map((part) => part.type === "child" ? part.key : part.text), ["问题", "前言段落", "index:a:1:0"]);
  assert.equal(byKey.get("index:a:1:0").parentKey, "index:u");
  assert.equal(byKey.get("index:lead").title, "", "only an answer without a user keeps a Full text root");
  assert.equal(chapters.filter((node) => !node.title).length, 1);
});

test("full-text search normalizes Unicode, returns original highlights and paginates beyond folded rows", async () => {
  const index = createConversationIndex();
  await index.upsertMessages(Array.from({ length: 150 }, (_, i) => message(`m${i}`, "前缀 ＡＢＣ\n中文代码 const x = 1;")));
  const result = await index.search("abc", { offset: 100 });
  assert.equal(result.total, 150); assert.equal(result.items.length, 50);
  assert.equal(result.items[0].parts.find((part) => part.match).text, "ＡＢＣ");
  assert.equal((await index.search("中文代码")).total, 150);
  assert.equal(indexedSnippet("e\u0301 test", "é").find((part) => part.match).text, "e\u0301");
  const controller = new AbortController(); controller.abort();
  await assert.rejects(index.search("abc", { signal: controller.signal }), { name: "AbortError" });
});

test("full conversation fuzzy search matches ordered body characters and highlights original text", async () => {
  const index = createConversationIndex();
  await index.upsertMessages([message("body", "标题\n\nＡlpha beta 中文内容", "user"), message("reverse", "内容中文 beta alpha")]);
  const result = await index.search("a b 中 容");
  assert.equal(result.total, 1);
  assert.equal(result.items[0].markerKey, "index:body");
  assert.equal(result.items[0].count, 1);
  assert.equal(result.items[0].parts.filter((part) => part.match).map((part) => part.text).join(""), "Ａb中容");
  assert.equal((await index.search("不存在" )).total, 0);
});

test("recognition hints appear after body text and disappear when a heading is recognized", async () => {
  const index = createConversationIndex();
  await index.upsertMessages([message('u', '问题', 'user')]);
  assert.deepEqual(index.getOutline().recognitionHintGroups, []);
  await index.upsertMessages([message('a', '纯正文')]);
  assert.deepEqual(index.getOutline().recognitionHintGroups, ['index:u']);
  await index.upsertMessages([message('a', '## 新标题\n\n正文')]);
  assert.deepEqual(index.getOutline().recognitionHintGroups, []);
  assert.deepEqual(index.getOutline({ enabledLevelsByPlatform: { chatgpt: [] } }).recognitionHintGroups, ['index:u']);
});
