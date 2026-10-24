import test from "node:test";
import assert from "node:assert/strict";
import { chatGptConversationId, conversationPage, createConversationIndex, indexedSnippet } from "../src/conversation-index.js";
import { chapterTreeText } from "../src/sidepanel-chapter-state.js";

const message = (id, text, role = "assistant", extra = {}) => ({ id, author: { role }, content: { content_type: "text", parts: [text] }, ...extra });
const page = (messages, previous = false, next = false) => ({ title: "真实会话标题", messages, page_info: { start_cursor: messages[0]?.id, has_previous_page: previous, has_next_page: next } });

test("conversation routes accept normal and project chats but reject other origins and shares", () => {
  assert.equal(chatGptConversationId("https://chatgpt.com/g/g-p-id/project/c/abc-123"), "abc-123");
  assert.equal(chatGptConversationId("https://chatgpt.com/c/abc-123"), "abc-123");
  assert.equal(chatGptConversationId("https://example.com/c/abc"), "");
  assert.equal(chatGptConversationId("https://chatgpt.com/share/abc"), "");
});

test("legacy trees select the current branch and reject missing ancestors and cycles", () => {
  const payload = { current_node: "b", mapping: { root: { parent: null }, a: { parent: "root", message: message("a", "旧回答") }, b: { parent: "root", message: message("b", "当前回答") } } };
  assert.deepEqual(conversationPage(payload).messages.map((item) => item.id), ["b"]);
  payload.mapping.b.parent = "missing";
  assert.throws(() => conversationPage(payload), /incomplete-chain/);
  payload.mapping.b.parent = "b";
  assert.throws(() => conversationPage(payload), /incomplete-chain/);
});

test("older pages merge by identity, retain repeated text and stay partial until completion", async () => {
  const index = createConversationIndex();
  await index.ingest(page([message("c", "相同正文"), message("d", "最后一条")], true), { replace: true });
  await index.ingest(page([message("a", "问题", "user"), message("b", "相同正文"), message("c", "相同正文")]), { older: true });
  assert.equal(index.status().count, 4);
  assert.equal(index.status().total, null);
  assert.deepEqual((await index.search("相同正文")).items.map((item) => item.markerKey), ["index:b", "index:c"]);
  index.fail("network-error"); assert.equal(index.status().phase, "partial");
  assert.equal((await index.search("最后")).total, 1);
  index.finish(); assert.equal(index.status().total, 4);
  index.setTitle("用户重命名"); assert.equal(index.status().title, "用户重命名");
  index.dispose(); assert.equal(index.status().count, 0);
});

test("outline and chapters preserve headings, list options, tables, code, user text and duplicate titles", async () => {
  const index = createConversationIndex();
  await index.ingest(page([message("u", "长问题", "user"), message("a", "前言\n\n## 重复\n\n正文\n\n- **列表标题**：解释\n\n## 重复\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nconst answer = 42;\n``` ") ]));
  const outline = index.getOutline();
  assert.equal(outline.items.filter((item) => item.title === "重复").length, 2);
  assert.equal(new Set(outline.items.map((item) => item.key)).size, outline.items.length);
  assert.ok(outline.items.some((item) => item.title === "列表标题"));
  assert.ok(outline.items.some((item) => item.level === 3 && item.title === "A | B"));
  assert.ok(outline.chapters.some((node) => node.contents.some((part) => part.ast?.type === "codeBlock")));
  assert.equal(chapterTreeText(outline.chapters).split("重复").length - 1, 2);
  assert.ok(!index.getOutline({ enabledLevelsByPlatform: { chatgpt: [1] } }).items.some((item) => item.title === "重复"));
});

test("hidden reasoning, tools and alternate content do not enter public search", async () => {
  const index = createConversationIndex();
  await index.ingest(page([message("public", "公开"), message("hidden", "机密", "assistant", { metadata: { is_visually_hidden_from_conversation: true } }), message("tool", "机密", "tool"), message("analysis", "机密", "assistant", { channel: "analysis" })]));
  assert.equal(index.status().count, 1);
  assert.equal((await index.search("机密")).total, 0);
});


test("full-text search normalizes Unicode, returns original highlights and paginates beyond folded rows", async () => {
  const index = createConversationIndex();
  await index.ingest(page(Array.from({ length: 150 }, (_, i) => message(`m${i}`, "前缀 ＡＢＣ\n中文代码 const x = 1;"))));
  const result = await index.search("abc", { offset: 100 });
  assert.equal(result.total, 150); assert.equal(result.items.length, 50);
  assert.equal(result.items[0].parts.find((part) => part.match).text, "ＡＢＣ");
  assert.equal((await index.search("中文代码")).total, 150);
  assert.equal(indexedSnippet("e\u0301 test", "é").find((part) => part.match).text, "e\u0301");
  const controller = new AbortController(); controller.abort();
  await assert.rejects(index.search("abc", { signal: controller.signal }), { name: "AbortError" });
});
