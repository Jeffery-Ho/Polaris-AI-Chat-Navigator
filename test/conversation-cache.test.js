import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { createConversationCache, createConversationCacheHandler, compressConversationSnapshot } from "../src/conversation-cache.js";
import { createConversationIndex } from "../src/conversation-index.js";

async function snapshot(text = "## 标题\n\n原文") {
  const index = createConversationIndex();
  await index.ingest({ title: "测试", messages: [{ id: "one", author: { role: "assistant" }, content: { content_type: "text", parts: [text] } }], page_info: { has_previous_page: false, has_next_page: false } });
  return index.exportSnapshot();
}

test("gzip IndexedDB snapshots survive new cache instances and stay isolated by account, workspace and conversation", async () => {
  const indexedDB = new IDBFactory(); const cache = createConversationCache({ indexedDB }); const value = await snapshot();
  const { lease } = await cache.read("account:workspace", "chat");
  assert.equal(await cache.write("account:workspace", "chat", lease, value), true);
  const reopened = createConversationCache({ indexedDB });
  assert.deepEqual((await reopened.read("account:workspace", "chat")).snapshot, value);
  assert.equal((await reopened.read("other:workspace", "chat")).snapshot, null);
  assert.equal((await reopened.read("account:other", "chat")).snapshot, null);
  assert.equal((await reopened.read("account:workspace", "other")).snapshot, null);
});

test("a newer tab's lease prevents an older tab from overwriting its snapshot", async () => {
  const cache = createConversationCache({ indexedDB: new IDBFactory() });
  const first = await cache.read("scope", "chat"); const second = await cache.read("scope", "chat");
  assert.equal(await cache.write("scope", "chat", second.lease, await snapshot("最新")), true);
  assert.equal(await cache.write("scope", "chat", first.lease, await snapshot("旧数据")), false);
  assert.equal((await cache.read("scope", "chat")).snapshot.records[0].markdown, "最新");
});

test("clear invalidates in-flight compression and cannot be undone by a late writer", async () => {
  let release; const compressed = new Promise((resolve) => { release = resolve; });
  const cache = createConversationCache({ indexedDB: new IDBFactory(), compress: () => compressed });
  const { lease } = await cache.read("scope", "chat"); const value = await snapshot();
  const pending = cache.write("scope", "chat", lease, value);
  await cache.clear(); release(await compressConversationSnapshot(value));
  assert.equal(await pending, false);
  assert.equal((await cache.read("scope", "chat")).snapshot, null);
});

test("LRU eviction enforces the compressed byte budget", async () => {
  const value = await snapshot(); const bytes = (await compressConversationSnapshot(value)).byteLength;
  let time = 0;
  const cache = createConversationCache({ indexedDB: new IDBFactory(), maxBytes: bytes * 2, now: () => ++time });
  for (const id of ["old", "keep"]) {
    const { lease } = await cache.read("scope", id); await cache.write("scope", id, lease, value);
  }
  await cache.read("scope", "keep");
  const { lease } = await cache.read("scope", "new"); await cache.write("scope", "new", lease, value);
  assert.equal((await cache.read("scope", "old")).snapshot, null);
  assert.deepEqual((await cache.read("scope", "keep")).snapshot, value);
});

test("corrupt gzip and incompatible snapshots are cache misses", async () => {
  const cache = createConversationCache({ indexedDB: new IDBFactory(), compress: async () => new Uint8Array([1, 2, 3]).buffer });
  const { lease } = await cache.read("scope", "chat");
  await cache.write("scope", "chat", lease, await snapshot());
  assert.equal((await cache.read("scope", "chat")).snapshot, null);
  assert.equal(await cache.write("scope", "chat", lease, { ...(await snapshot()), version: -1 }), false);
});

test("background cache rejects unknown identities, other pages and private windows", async () => {
  const cache = createConversationCache({ indexedDB: new IDBFactory() });
  const handler = createConversationCacheHandler({ runtimeId: "extension", cache });
  const message = { operation: "read", scope: "a".repeat(64), conversationId: "chat" };
  const sender = { id: "extension", tab: { url: "https://chatgpt.com/c/chat" } };
  assert.ok((await handler(message, sender)).lease);
  assert.equal(await handler({ ...message, scope: "session:default" }, sender), null);
  assert.equal(await handler(message, { ...sender, tab: { url: "https://example.com/c/chat" } }), null);
  assert.equal(await handler({ ...message, operation: "clear" }, sender), null);
  const privateHandler = createConversationCacheHandler({ runtimeId: "extension", cache, incognito: true });
  assert.equal(await privateHandler(message, sender), null);
  assert.deepEqual(await handler({ operation: "clear" }, { id: "extension", url: "chrome-extension://extension/sidepanel.html" }), { ok: true });
});
