// Run only in the extension background. Never open/read the old conversation
// database or operate on a supported website's origin/storage.
export function removeLegacyConversationCache(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("polaris-conversation-cache");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    // Do not mark a blocked deletion complete. Other extension contexts must
    // release their connections before IndexedDB can finish the same request.
  });
}
