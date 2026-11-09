import test from "node:test";
import assert from "node:assert/strict";
import { createConversationIndex } from "../src/conversation-index.js";
import { visitConversationImages } from "../src/conversation-images.js";
import { publicImageMessage, publicFilePart } from "../public/src/chatgpt-image-data.js";
import { chapterTreeText } from "../src/sidepanel-chapter-state.js";
import { imagePart, imageMessage, imagePage } from "./fixtures/chatgpt-images.js";
import { readFileSync } from "node:fs";

test("the content snapshot keeps TOC image descriptors through marker grouping and serialization", async () => {
  const index = createConversationIndex(); await index.ingest(imagePage([imageMessage()]));
  const source = readFileSync(new URL("../src/content.js", import.meta.url), "utf8");
  const declaration = (name, next) => source.slice(source.indexOf(`function ${name}(`), source.indexOf(`function ${next}(`, source.indexOf(`function ${name}(`)));
  const project = new Function("heading", `
    const markerKeyForHeading = (value) => value.markerKey;
    const markerPreviewFor = (value) => value;
    const markerWidthFor = () => 24;
    const markerRenderSignature = JSON.stringify;
    const standaloneWindowImageSource = () => "";
    ${declaration("aiMarkerRenderItem", "foldMarkerRenderItem")}
    ${declaration("serializableWindowMarkerItem", "standaloneWindowImageSource")}
    return serializableWindowMarkerItem(aiMarkerRenderItem(heading));
  `);
  const item = index.getOutline().items.find((item) => item.image);
  assert.ok(item);
  assert.deepEqual(project(item).image, item.image);
});

test("TOC includes every assistant image in order, including pure tool replies and inline Markdown", async () => {
  const index = createConversationIndex({ imagePlaceholder: "[图片]" });
  const user = { id: "u", author: { role: "user" }, content: { content_type: "text", parts: ["问题"] } };
  await index.ingest(imagePage([user, imageMessage("generated", { content: { content_type: "multimodal_text", parts: [imagePart(), imagePart("two", { alt: "第二张" })] } }),
    imageMessage("mixed", { author: { role: "assistant" }, content: { content_type: "text", parts: ["## 说明\n\n文字 ![示意图](sandbox:/mnt/data/image.png) 结尾"] } })]));
  const outline = index.getOutline();
  const images = outline.items.filter((item) => item.image);
  assert.deepEqual(images.map((item) => [item.title, item.image.imageKey]), [["[图片]", "generated:image:0"], ["第二张", "generated:image:1"], ["示意图", "mixed:image:0"]]);
  assert.deepEqual(outline.items.map((item) => item.title), ["问题", "[图片]", "第二张", "说明", "示意图"]);
  assert.ok(images.every((item) => item.groupKey === "index:u"));
  assert.deepEqual(images.map((item) => outline.targets.get(item.markerKey).imageKey), images.map((item) => item.image.imageKey));
});

test("visible tool images join the user chapter in order without hidden copies or tool text", async () => {
  const index = createConversationIndex({ imagePlaceholder: "[图片]" });
  const user = { id: "u", author: { role: "user" }, content: { content_type: "text", parts: ["问题"] } };
  await index.ingest(imagePage([user,
    imageMessage("hidden", { metadata: { is_visually_hidden_from_conversation: true } }),
    imageMessage("picture", { content: { content_type: "multimodal_text", parts: ["private tool caption", imagePart(), imagePart("two", { alt: "第二张" })] } }),
    imageMessage("reasoning", { channel: "analysis" }),
    imageMessage("text-tool", { content: { content_type: "text", parts: ["private tool log"] } })]));
  const { chapters } = index.getOutline();
  assert.equal(index.status().count, 2);
  assert.deepEqual(chapters[0].contents.map((part) => part.text), ["问题", "[图片]", "第二张"]);
  assert.equal(index.image("picture:image:0").src, "sediment://file_one");
  assert.equal(index.image("picture:image:1").alt, "第二张");
  assert.equal(chapterTreeText(chapters), "问题\n\n[图片]\n\n第二张");
  assert.equal((await index.search("private")).total, 0);
  assert.equal((await index.search("file_one")).total, 0);
  assert.equal(index.getOutline().targets.get("index:picture").anchorText, "");
});

