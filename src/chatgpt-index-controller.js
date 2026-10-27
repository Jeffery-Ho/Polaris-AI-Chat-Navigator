import { chatGptConversationId, createConversationIndex, normalizeIndexedText, normalizeAnchorText } from "./conversation-index.js";
import { HASHED_MARKDOWN_ROOT_SELECTOR, HASHED_HEADING_SELECTOR } from "./hashed-markdown.js";

const CHATGPT_HOST = /^(chatgpt\.com|chat\.openai\.com)$/;
const NATIVE_LOAD_TIMEOUT_MS = 20000;
const ANCHOR_WAIT_MS = 1200;

export function createChatGptIndexController({ window: win, bridgeUrl, onChange, cache = null, onDiagnostics = () => {} }) {
  const doc = win.document;
  let index = null;
  let session = "";
  let route = "";
  let scope = "";
  let cached = null;
  let cacheKey = "";
  let retryAt = 0;
  let script = null;
  let searchController = null;
  let observedTitle = "";
  let invalidRun = false;
  let runId = -1;
  let disposed = false;
  let wanted = false;
  let armed = false;
  let processing = Promise.resolve();
  let ingestion = new AbortController();
  let locationRun = null;
  let preparationRun = null;
  let nativeState = { phase: "loading", error: "" };
  let lease = "";
  let restoredScope = "";
  let persistTimer = 0;
  let reportedRevision = -1;
  let savedRevision = -1;
  let authoritativeData = false;
  let started = 0;
  let timings = {};
  const currentRoute = () => `${win.location.origin}${win.location.pathname}`;
  const post = (command, detail = {}) => win.postMessage({ type: "polaris-conversation-index-command", command, ...detail,
    requestId: session, conversationId: chatGptConversationId(win.location.href) }, win.location.origin);
  function clear() {
    locationRun?.cancel();
    preparationRun?.cancel();
    if (session) post("stop"); searchController?.abort(); index?.dispose(); index = null;
    ingestion.abort(); ingestion = new AbortController();
    processing = Promise.resolve(); win.clearTimeout(persistTimer);
    lease = ""; restoredScope = ""; reportedRevision = -1; savedRevision = -1; authoritativeData = false; timings = {};
    session = ""; scope = ""; cached = null; cacheKey = ""; retryAt = 0; observedTitle = "";
    runId = -1; invalidRun = false;
    nativeState = { phase: "loading", error: "" };
  }
  function start() {
    clear(); route = currentRoute();
    index = createConversationIndex();
    index.subscribe(() => { cached = null; onChange(); });
    session = win.crypto.randomUUID();
    started = performance.now();
    timings = { cacheHit: false, cacheMs: 0, indexMs: 0, nativeMs: 0, historicalRequests: 0 };
    observedTitle = titleFromPage();
    if (script?.dataset.ready === "true") post("start");
    else loadBridge();
    onChange();
  }
  async function restoreCache(nextScope, current, generation, signal) {
    if (scope !== nextScope) {
      if (scope) { searchController?.abort(); current.reset(); }
      scope = nextScope; lease = ""; restoredScope = ""; savedRevision = -1; authoritativeData = false; timings.cacheHit = false;
    }
    if (!cache || !scope || restoredScope === scope) return;
    restoredScope = scope;
    const began = performance.now();
    let stored;
    try { stored = await cache.read(scope, chatGptConversationId(win.location.href)); } catch { return; }
    if (current !== index || generation !== session || signal.aborted || nextScope !== scope) return;
    timings.cacheMs += performance.now() - began;
    lease = stored?.lease || "";
    if (stored?.snapshot && !authoritativeData) timings.cacheHit = current.restoreSnapshot(stored.snapshot);
    saveWhenReady();
  }
  function saveWhenReady() {
    if (!index || index.status().phase !== "complete" || nativeState.phase !== "ready" || invalidRun) return;
    win.clearTimeout(persistTimer);
    const current = index; const generation = session; const owner = scope; const writeLease = lease;
    persistTimer = win.setTimeout(() => {
      if (current !== index || generation !== session || owner !== scope || current.status().phase !== "complete"
        || nativeState.phase !== "ready" || invalidRun) return;
      const revision = current.status().revision;
      if (reportedRevision !== revision) {
        reportedRevision = revision; timings.totalMs = performance.now() - started; onDiagnostics({ ...timings });
      }
      if (!cache || !owner || !writeLease || savedRevision === revision) return;
      const snapshot = current.exportSnapshot();
      if (snapshot) { savedRevision = revision; void Promise.resolve(cache.write(owner, chatGptConversationId(win.location.href), writeLease, snapshot)).catch(() => {}); }
    }, 0);
  }
  // Loaded and armed before any chat is open, so a clicked chat starts at once.
  function loadBridge() {
    if (script?.dataset.ready === "true") { if (wanted && !armed) { armed = true; post("arm"); } return; }
    if (!script) {
      const bridge = doc.createElement("script"); bridge.src = bridgeUrl; bridge.type = "module";
      script = bridge;
      bridge.dataset.polarisConversationBridge = "true";
      bridge.addEventListener("load", () => {
        if (disposed || script !== bridge) return;
        bridge.dataset.ready = "true";
        if (wanted) { armed = true; post("arm"); }
        if (index) post("start");
      });
      bridge.addEventListener("error", () => {
        if (disposed || script !== bridge) return;
        index?.fail("bridge-unavailable"); bridge.remove(); script = null;
      });
      (doc.head || doc.documentElement).appendChild(bridge);
    }
  }
  function onMessage(event) {
    const data = event.data;
    if (event.source !== win || event.origin !== win.location.origin || data?.type !== "polaris-conversation-index-result"
      || !index || data.requestId !== session || data.conversationId !== chatGptConversationId(win.location.href) || route !== currentRoute()) return;
    if (Number(data.runId) < runId) return;
    if (data.event === "native-reveal") {
      if (data.navigationId === locationRun?.id) locationRun.reply(data);
      else if (data.navigationId === preparationRun?.id) preparationRun.reply(data);
      return;
    }
    if (Number(data.runId) > runId) {
      runId = Number(data.runId); invalidRun = false; ingestion.abort(); ingestion = new AbortController(); processing = Promise.resolve();
      preparationRun?.cancel();
      if (!lease) restoredScope = "";
      win.clearTimeout(persistTimer);
    }
    const current = index; const generation = session; const signal = ingestion.signal;
    processing = processing.then(async () => {
      if (current !== index || generation !== session || Number(data.runId) < runId || signal.aborted) return;
      try {
        if (data.event === "scope") {
          void restoreCache(typeof data.scope === "string" ? data.scope : "", current, generation, signal).catch(() => {});
        } else if (data.event === "native-state") {
          nativeState = { phase: ["preparing", "ready", "error"].includes(data.phase) ? data.phase : "loading", error: data.reason || "" };
          if (Number.isFinite(data.nativeMs)) timings.nativeMs = data.nativeMs;
          onChange(); saveWhenReady();
        } else if (data.event === "page") {
          const changedScope = Boolean(scope && data.scope && scope !== data.scope);
          if (typeof data.scope === "string") void restoreCache(data.scope, current, generation, signal).catch(() => {});
          if (signal.aborted || generation !== session) return;
          authoritativeData = true;
          const began = performance.now();
          if (data.reconcile) await current.reconcile(data.payload, { signal, complete: current.status().phase === "complete" });
          else await current.ingest(data.payload, { older: Boolean(data.older) && !changedScope, replace: Boolean(data.replace) || changedScope, signal });
          timings.indexMs += performance.now() - began;
          if (signal.aborted || generation !== session) return;
          syncMounted();
        } else if (data.event === "complete" && !invalidRun) {
          if (["native", "fallback"].includes(data.source)) timings.source = data.source;
          if (Number.isFinite(data.readMs)) timings.readMs = data.readMs;
          if (Number.isFinite(data.historicalRequests)) timings.historicalRequests = data.historicalRequests;
          if (index.status().phase !== "complete") index.finish();
          prepareNativeList(); saveWhenReady();
        }
        else if (data.event === "loading") { invalidRun = false; index.begin(); }
        else if (data.event === "error") { retryAt = Number(data.retryAt) || 0; index.fail(String(data.reason || "network-error")); }
      } catch (error) {
        if (signal.aborted || generation !== session) return;
        invalidRun = true; index.fail(error.message === "incomplete-chain" ? "incomplete-chain" : "unsupported-format");
      }
    });
  }
  win.addEventListener("message", onMessage);
  const titleObserver = new win.MutationObserver(() => { if (index) syncMounted(); });
  if (doc.head) titleObserver.observe(doc.head, { childList: true, subtree: true, characterData: true });

  function outline(config) {
    const key = JSON.stringify([index?.status().revision, config]);
    if (key !== cacheKey || !cached) { cacheKey = key; cached = index?.getOutline(config) || { items: [], chapters: [], targets: new Map() }; }
    return cached;
  }
  function titleFromPage() {
    const path = win.location.pathname;
    const selected = [...doc.querySelectorAll('nav a[href], aside a[href]')].find((anchor) => {
      try { return new URL(anchor.href, win.location.href).pathname === path; } catch { return false; }
    });
    const explicit = doc.querySelector('[data-testid="conversation-title"]');
    const value = (explicit?.textContent || selected?.textContent || doc.title.replace(/\s*[-–—|]\s*ChatGPT\s*$/i, "")).trim();
    return value === "ChatGPT" ? "" : value;
  }
  function syncMounted() {
    if (!index) return;
    const title = titleFromPage();
    // Do not let an unchanged, stale document.title overwrite API metadata.
    if (title && title !== observedTitle) { observedTitle = title; index.setTitle(title); }
    if (!doc.querySelector('[data-testid="stop-button"], button[aria-label="Stop streaming"], button[aria-label="停止生成"]')) return;
    for (const node of [...doc.querySelectorAll('main [data-message-id][data-message-author-role="assistant"]')].slice(-1)) {
      const body = node.querySelector('.markdown, .prose, [class~="group/user-message"]') || node;
      index.updateMessage(node.getAttribute("data-message-id"), body.innerText || body.textContent || "");
    }
  }
  const markdownSelector = `.markdown, .prose, ${HASHED_MARKDOWN_ROOT_SELECTOR}`;
  function visibleText(node) {
    const walker = doc.createTreeWalker(node, win.NodeFilter.SHOW_TEXT);
    let text = "";
    for (let child = walker.nextNode(); child; child = walker.nextNode()) {
      if (!child.parentElement?.closest('button,[role="button"],[hidden],[aria-hidden="true"],script,style,.sr-only,.visually-hidden,.srOnly')) text += child.nodeValue || "";
    }
    return text;
  }
  function messageAnchor(node) {
    const body = node.matches(markdownSelector) ? node : node.querySelector(markdownSelector) || node;
    return normalizeAnchorText(visibleText(body));
  }
  function resolveLocation(key, config) {
    const unavailable = (reason) => ({ element: null, reason });
    const target = outline(config).targets.get(key);
    if (!target) return unavailable("target-missing");
    const candidates = [...doc.querySelectorAll('main [data-message-id], main [data-chatgpt-search-message-ids]')]
      .filter((node) => node.getAttribute("data-message-id") === target.messageId
        || (node.getAttribute("data-chatgpt-search-message-ids") || "").split(/\s+/).includes(target.messageId));
    const outerCandidates = candidates.filter((node) => !candidates.some((other) => other !== node && other.contains(node)));
    if (outerCandidates.length > 1) return unavailable("ambiguous-message");
    let message = outerCandidates[0];
    if (!message) {
      // Cached records from older builds may still contain unrendered tokens.
      const anchorText = normalizeAnchorText(target.anchorText || "");
      const ids = new Set([...outline(config).targets.values()].filter((entry) => entry.role === target.role && normalizeAnchorText(entry.anchorText || "") === anchorText).map((entry) => entry.messageId));
      if (ids.size > 1) return unavailable("ambiguous-message");
      const selector = target.role === "user"
        ? 'main [data-message-author-role="user"], main [data-message-role="user"], main [data-conversation-role="user"], main [class~="group/user-message"]'
        : `main [data-message-author-role="assistant"], main [data-message-role="assistant"], main [data-conversation-role="assistant"], main .markdown, main .prose, ${HASHED_MARKDOWN_ROOT_SELECTOR.split(", ").map((selector) => `main ${selector}`).join(", ")}`;
      const unique = [...doc.querySelectorAll(selector)].filter((node) => anchorText && messageAnchor(node) === anchorText);
      const outer = unique.filter((node) => !unique.some((other) => other !== node && other.contains(node)));
      // Without an exposed message id, only an unambiguous content match is safe.
      if (outer.length !== 1) return unavailable(outer.length ? "ambiguous-message" : "not-mounted");
      message = outer[0];
    }
    if (!message.isConnected) return unavailable("not-mounted");
    if (key === `index:${target.messageId}`) return { element: message, reason: "" };
    if (target.blockType === "table") {
      const tables = [...message.querySelectorAll("table")].filter((table) => {
        const row = table.tHead?.rows[0] || table.rows[0];
        const cells = row ? [...row.cells].map((cell) => normalizeAnchorText(visibleText(cell))) : [];
        return cells.length === target.tableCells.length && cells.every((cell, i) => cell === normalizeAnchorText(target.tableCells[i]));
      });
      return tables.length === 1 ? { element: tables[0], reason: "" } : unavailable(tables.length ? "ambiguous-anchor" : "anchor-not-found");
    }
    const matched = [...message.querySelectorAll(`h1,h2,h3,h4,h5,h6,strong,li,${HASHED_HEADING_SELECTOR}`)].filter((node) => {
      const text = visibleText(node);
      return normalizeIndexedText(text) === normalizeIndexedText(target.title)
        || target.blockType === "list" && node.tagName === "LI" && normalizeIndexedText(text.split(/[:：]/)[0]) === normalizeIndexedText(target.title);
    });
    const matches = matched.filter((node) => !matched.some((other) => other !== node && other.contains(node)));
    return matches.length === 1 ? { element: matches[0], reason: "" } : unavailable(matches.length ? "ambiguous-anchor" : "anchor-not-found");
  }
  function resolveTarget(key, config) {
    return resolveLocation(key, config).element;
  }
  function prepareNativeList() {
    if (!index || preparationRun || nativeState.phase === "ready") return;
    nativeState = { phase: "preparing", error: "" };
    const began = performance.now();
    const run = { id: win.crypto.randomUUID(), cancel: () => finish(),
      reply(data) { finish(data); } };
    const timer = win.setTimeout(() => finish({ ok: false, reason: "native-load-timeout" }), 30000);
    function finish(result) {
      if (preparationRun !== run) return;
      preparationRun = null; win.clearTimeout(timer);
      if (!result) return;
      timings.nativeMs += performance.now() - began;
      nativeState = { phase: result.ok ? "ready" : "error", error: result.reason || "" }; onChange(); saveWhenReady();
    }
    preparationRun = run; onChange(); post("prepare", { navigationId: run.id });
  }
  function ensureLocation(key, config, { instant = false } = {}) {
    locationRun?.cancel();
    const found = resolveLocation(key, config);
    if (found.element || !["not-mounted", "ambiguous-message"].includes(found.reason)) return Promise.resolve(found);
    const generation = session;
    return new Promise((resolve) => {
      let ready = false;
      let timer = 0;
      const observer = new win.MutationObserver(check);
      const run = { id: win.crypto.randomUUID(),
        cancel() {
          post("cancel-reveal", { navigationId: run.id });
          finish({ element: null, reason: "source-changed" });
        },
        reply(data) {
          if (!data.ok) { finish({ element: null, reason: data.reason || "native-list-unavailable" }); return; }
          ready = true;
          // The message is revealed; a heading that never matches must not hang
          // the jump, so fall back to the whole message shortly after.
          win.clearTimeout(timer);
          timer = win.setTimeout(() => {
            const message = resolveLocation(`index:${outline(config).targets.get(key)?.messageId}`, config).element;
            finish(message ? { element: message, reason: "", fallback: true } : { element: null, reason: "anchor-timeout" });
          }, ANCHOR_WAIT_MS);
          check();
        }
      };
      function finish(result) {
        if (locationRun !== run) return;
        locationRun = null; win.clearTimeout(timer); observer.disconnect(); resolve(result);
      }
      function check() {
        if (!ready) return;
        if (session !== generation || route !== currentRoute()) { run.cancel(); return; }
        const result = resolveLocation(key, config);
        if (result.element || result.reason === "target-missing") finish(result);
      }
      locationRun = run;
      observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true });
      timer = win.setTimeout(() => finish({ element: null, reason: "native-load-timeout" }), NATIVE_LOAD_TIMEOUT_MS);
      post("reveal", { navigationId: run.id, messageId: outline(config).targets.get(key)?.messageId, instant });
    });
  }
  return {
    configure(enabled) {
      if (disposed) return;
      wanted = enabled;
      if (enabled && CHATGPT_HOST.test(win.location.hostname)) loadBridge();
      else if (armed) { armed = false; post("disarm"); }
      if (!enabled || !chatGptConversationId(win.location.href)) { if (index) { clear(); onChange(); } return; }
      if (!index || route !== currentRoute()) start();
    },
    enabled: () => Boolean(index),
    // Complete mode is on, but the ChatGPT page has no conversation to read yet.
    awaitingConversation: () => wanted && !index && CHATGPT_HOST.test(win.location.hostname),
    title: titleFromPage,
    snapshot: () => index ? { ...index.status(), generation: session, retryAt, native: nativeState, timings: { ...timings } } : null,
    outline, syncMounted, resolveTarget, resolveLocation, ensureLocation,
    async search(query, options = {}) {
      searchController?.abort(); searchController = new AbortController();
      const current = index; const generation = session;
      const result = await current?.search(query, { ...options, signal: searchController.signal });
      if (!result || index !== current || generation !== session) return null;
      return { ...result, generation };
    },
    retry() { if (index && Date.now() >= retryAt) {
      preparationRun?.cancel(); nativeState = { phase: "loading", error: "" };
      if (!script) start(); else { index.begin(); post("retry"); }
    } },
    dispose() {
      disposed = true; titleObserver.disconnect();
      clear(); win.removeEventListener("message", onMessage);
      win.dispatchEvent(new win.Event("polaris-conversation-index-dispose")); script?.remove(); script = null;
    }
  };
}
