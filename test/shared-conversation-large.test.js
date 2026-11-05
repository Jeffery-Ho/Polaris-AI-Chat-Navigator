import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { loadSharedConversation } from "../public/src/chatgpt-shared-conversation.js";
import { createConversationIndex } from "../src/conversation-index.js";
import { createSidepanelChapterReader } from "../src/sidepanel-chapter-reader.js";
import { createSidepanelConversationExport } from "../src/sidepanel-conversation-export.js";
import { chapterTreeText } from "../src/sidepanel-chapter-state.js";
import { imagePart, sharedReloadData } from "./fixtures/chatgpt-images.js";

test("10,000 shared messages keep all mixed images, bounded mounts, scroll, reopen, search, copy and source semantics", async () => {
  const mapping = { root: { children: ["m-0"] } };
  for (let i = 0; i < 10000; i++) mapping[`m-${i}`] = {
    parent: i ? `m-${i - 1}` : "root", children: [i < 9999 ? `m-${i + 1}` : "hidden"],
    message: { id: `m-${i}`, author: { role: i % 2 ? "assistant" : "user" }, content: { content_type: "multimodal_text",
      parts: i % 2 === 0 ? [`Question-${i}`] : i % 4 === 1 ? [imagePart(i)]
        : [`Before-${i} ![Diagram-${i}](https://images.example.com/${i}.png) middle`, imagePart(i), imagePart(`${i}-b`), `Tail-${i}`] } }
  };
  mapping.hidden = { parent: "m-9999", children: [], message: { id: "hidden", author: { role: "assistant" },
    metadata: { is_visually_hidden_from_conversation: true }, content: { content_type: "multimodal_text", parts: [imagePart("hidden")] } } };
  const snapshot = await loadSharedConversation("share-large", { request: async (url) => {
    if (url.includes(".data?")) return new Response(sharedReloadData, { status: 202 });
    if (url === "/api/auth/session") return Response.json({ accessToken: "test-only" });
    assert.equal(url, "/backend-api/share/share-large");
    return Response.json({ conversation_id: "share-large", current_node: "hidden", mapping });
  } });
  const index = createConversationIndex(); await index.ingest(snapshot.payload); index.finish();
  assert.equal(index.status().count, 10000);
  const { chapters, items, targets } = index.getOutline();
  assert.equal(items.filter((item) => item.image).length, 10000);
  assert.deepEqual(items.filter((item) => item.image).slice(-3).map((item) => item.image.imageKey),
    ["m-9999:image:0", "m-9999:image:1", "m-9999:image:2"]);
  assert.equal((await index.search("Tail-9999")).items[0].markerKey, "index:m-9999");
  assert.equal((await index.search("images.example")).total, 0);
  const restored = createConversationIndex(); assert.ok(restored.restoreSnapshot(JSON.parse(JSON.stringify(index.exportSnapshot()))));
  assert.equal(restored.getOutline().items.filter((item) => item.image).length, 10000);

  const dom = new JSDOM("<body></body>", { pretendToBeVisual: true }); const win = dom.window; const doc = win.document;
  let y = 0; let requests = 0;
  Object.defineProperty(win, "scrollY", { get: () => y });
  win.scrollTo = (options, nextY) => { y = typeof options === "object" ? options.top : nextY; };
  Object.defineProperty(win.HTMLImageElement.prototype, "src", { set() { requests++; throw new Error("Image resource requested"); } });
  win.fetch = () => { requests++; throw new Error("Unexpected fetch"); };
  const loaded = []; const copied = []; const located = []; const byKey = new Map(chapters.map((node) => [node.markerKey, node]));
  const reader = createSidepanelChapterReader({ document: doc, locale: "en", onQueryChange() {}, onLoadChapter: async (key, format) => {
    loaded.push(key); return format === "text" ? { text: chapterTreeText(chapters, key) } : { contents: byKey.get(key).contents };
  }, onCopy: async (text) => copied.push(text), onLocate: async (key) => located.push(key) });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 35));
  try {
    const metadata = chapters.map((node) => ({ ...node, contents: [{ type: "block", lazy: true }] }));
    doc.body.append(reader.update({ conversationKey: "ten-thousand", nodes: metadata, query: "", ready: true, virtualized: true, contentRevision: 1 }));
    reader.element.querySelector(".chapter-tree-list").getBoundingClientRect = () => ({ top: -y, width: 400, height: 0 });
    await settle(); assert.equal(reader.element.querySelectorAll(".chapter-image-label").length, 1);
    const title = () => reader.element.querySelector('.chapter-node-title[data-key="index:m-0"]');
    title().click(); await settle(); assert.equal(reader.element.querySelector(".chapter-image-label"), null);
    title().click(); await settle(); assert.equal(reader.element.querySelectorAll(".chapter-image-label").length, 1);
    assert.equal(y, 0); assert.equal(loaded.filter((key) => key === "index:m-0").length, 1);
    reader.element.querySelector(".chapter-image-label").click(); await settle();
    assert.equal(located[0], "index:m-1:image:0"); assert.ok(targets.has(located[0]));
    reader.element.querySelector(".chapter-node-dot").click();
    assert.equal([...doc.querySelectorAll('[role="menuitem"]')].some(button => button.textContent === "Copy full text"), false);
    win.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    win.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
    Object.defineProperty(win.navigator, 'clipboard', { value: { writeText: async text => copied.push(text) } });
    const exporter = createSidepanelConversationExport({ document: doc, locale: 'en', onRead: async () => index.exportConversation() });
    doc.body.prepend(exporter.element); exporter.update({ key: 'large', enabled: true, complete: true });
    exporter.element.querySelector('button').click(); await settle();
    assert.ok(doc.querySelector('.conversation-export-dialog[open]'));
    doc.querySelector('.conversation-export-close').click();
    assert.ok(copied[0].includes("Question-0") && copied[0].includes("Tail-9999"));
    for (const position of [0, 48000, 120000, 239000, 0]) {
      y = position; win.dispatchEvent(new win.Event("scroll")); await settle();
      const count = reader.element.querySelectorAll("[data-virtual-key]").length; assert.ok(count > 0 && count < 100);
      assert.equal(y, position);
    }
    assert.equal(doc.querySelector("img"), null); assert.equal(requests, 0);
  } finally { reader.suspend(); dom.window.close(); }
});
