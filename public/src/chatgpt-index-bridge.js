import { createIndexReadCooldown } from "./index-read-cooldown.js";
import { createChatGptNativeNavigation } from "./chatgpt-native-navigation.js";
import { publicImageMessage } from "./chatgpt-image-data.js";
import { readSharedConversationHtml, loadSharedConversation } from "./chatgpt-shared-conversation.js";

(() => {
  const KEY = "__POLARIS_CONVERSATION_INDEX_BRIDGE__";
  if (window[KEY] || window !== window.top) return;
  window[KEY] = true;
  const COMMAND = "polaris-conversation-index-command";
  const RESULT = "polaris-conversation-index-result";
  const originalFetch = window.fetch;
  const cooldown = createIndexReadCooldown();
  const request = async (url, init) => {
    const blocked = cooldown.error(); if (blocked) throw blocked;
    const response = await originalFetch.call(window, url, init);
    cooldown.observe(response);
    return response;
  };
  let active = null;
  let headers = new Headers();
  let headerConversation = "";
  let timer = 0;
  let controller = null;
  let serial = 0;
  const readers = new Set();
  const nativeNavigation = createChatGptNativeNavigation({ window });
  let navigationController = null;
  let navigationId = null;
  let preparationController = null;
  // Armed while complete mode is on, even before a conversation is open: ChatGPT
  // loads a clicked chat before its URL changes, so remember that native response.
  let armed = false;
  const recent = new Map();
  const sharedRecent = new Map();
  let cacheGeneration = 0;
  let cacheTimer = 0;
  const RECENT_TTL = 60000;
  function clearRecent() {
    cacheGeneration++; recent.clear(); sharedRecent.clear(); clearTimeout(cacheTimer);
  }
  function pruneRecent() {
    clearTimeout(cacheTimer);
    let next = Infinity;
    for (const store of [recent, sharedRecent]) for (const [id, entry] of store) {
      if (entry.expiresAt <= Date.now()) store.delete(id);
      else next = Math.min(next, entry.expiresAt);
    }
    if (Number.isFinite(next)) cacheTimer = setTimeout(pruneRecent, Math.max(1, next - Date.now()));
  }
  const currentId = () => location.pathname.match(/^\/share\/([a-zA-Z0-9-]+)\/?$/)?.[1]
    || location.pathname.match(/\/c\/([a-zA-Z0-9-]+)(?:\/|$)/)?.[1] || "";
  const isShared = () => /^\/share\/[a-zA-Z0-9-]+\/?$/.test(location.pathname);
  function send(type, detail = {}, context = active) {
    if (!context || context !== active || context.conversationId !== currentId()) return;
    window.postMessage({ type: RESULT, requestId: context.requestId, conversationId: context.conversationId, runId: serial, event: type, ...detail }, location.origin);
  }
  const endpointId = (url) => url.pathname.match(/^\/backend-api\/conversations?\/([a-zA-Z0-9-]+)$/)?.[1] || "";
  const requestConversationId = (url) => url.pathname.match(/^\/backend-api\/conversations?\/([a-zA-Z0-9-]+)(?:\/messages)?$/)?.[1] || "";
  function stop() {
    active = null; serial++;
    navigationController?.abort(); navigationController = null; navigationId = null;
    preparationController?.abort(); preparationController = null;
    clearTimeout(timer); controller?.abort(); controller = null;
    nativeNavigation.invalidate?.();
    readers.forEach((reader) => { void reader.cancel().catch(() => {}); }); readers.clear();
    if (armed) return;
    headers = new Headers();
    headerConversation = "";
    if (window.fetch === wrappedFetch) window.fetch = originalFetch;
  }
  function disarm() { armed = false; clearRecent(); stop(); }
  function remember(id, payload, store = recent) {
    store.delete(id); store.set(id, { payload, expiresAt: Date.now() + RECENT_TTL, generation: cacheGeneration });
    while (store.size > 3) store.delete(store.keys().next().value);
    pruneRecent();
  }
  function isComplete(payload) {
    if (Array.isArray(payload?.messages) && payload.page_info?.has_previous_page === false && payload.page_info.has_next_page === false) return true;
    if (!payload?.mapping || !payload.current_node) return false;
    const seen = new Set(); let key = payload.current_node;
    while (key) {
      if (seen.has(key) || !payload.mapping[key] || !Object.hasOwn(payload.mapping[key], "parent")) return false;
      seen.add(key); key = payload.mapping[key].parent;
    }
    return true;
  }
  function publicPayload(payload) {
    const message = publicImageMessage;
    const result = { conversation_id: payload.conversation_id || payload.id, title: payload.title, current_node: payload.current_node };
    if (payload.mapping && payload.current_node) {
      result.mapping = {}; let key = payload.current_node;
      // Only the validated active branch crosses into the extension world.
      while (key) { const node = payload.mapping[key]; result.mapping[key] = { parent: node.parent, message: message(node.message) }; key = node.parent; }
    } else { result.messages = payload.messages.map(message).filter(Boolean); result.page_info = payload.page_info; }
    return result;
  }
  function publishSnapshot(payload, scope, context) {
    const snapshot = publicPayload(payload);
    remember(context.conversationId, snapshot, isShared() ? sharedRecent : recent);
    const signature = JSON.stringify(snapshot);
    if (context.snapshotSignature === signature && context.snapshotScope === scope) return false;
    context.snapshotSignature = signature; context.snapshotScope = scope;
    send("page", { payload: snapshot, replace: true, reconcile: true, scope }, context);
    return true;
  }
  async function begin(context) {
    pruneRecent();
    const entry = (isShared() ? sharedRecent : recent).get(context.conversationId);
    const payload = entry ? await entry.payload : null;
    const usable = entry && entry.generation === cacheGeneration && entry.expiresAt > Date.now();
    if (active === context && !controller) void load({ cachedNative: usable && isComplete(payload) ? payload : null });
  }
  async function readResponse(response) {
    if (!response.ok) {
      throw cooldown.error() || new Error(`http-${response.status}`);
    }
    return response.json();
  }
  async function identityScope(context, userId) {
    const account = headers.get("chatgpt-account-id") || headers.get("openai-account-id");
    if (!userId || !account || headerConversation !== context.conversationId || !window.crypto.subtle) return "";
    const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([location.origin, userId, account])));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  async function load({ cachedNative = null } = {}) {
    const context = active;
    if (!context || currentId() !== context.conversationId) return;
    const blocked = cooldown.error();
    if (blocked) { send("error", { reason: blocked.message, retryAt: blocked.retryAt }, context); return; }
    controller?.abort();
    const pending = new AbortController(); controller = pending;
    const run = ++serial;
    const valid = () => active === context && serial === run && !pending.signal.aborted && currentId() === context.conversationId;
    context.observed = null;
    context.snapshotSignature = "";
    context.userId = null; context.scope = "";
    nativeNavigation.invalidate?.();
    const started = performance.now();
    if (isShared()) {
      headers = new Headers(); headerConversation = "";
      send("loading", {}, context); send("native-state", { phase: "preparing" }, context);
      try {
        let payload = cachedNative; let historicalRequests = 0;
        if (!payload) try {
          ({ payload, historicalRequests } = await loadSharedConversation(context.conversationId, {
            request, signal: pending.signal
          }));
        } catch (error) {
          if (error.message !== "unsupported-format" || !["shared-loader", "shared-html"].includes(error.stage)) throw error;
          const stream = [...window.document.querySelectorAll("script:not([src])")]
            .map((script) => script.textContent || "").filter((text) => text.includes(".enqueue(")).join("\n");
          try { payload = readSharedConversationHtml(stream, context.conversationId); historicalRequests = 2; }
          catch { throw error; }
        }
        if (!valid()) return;
        if (!isComplete(payload)) throw new Error("incomplete-chain");
        publishSnapshot(payload, "", context);
        send("native-state", { phase: "ready", nativeMs: performance.now() - started }, context);
        send("complete", { source: "shared", readMs: performance.now() - started, historicalRequests }, context);
      } catch (error) {
        if (valid()) send("error", { kind: "shared-data", reason: /^(http-\d+|unsupported-format|incomplete-chain|wrong-conversation)$/.test(error.message) ? error.message : "network-error",
          stage: error.stage, httpStatus: error.httpStatus, responseFormat: error.responseFormat, retryAt: cooldown.error()?.retryAt || 0 }, context);
      } finally { if (controller === pending) controller = null; }
      return;
    }
    let historicalRequests = 0;
    send("loading", {}, context);
    if (nativeNavigation.prepare) send("native-state", { phase: "preparing" }, context);
    preparationController?.abort();
    const nativePending = new AbortController(); preparationController = nativePending;
    let resolveCancellation;
    const cancelled = new Promise((resolve) => { resolveCancellation = resolve; });
    const cancelNative = () => { nativePending.abort(); resolveCancellation({ ok: false, reason: "source-changed" }); };
    pending.signal.addEventListener("abort", cancelNative, { once: true });
    let nativeTimer;
    const preparation = !cachedNative && nativeNavigation.prepare ? Promise.race([
      Promise.resolve().then(() => nativeNavigation.prepare(context.conversationId, { signal: nativePending.signal })).catch(() => ({ ok: false, reason: "native-load-failed" })),
      new Promise((resolve) => { nativeTimer = setTimeout(() => { nativePending.abort(); resolve({ ok: false, reason: "native-load-timeout" }); }, 30000); }),
      cancelled
    ]) : null;
    const identity = (async () => {
      // A native response without an explicit workspace remains usable, but
      // never authorizes a persistent cache under a guessed "default" account.
      if (cachedNative && !headers.has("chatgpt-account-id") && !headers.has("openai-account-id")) return { scope: "" };
      try {
        const session = await readResponse(await request("/api/auth/session", { credentials: "include", signal: pending.signal }));
        if (!valid()) return { scope: "" };
        if (session.accessToken) headers.set("Authorization", `Bearer ${session.accessToken}`);
        context.userId = session.user?.id;
        return { scope: await identityScope(context, session.user?.id), userId: session.user?.id };
      } catch (error) { return { scope: "", error }; }
    })().then((result) => { if (valid()) { context.scope = result.scope; send("scope", { scope: result.scope }, context); } return result; });
    try {
      const prepared = await preparation;
      clearTimeout(nativeTimer);
      const nativeMs = performance.now() - started;
      const identified = await identity;
      let { scope } = identified;
      const identityError = identified.error;
      if (!valid()) return;
      // The host may capture its workspace headers after /api/auth/session has
      // already completed. Confirm again without another session request.
      const confirmed = await identityScope(context, identified.userId);
      if (!valid()) return;
      if (confirmed !== scope) { scope = confirmed; context.scope = scope; send("scope", { scope }, context); }
      if (cachedNative && !prepared) send("native-state", { phase: "ready", nativeMs }, context);
      if (prepared) send("native-state", { phase: prepared.ok ? "ready" : "error", reason: prepared.reason || "", nativeMs }, context);
      const native = [prepared?.payload, context.observed, cachedNative].find((payload) => isComplete(payload)
        && (!(payload.id || payload.conversation_id) || (payload.id || payload.conversation_id) === context.conversationId));
      if (native) {
        publishSnapshot(native, scope, context);
        send("complete", { source: "native", nativeMs, readMs: performance.now() - started, historicalRequests }, context);
        return;
      }
      if (identityError) throw identityError;
      const base = `/backend-api/conversations/${encodeURIComponent(context.conversationId)}`;
      const read = (url) => request(url, { credentials: "include", headers, signal: pending.signal });
      let response = await read(`${base}?num_turns=50&include_has_versions=true`);
      if ([404, 405].includes(response.status)) response = await read(`/backend-api/conversation/${encodeURIComponent(context.conversationId)}`);
      let payload = await readResponse(response);
      const seen = new Set();
      const pages = [];
      let older = false;
      while (valid()) {
        const id = payload.conversation_id || payload.id;
        if (id && id !== context.conversationId) throw new Error("wrong-conversation");
        if (!payload.mapping && (!Array.isArray(payload.messages) || typeof payload.page_info?.has_previous_page !== "boolean"
          || typeof payload.page_info?.has_next_page !== "boolean")) throw new Error("unsupported-format");
        if (!older && id === context.conversationId && !scope && identified.userId) {
          headerConversation = context.conversationId;
          scope = await identityScope(context, identified.userId);
          if (!valid()) return;
          context.scope = scope; send("scope", { scope }, context);
        }
        if (payload.mapping && !isComplete(payload)) throw new Error("incomplete-chain");
        const projected = publicPayload(payload);
        pages.unshift(projected);
        send("page", { payload: projected, older, replace: !older, scope }, context);
        if (payload.mapping && payload.current_node) break;
        const info = payload.page_info;
        if (!Array.isArray(payload.messages) || typeof info?.has_previous_page !== "boolean"
          || typeof info?.has_next_page !== "boolean") throw new Error("unsupported-format");
        if (!older && info.has_next_page) throw new Error("missing-latest-page");
        if (!info.has_previous_page) break;
        if (!info.start_cursor || seen.has(info.start_cursor)) throw new Error("repeated-cursor");
        seen.add(info.start_cursor);
        older = true;
        historicalRequests++;
        payload = await readResponse(await read(`${base}/messages?num_turns=50&include_has_versions=true&before=${encodeURIComponent(info.start_cursor)}`));
      }
      if (valid()) {
        const snapshot = pages[0]?.mapping ? pages[0] : {
          conversation_id: context.conversationId, title: payload.title,
          messages: pages.flatMap((page) => page.messages),
          page_info: { has_previous_page: false, has_next_page: false }
        };
        remember(context.conversationId, snapshot);
        send("complete", { source: "fallback", nativeMs, readMs: performance.now() - started, historicalRequests }, context);
      }
    } catch (error) {
      if (valid()) send("error", { reason: /^(http-\d+|unsupported-format|incomplete-chain|wrong-conversation|repeated-cursor|missing-latest-page)$/.test(error.message) ? error.message : "network-error", retryAt: error.retryAt || 0 }, context);
    } finally {
      clearTimeout(nativeTimer); pending.signal.removeEventListener("abort", cancelNative);
      if (preparationController === nativePending) preparationController = null;
      if (controller === pending) controller = null;
    }
  }
  function refresh() {
    if (active) recent.delete(active.conversationId);
    clearTimeout(timer);
    timer = setTimeout(load, Math.min(2147483647, Math.max(600, (cooldown.error()?.retryAt || 0) - Date.now())));
  }
  function wrappedFetch(input, init) {
    let url; let method; let workspaceChanged = false;
    try {
      url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, location.href);
      method = String(init?.method || input?.method || "GET").toUpperCase();
      if ((active || armed) && url.origin === location.origin && (requestConversationId(url) || url.pathname === "/backend-api/conversation")) {
        const supplied = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        const accountKey = supplied.has("chatgpt-account-id") ? "chatgpt-account-id" : supplied.has("openai-account-id") ? "openai-account-id" : "";
        workspaceChanged = Boolean(accountKey && headers.get(accountKey) !== supplied.get(accountKey));
        if (workspaceChanged || (supplied.has("authorization") && headers.has("authorization")
          && supplied.get("authorization") !== headers.get("authorization"))) { clearRecent(); }
        for (const key of ["authorization", "chatgpt-account-id", "openai-account-id"]) {
          if (supplied.has(key)) headers.set(key, supplied.get(key));
        }
        if (supplied.has("chatgpt-account-id") || supplied.has("openai-account-id")) {
          headerConversation = requestConversationId(url) || active?.conversationId || "";
          headers.delete(supplied.has("chatgpt-account-id") ? "openai-account-id" : "chatgpt-account-id");
          const context = active; const run = serial;
          if (context?.userId) void identityScope(context, context.userId).then((scope) => {
            if (scope && context === active && serial === run && currentId() === context.conversationId && context.scope !== scope) {
              context.scope = scope; send("scope", { scope }, context);
            }
          }).catch(() => {});
        }
      }
    } catch { /* The original fetch retains its own validation semantics. */ }
    const result = originalFetch.call(this, input, init);
    const nativeId = url?.origin === location.origin && method === "GET" ? endpointId(url) : "";
    if (nativeId && nativeId !== active?.conversationId) {
      const generation = cacheGeneration;
      // Retain only the public active branch, never the raw response or credentials.
      const snapshot = result.then((response) => response.ok ? response.clone().json() : null).then((payload) => {
        if (generation !== cacheGeneration || !isComplete(payload)
          || (payload.id || payload.conversation_id) !== nativeId) return null;
        return publicPayload(payload);
      }).catch(() => null);
      remember(nativeId, snapshot);
    }
    const context = active; const generation = cacheGeneration;
    if (context && url?.origin === location.origin) {
      void result.then((response) => {
        if (active !== context || !response.ok) return;
        if (endpointId(url) === context.conversationId && method === "GET") {
          void response.clone().json().then((payload) => {
            if (active !== context || generation !== cacheGeneration) return;
            // Observe, but never replace, ChatGPT's response. While its loader
            // is running the final merged query snapshot is authoritative.
            if (controller) context.observed = isComplete(payload) ? publicPayload(payload) : null;
            else if (!workspaceChanged && isComplete(payload)
              && (!(payload.id || payload.conversation_id) || (payload.id || payload.conversation_id) === context.conversationId)) {
              // A native refetch is already the complete data. Reconcile it
              // directly instead of restarting the loader and covering the chat.
              if (publishSnapshot(payload, context.scope, context)) send("complete", {}, context);
            } else refresh();
          }).catch(() => {});
        } else if (url.pathname === "/backend-api/conversation" && method === "POST") {
          const reader = response.clone().body?.getReader();
          if (reader) void (async () => {
            readers.add(reader);
            try { while (active === context && !(await reader.read()).done) { /* Discard stream bytes; DOM supplies live text. */ } }
            catch { /* Native stream errors remain owned by ChatGPT. */ }
            finally { readers.delete(reader); void reader.cancel().catch(() => {}); if (active === context) refresh(); }
          })();
        } else if (endpointId(url) === context.conversationId && method === "PATCH") refresh();
      }).catch(() => {});
    }
    return result;
  }
  function onCommand(event) {
    if (event.source !== window || event.origin !== location.origin || event.data?.type !== COMMAND) return;
    const data = event.data;
    if (["reveal", "prepare", "cancel-reveal"].includes(data.command)) {
      if (!active || data.requestId !== active.requestId || data.conversationId !== currentId() || typeof data.navigationId !== "string") return;
      if (data.command === "cancel-reveal") {
        if (data.navigationId === navigationId) navigationController?.abort();
        return;
      }
      const context = active;
      const preparing = data.command === "prepare";
      const pending = new AbortController();
      if (preparing) { preparationController?.abort(); preparationController = pending; }
      else { navigationController?.abort(); navigationController = pending; navigationId = data.navigationId; }
      const task = preparing && nativeNavigation.prepare
        ? nativeNavigation.prepare(context.conversationId, { signal: pending.signal })
        : nativeNavigation.reveal(context.conversationId, { messageId: typeof data.messageId === "string" ? data.messageId : undefined, prepare: preparing, instant: data.instant === true, signal: pending.signal });
      void task.then((result) => {
        if (active !== context || pending.signal.aborted) return;
        if (preparing && result.ok && isComplete(result.payload)) {
          publishSnapshot(result.payload, context.scope, context);
          send("complete", {}, context);
        }
        send("native-reveal", { ok: result.ok, reason: result.reason, navigationId: data.navigationId }, context);
      }).catch(() => send("native-reveal", { ok: false, reason: "native-load-failed", navigationId: data.navigationId }, context));
      return;
    }
    if (data.command === "arm") { armed = true; window.fetch = wrappedFetch; return; }
    if (data.command === "disarm") { disarm(); return; }
    if (data.command === "stop") { if (!active || data.requestId === active.requestId) stop(); return; }
    if (!["start", "retry"].includes(data.command) || typeof data.requestId !== "string"
      || data.conversationId !== currentId() || !data.conversationId) return;
    if (data.command === "retry") { recent.delete(data.conversationId); sharedRecent.delete(data.conversationId); }
    stop();
    active = { requestId: data.requestId, conversationId: data.conversationId };
    window.fetch = wrappedFetch;
    void begin(active);
  }
  window.addEventListener("message", onCommand);
  window.addEventListener("polaris-conversation-index-dispose", () => {
    disarm(); window.removeEventListener("message", onCommand); delete window[KEY];
  }, { once: true });
})();