test("mixed attachments and Markdown images retain order and invalidate changed image content", async () => {
  const index = createConversationIndex();
  const message = imageMessage("mixed", { author: { role: "assistant" }, content: { content_type: "multimodal_text", parts: ["Before ![网页图](https://example.com/a_(1).png) after", imagePart(), "Tail"] } });
  await index.ingest(imagePage([message]));
  const old = index.exportSnapshot();
  const record = old.records[0];
  assert.deepEqual(record.blocks.map((block) => block.type), ["paragraph", "image", "paragraph"]);
  const images = []; visitConversationImages(record.blocks, (node) => images.push(node));
  assert.deepEqual(images.map((node) => node.src), ["https://example.com/a_(1).png", "sediment://file_one"]);
  assert.equal(record.anchorText, "beforeaftertail");
  assert.equal((await index.search("example.com")).total, 0);
  assert.equal((await index.search("网页图")).total, 1);
  message.content.parts[1] = imagePart("replacement", { height: 1000 });
  await index.reconcile(imagePage([message]));
  assert.notEqual(index.exportSnapshot().records[0].fingerprint, record.fingerprint);
  assert.equal(index.image("mixed:image:1").src, "sediment://file_replacement");
  const restored = createConversationIndex();
  assert.equal(restored.restoreSnapshot(JSON.parse(JSON.stringify(index.exportSnapshot()))), true);
  assert.equal(restored.image("mixed:image:1").height, 1000);
  assert.equal(restored.restoreSnapshot({ ...old, version: 1 }), false);
  await index.reconcile(imagePage([]));
  assert.equal(index.image("mixed:image:1"), null);
});

test("the public image projection retains descriptors without generation metadata or temporary downloads", () => {
  const value = publicImageMessage(imageMessage("visible", { content: { content_type: "multimodal_text", parts: [imagePart("one", { metadata: { prompt: "private" }, download_url: "temporary", authorization: "secret" })] } }));
  assert.doesNotMatch(JSON.stringify(value), /private|temporary|secret/);
  assert.equal(value.author.role, "assistant");
  assert.equal(publicImageMessage(imageMessage("hidden", { metadata: { is_visually_hidden_from_conversation: true } })), null);
  assert.equal(publicImageMessage(imageMessage("analysis", { channel: "analysis" })), null);
});

test("user image and file attachments retain ordered AST labels, names and native source targets", async () => {
  const user = { id: "user-images", author: { role: "user" }, content: { content_type: "multimodal_text", parts: [
    "Before", imagePart("first"), "Middle", imagePart("second", { alt: "Reference photo" }),
    { content_type: "file_asset_pointer", file_name: "document.pdf", asset_pointer: "file-service://document" }, "After"
  ] } };
  const index = createConversationIndex(); await index.ingest(imagePage([user])); index.finish();
  const record = index.exportSnapshot().records[0];
  assert.deepEqual(record.blocks.map((block) => block.type), ["paragraph", "image", "paragraph", "image", "attachment", "paragraph"]);
  assert.equal(record.text, "Before\n\n[Image]\n\nMiddle\n\nReference photo\n\ndocument.pdf\n\nAfter");
  const outline = index.getOutline(); assert.equal(outline.items.length, 1); assert.equal(outline.items[0].type, "user");
  assert.equal(outline.items[0].title, "Before\n\nMiddle\n\nAfter");
  assert.equal(outline.items[0].attachments[0].name, "document.pdf");
  assert.equal(outline.targets.get("index:user-images:attachment:0").attachmentKey, "user-images:attachment:0");
  assert.equal(record.blocks[4].url, undefined);
  assert.equal(outline.chapters[0].contents[1].ast.type, "image");
  assert.equal(outline.targets.get("index:user-images:image:1").role, "user");
  assert.equal(index.image("user-images:image:1").src, "sediment://file_second");
  assert.equal((await index.search("Reference photo")).total, 1);
  assert.equal((await index.search("sediment")).total, 0);
  assert.equal(record.anchorText, "beforemiddledocument.pdfafter");
  const restored = createConversationIndex();
  assert.equal(restored.restoreSnapshot({ ...index.exportSnapshot(), version: 2 }), false, "old user Attachment-only caches need authoritative rereading");
  assert.equal(restored.restoreSnapshot(JSON.parse(JSON.stringify(index.exportSnapshot()))), true);
  assert.equal(restored.getOutline().chapters[0].contents[3].ast.imageKey, "user-images:image:1");
  user.content.parts[1] = imagePart("replacement"); await restored.reconcile(imagePage([user]));
  assert.equal(restored.image("user-images:image:0").src, "sediment://file_replacement");
});

