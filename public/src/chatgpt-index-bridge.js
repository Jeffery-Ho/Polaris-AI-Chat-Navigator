import { createChatGptNativeNavigation } from "./chatgpt-native-navigation.js";

(() => {
  const KEY = "__POLARIS_CONVERSATION_INDEX_BRIDGE__";
  if (window[KEY] || window !== window.top) return;
  window[KEY] = true;
  const COMMAND = "polaris-conversation-index-command";
  const RESULT = "polaris-conversation-index-result";
  const originalFetch = window.fetch;
  let active = null;
  let headers = new Headers();
  let timer = 0;
  let controller = null;
  let serial = 0;
  const readers = new Set();
  const nativeNavigation = createChatGptNativeNavigation({ window });
  let navigationController = null;
  let preparationController = null;

  const currentId = () => location.pathname.match(/\/c\/([a-zA-Z0-9-]+)(?:\/|$)/)?.[1] || "";
  function send(type, detail = {}, context = active) {
    if (!context || context !== active || context.conversationId !== currentId()) return;
    window.postMessage({ type: RESULT, requestId: context.requestId, conversationId: context.conversationId, runId: serial, event: type, ...detail }, location.origin);
  }
  const endpointId = (url) => url.pathname.match(/^\/backend-api\/conversations?\/([a-zA-Z0-9-]+)$/)?.[1] || "";
  function stop() {
    active = null; serial++;
    navigationController?.abort(); navigationController = null;
    preparationController?.abort(); preparationController = null;
    clearTimeout(timer); controller?.abort(); controller = null;
    readers.forEach((reader) => { void reader.cancel().catch(() => {}); }); readers.clear();
    headers = new Headers();
    if (window.fetch === wrappedFetch) window.fetch = originalFetch;
  }
  async function readResponse(response) {
    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      const seconds = Number(retryAfter);
      const until = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(retryAfter);
      const error = new Error(`http-${response.status}`);
      error.retryAt = Number.isFinite(until) ? until : 0;
      throw error;
    }
    return response.json();
  }
  async function load() {
    const context = active;
    if (!context || currentId() !== context.conversationId) return;
    controller?.abort();
    const pending = new AbortController(); controller = pending;
    const run = ++serial;
    const valid = () => active === context && serial === run && !pending.signal.aborted && currentId() === context.conversationId;
    send("loading");
    try {
      // Never move credentials out of the page world or retain them in storage.
      const session = await readResponse(await originalFetch.call(window, "/api/auth/session", { credentials: "include", signal: pending.signal }));
      if (!valid()) return;
      if (session.accessToken) headers.set("Authorization", `Bearer ${session.accessToken}`);
      const scope = `${session.user?.id || "session"}:${headers.get("chatgpt-account-id") || headers.get("openai-account-id") || "default"}`;
      const base = `/backend-api/conversations/${encodeURIComponent(context.conversationId)}`;
      const request = (url) => originalFetch.call(window, url, { credentials: "include", headers, signal: pending.signal });
      let response = await request(`${base}?num_turns=50&include_has_versions=true`);
      if ([404, 405].includes(response.status)) response = await request(`/backend-api/conversation/${encodeURIComponent(context.conversationId)}`);
      let payload = await readResponse(response);
      const seen = new Set();
      let older = false;
      while (valid()) {
        const id = payload.conversation_id || payload.id;
        if (id && id !== context.conversationId) throw new Error("wrong-conversation");
        send("page", { payload, older, replace: !older, scope }, context);
        if (payload.mapping && payload.current_node) break;
        const info = payload.page_info;
        if (!Array.isArray(payload.messages) || typeof info?.has_previous_page !== "boolean"
          || typeof info?.has_next_page !== "boolean") throw new Error("unsupported-format");
        if (!older && info.has_next_page) throw new Error("missing-latest-page");
        if (!info.has_previous_page) break;
        if (!info.start_cursor || seen.has(info.start_cursor)) throw new Error("repeated-cursor");
        seen.add(info.start_cursor);
        older = true;
        payload = await readResponse(await request(`${base}/messages?num_turns=50&include_has_versions=true&before=${encodeURIComponent(info.start_cursor)}`));
      }
      if (valid()) send("complete", {}, context);
    } catch (error) {
      if (valid()) send("error", { reason: /^(http-\d+|unsupported-format|wrong-conversation|repeated-cursor|missing-latest-page)$/.test(error.message) ? error.message : "network-error", retryAt: error.retryAt || 0 }, context);
    }
  }
  function refresh() {
    clearTimeout(timer);
    timer = setTimeout(load, 600);
  }
  function wrappedFetch(input, init) {
    let url; let method;
    try {
      url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, location.href);
      method = String(init?.method || input?.method || "GET").toUpperCase();
      if (active && url.origin === location.origin && (endpointId(url) === active.conversationId || url.pathname === "/backend-api/conversation")) {
        const supplied = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        for (const key of ["authorization", "chatgpt-account-id", "openai-account-id"]) {
          if (supplied.has(key)) headers.set(key, supplied.get(key));
        }
      }
    } catch { /* The original fetch retains its own validation semantics. */ }
    const result = originalFetch.call(this, input, init);
    const context = active;
    if (context && url?.origin === location.origin) {
      void result.then((response) => {
        if (active !== context || !response.ok) return;
        if (endpointId(url) === context.conversationId && method === "GET") {
          // Reuse a complete original response; incomplete responses enter the
          // same cursor walker, without changing what ChatGPT receives.
          void response.clone().json().then((payload) => {
            if (active !== context) return;
            if (payload.mapping && payload.current_node || payload.page_info?.has_previous_page === false && payload.page_info?.has_next_page === false) {
              controller?.abort(); serial++;
              send("page", { payload, replace: true, older: false }, context);
              send("complete", {}, context);
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
    if (["reveal", "prepare"].includes(data.command)) {
      if (!active || data.requestId !== active.requestId || data.conversationId !== currentId() || typeof data.navigationId !== "string") return;
      const context = active;
      const preparing = data.command === "prepare";
      const pending = new AbortController();
      if (preparing) { preparationController?.abort(); preparationController = pending; }
      else { navigationController?.abort(); navigationController = pending; }
      void nativeNavigation.reveal(context.conversationId, { messageId: typeof data.messageId === "string" ? data.messageId : undefined, prepare: preparing, signal: pending.signal }).then((result) => {
        send("native-reveal", { ...result, navigationId: data.navigationId }, context);
      });
      return;
    }
    if (data.command === "stop") { if (!active || data.requestId === active.requestId) stop(); return; }
    if (!["start", "retry"].includes(data.command) || typeof data.requestId !== "string"
      || data.conversationId !== currentId() || !data.conversationId) return;
    stop();
    active = { requestId: data.requestId, conversationId: data.conversationId };
    window.fetch = wrappedFetch;
    void load();
  }
  window.addEventListener("message", onCommand);
  window.addEventListener("polaris-conversation-index-dispose", () => {
    stop(); window.removeEventListener("message", onCommand); delete window[KEY];
  }, { once: true });
})();
