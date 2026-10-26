import { publicConversationSnapshot } from "./conversation-snapshot.js";

export const CONVERSATION_CACHE_MAX_BYTES = 100 * 1024 * 1024;

const completed = (transaction) => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error("cache-transaction-failed"));
});
const resultOf = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export async function compressConversationSnapshot(snapshot) {
  const body = new Blob([JSON.stringify(snapshot)]);
  if (body.size > CONVERSATION_CACHE_MAX_BYTES) throw new Error("cache-entry-too-large");
  const stream = body.stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

async function decompressSnapshot(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip"));
  // Bound decoded data too: a damaged or externally modified entry must not
  // expand indefinitely before the record validator gets a chance to run.
  const reader = stream.getReader(); const chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > CONVERSATION_CACHE_MAX_BYTES) throw new Error("cache-entry-too-large");
      chunks.push(value);
    }
    return publicConversationSnapshot(JSON.parse(await new Blob(chunks).text()));
  } finally { await reader.cancel().catch(() => {}); }
}

// This database is opened only by the extension background, never by a content
// script (where IndexedDB would belong to the host website).
export function createConversationCache({ indexedDB = globalThis.indexedDB, maxBytes = CONVERSATION_CACHE_MAX_BYTES,
  now = Date.now, compress = compressConversationSnapshot } = {}) {
  let database;
  function open() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open("polaris-conversation-cache", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("entries", { keyPath: "key" });
        request.result.createObjectStore("bodies");
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); database = null; };
        resolve(request.result);
      };
      request.onerror = () => { database = null; reject(request.error); };
    });
    return database;
  }
  const keyFor = (scope, conversationId) => JSON.stringify([scope, conversationId]);
  return {
    async read(scope, conversationId) {
      const db = await open(); const key = keyFor(scope, conversationId);
      const transaction = db.transaction(["entries", "bodies"], "readwrite"); const done = completed(transaction);
      const entries = transaction.objectStore("entries");
      const lease = crypto.randomUUID();
      const request = entries.get(key);
      request.onsuccess = () => entries.put({ ...request.result, key, lease, bytes: request.result?.bytes || 0, lastUsed: now() });
      const body = resultOf(transaction.objectStore("bodies").get(key)).catch(() => null);
      await done;
      let snapshot = null;
      try { const data = await body; if (data) snapshot = await decompressSnapshot(data); } catch { /* A corrupt cache is a miss. */ }
      return { snapshot, lease };
    },
    async write(scope, conversationId, lease, value) {
      const snapshot = publicConversationSnapshot(value);
      if (!snapshot || !lease) return false;
      const data = await compress(snapshot);
      if (data.byteLength > maxBytes) return false;
      const db = await open(); const key = keyFor(scope, conversationId);
      const transaction = db.transaction(["entries", "bodies"], "readwrite"); const done = completed(transaction);
      const entries = transaction.objectStore("entries"); const bodies = transaction.objectStore("bodies");
      const request = entries.getAll(); let written = false;
      request.onsuccess = () => {
        const rows = request.result;
        if (rows.find((row) => row.key === key)?.lease !== lease) return;
        entries.put({ key, lease, bytes: data.byteLength, lastUsed: now() }); bodies.put(data, key); written = true;
        let total = data.byteLength + rows.filter((row) => row.key !== key).reduce((sum, row) => sum + row.bytes, 0);
        for (const row of rows.filter((row) => row.key !== key).sort((a, b) => a.lastUsed - b.lastUsed)) {
          if (total <= maxBytes) break;
          entries.delete(row.key); bodies.delete(row.key); total -= row.bytes;
        }
      };
      await done; return written;
    },
    async clear() {
      const db = await open();
      const transaction = db.transaction(["entries", "bodies"], "readwrite"); const done = completed(transaction);
      transaction.objectStore("entries").clear(); transaction.objectStore("bodies").clear(); await done;
    }
  };
}

export function createConversationCacheClient(runtime) {
  const request = async (operation, detail) => {
    if (!runtime?.sendMessage) return null;
    let timer;
    try {
      return await Promise.race([
        runtime.sendMessage({ type: "POLARIS_CONVERSATION_CACHE", operation, ...detail }),
        new Promise((resolve) => { timer = setTimeout(() => resolve(null), 2000); })
      ]);
    } catch { return null; }
    finally { clearTimeout(timer); }
  };
  return {
    read: (scope, conversationId) => request("read", { scope, conversationId }),
    write: (scope, conversationId, lease, snapshot) => request("write", { scope, conversationId, lease, snapshot })
  };
}

// Bind cache requests to extension content scripts on an actual ChatGPT chat.
// A sidepanel may clear the cache, but cannot claim a page's account scope.
export function createConversationCacheHandler({ runtimeId, extensionOrigin = `chrome-extension://${runtimeId}/`, cache = createConversationCache(), incognito = false } = {}) {
  return async (message, sender) => {
    if (incognito || sender.tab?.incognito || sender.id !== runtimeId) return null;
    if (message.operation === "clear") {
      if (!sender.tab && sender.url?.startsWith(extensionOrigin)) { await cache.clear(); return { ok: true }; }
      return null;
    }
    let url;
    try { url = new URL(sender.tab?.url || sender.url); } catch { return null; }
    if (url.protocol !== "https:" || !/^(chatgpt\.com|chat\.openai\.com)$/.test(url.hostname)
      || url.pathname.match(/\/c\/([a-zA-Z0-9-]+)(?:\/|$)/)?.[1] !== message.conversationId
      || !/^[a-f0-9]{64}$/.test(message.scope || "")) return null;
    if (message.operation === "read") return cache.read(message.scope, message.conversationId);
    if (message.operation === "write") return { ok: await cache.write(message.scope, message.conversationId, message.lease, message.snapshot) };
    return null;
  };
}