test("public file projection retains only known filenames, MIME types and safe HTTPS resource URLs", () => {
  const file = { content_type: "file_asset_pointer", file_name: "report.pdf", mime_type: "application/pdf",
    asset_pointer: "file-service://private-pointer", url: "https://files.example.com/report.pdf", authorization: "secret", metadata: { token: "private" } };
  assert.deepEqual(publicFilePart(file), { content_type: "file_asset_pointer", file_name: "report.pdf", mime_type: "application/pdf", url: "https://files.example.com/report.pdf" });
  assert.doesNotMatch(JSON.stringify(publicImageMessage({ id: "files", author: { role: "user" }, content: { content_type: "multimodal_text", parts: [file] } })), /secret|private|authorization|metadata|asset_pointer":"file-service/);
  assert.equal(publicFilePart({ ...file, url: "javascript:alert(1)" }).url, undefined);
  assert.equal(publicFilePart({ ...file, url: "https://user:secret@files.example.com/report.pdf" }).url, undefined);
  assert.equal(publicFilePart({ ...file, url: undefined }).url, undefined);
  assert.equal(publicFilePart({ ...file, file_name: "" }), null);
});

test("file-only prompts and visible generated files share attachment AST while unknown parts keep a fallback", async () => {
  const file = { content_type: "file_asset_pointer", file_name: "input.pdf", mime_type: "application/pdf" };
  const index = createConversationIndex();
  await index.ingest(imagePage([
    { id: "u", author: { role: "user" }, content: { content_type: "multimodal_text", parts: [file] } },
    imageMessage("a", { content: { content_type: "multimodal_text", parts: ["private tool text", { ...file, file_name: "output.pdf" }] } }),
    { id: "unknown", author: { role: "user" }, content: { content_type: "multimodal_text", parts: [{ content_type: "unknown" }] } }
  ])); index.finish();
  const tree = index.getOutline();
  assert.equal(tree.items[0].title, "input.pdf");
  assert.equal(tree.items[0].attachments[0].mimeType, "application/pdf");
  const output = tree.items.find((item) => item.attachment);
  assert.equal(output.title, "output.pdf");
  assert.equal(tree.targets.get(output.markerKey).blockType, "attachment");
  assert.equal(index.exportConversation().messages[0].blocks[0].type, "attachment");
  assert.equal(tree.items.at(-1).title, "[Attachment]");
  assert.equal((await index.search("private tool text")).total, 0);
});

test("image-only user prompts and inline Markdown images get image source targets without AI rows", async () => {
  const index = createConversationIndex({ imagePlaceholder: "[图片]" });
  await index.ingest(imagePage([
    { id: "pictures", author: { role: "user" }, content: { content_type: "multimodal_text", parts: [imagePart(), imagePart("two")] } },
    { id: "markdown", author: { role: "user" }, content: { content_type: "text", parts: ["文字 ![示意图](https://images.example.com/picture.png) 结尾"] } }
  ]));
  const outline = index.getOutline();
  assert.equal(outline.items[0].title, "[图片]");
  assert.equal(outline.items[1].title, "文字 结尾");
  assert.ok(outline.items.every((item) => item.type === "user"));
  assert.deepEqual(outline.chapters[0].contents.map((part) => part.ast.type), ["image", "image"]);
  assert.equal(outline.chapters[1].contents[0].ast.children[1].type, "image");
  assert.equal(outline.targets.get("index:markdown:image:0").messageId, "markdown");
  assert.equal(chapterTreeText(outline.chapters), "[图片]\n\n[图片]\n\n文字 示意图 结尾");
});
