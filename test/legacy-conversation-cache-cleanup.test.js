import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { removeLegacyConversationCache } from "../src/legacy-conversation-cache-cleanup.js";
import { normalizeHistoryMode } from "../src/history-mode.js";

test("complete-reading preferences migrate to passive loaded-message retention", () => {
  assert.equal(normalizeHistoryMode("complete"), "loaded");
  assert.equal(normalizeHistoryMode("loaded"), "loaded");
  for (const value of [undefined, null, "default", "unknown", true]) assert.equal(normalizeHistoryMode(value), "default");
});

function createDatabase(factory, name) {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

test("cache removal only deletes the legacy extension database and never opens a database", async () => {
  const factory = new IDBFactory();
  const old = await createDatabase(factory, "polaris-conversation-cache"); old.close();
  const other = await createDatabase(factory, "unrelated-extension-data"); other.close();
  factory.open = () => assert.fail("cleanup must not open or read databases");
  await removeLegacyConversationCache(factory);
  assert.deepEqual((await factory.databases()).map((db) => db.name), ["unrelated-extension-data"]);
  await removeLegacyConversationCache(factory);
  assert.deepEqual((await factory.databases()).map((db) => db.name), ["unrelated-extension-data"]);
});

test("a blocked legacy deletion completes after its old connection closes", async () => {
  const factory = new IDBFactory();
  const old = await createDatabase(factory, "polaris-conversation-cache");
  let settled = false;
  const pending = removeLegacyConversationCache(factory).then(() => { settled = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  old.close(); await pending;
  assert.deepEqual(await factory.databases(), []);
});

test("cache deletion errors are reported without reading the old data", async () => {
  const error = new Error("deletion failed");
  await assert.rejects(removeLegacyConversationCache({ deleteDatabase() {
    const request = { error }; queueMicrotask(() => request.onerror()); return request;
  } }), error);
});
