import { createConversationIndex, normalizeAnchorText } from "./conversation-index.js";
import { domMessageBlocks } from "./dom-message-blocks.js";
import { visitConversationImages } from "./conversation-images.js";

const NATIVE_READ_TIMEOUT_MS = 20000;
const SETTLE_MS = 150;
const EXCLUDED = 'button, [role="button"], [hidden], [aria-hidden="true"], script, style, .sr-only, .visually-hidden, [contenteditable="true"]';
const FILE_CARD_SELECTOR = '.attachment, .file-card, .file-card-info, [data-testid="attachment"], [data-testid="file-attachment"], [data-testid="file-card"]';
const FILE_NODE_SELECTOR = `${FILE_CARD_SELECTOR}, [data-file-name], [data-filename], .file-name, .filename, [data-testid="file-name"], a[download]`;

// Platform readers own message identity and history evidence. This controller
// retains the messages they have actually read, independently of mounted rows.
export function createDOMIndexController({ window: win, platform, readMessages, onChange = () => {}, imagePlaceholder }) {
  let index = null;
  let route = "";
  let generation = "";
  let wanted = false;
  let readFull = false;
  let disposed = false;
  let source = { messages: [] };
  let signature = "";
  let queue = Promise.resolve();
  let ingestion = new AbortController();
  let searchController = null;
  let operation = null;
  let historyAttempted = false;
  let historyError = "";
  let historyProgress = null;
  let cachedOutline = null;
  let cachedOutlineKey = "";
  const seen = new Set();
  const mounts = new Map();
  const document = win.document;
  const now = () => win.performance.now();
  const pageRoute = () => `${win.location.origin}${win.location.pathname}${win.location.search}`;
  const routeFor = (value) => value.routeKey || pageRoute();
  const read = () => {
    const value = readMessages() || {};
    return { ...value, messages: Array.isArray(value.messages) ? value.messages : [] };
  };
  const title = () => source.title || document.title.replace(/\s*[-–—|]\s*[^-–—|]+$/, "").trim();
  const notify = () => { if (!disposed) onChange(); };

  function clear(reason = "source-changed") {
    operation?.cancel(reason);
    operation = null;
    searchController?.abort();
    ingestion.abort(); ingestion = new AbortController();
    index?.dispose(); index = null;
    queue = Promise.resolve(); signature = ""; route = ""; generation = "";
    source = { messages: [] }; seen.clear(); mounts.clear();
    cachedOutline = null; cachedOutlineKey = "";
    historyAttempted = false; historyError = ""; historyProgress = null;
  }

  function mounted(value) {
    source = value; mounts.clear();
    for (const message of value.messages) {
      if (!message.id || !message.element?.isConnected) continue;
      const matches = mounts.get(message.id) || [];
      if (!matches.some((entry) => entry.element === message.element)) matches.push(message);
      mounts.set(message.id, matches);
    }
  }

  function isConversation(value) {
    if (value.isConversation === false) return false;
    if (value.isConversation || value.messages.length) return true;
    const path = win.location.pathname.replace(/\/+$/, "") || "/";
    return !["/", "/app", "/chat", "/new", "/ai_chat"].includes(path)
      && !/^\/(?:settings|plugins|tasks|mykimi|inspiration|slides|make3d|chat\/history)(?:\/|$)/.test(path);
  }

  function start(value) {
    clear();
    route = routeFor(value); generation = win.crypto.randomUUID();
    source = value;
    index = createConversationIndex({ platform, imagePlaceholder });
    index.subscribe(notify);
  }

  function capture(value, { older = false } = {}) {
    if (disposed || !wanted) return Promise.resolve();
    if (!index || route !== routeFor(value)) {
      if (!isConversation(value)) { if (index) { clear(); notify(); } return Promise.resolve(); }
      start(value);
    }
    mounted(value);
    const messages = value.messages.map(({ id, role, blocks, markdown, replyTo }) => ({ id, role, blocks,
      ...(typeof markdown === "string" ? { markdown } : {}),
      ...(replyTo !== undefined ? { replyTo } : {}) }));
    const authoritative = value.coverage === "complete";
    const incoming = new Set([...(authoritative ? [] : seen), ...messages.map((message) => message.id)]);
    const coverage = authoritative
      || value.hasEarlier === false && Number.isSafeInteger(value.total) && value.total > 0 && incoming.size === value.total
      || index.status().coverage === "complete" && value.hasEarlier !== true && messages.every((message) => seen.has(message.id))
      ? "complete" : "loaded";
    const nextSignature = JSON.stringify([messages, coverage, authoritative, value.title || ""]);
    if (signature === nextSignature) return queue;
    signature = nextSignature;
    const current = index; const session = generation; const signal = ingestion.signal;
    queue = queue.catch(() => {}).then(async () => {
      if (signal.aborted || current !== index || session !== generation) return;
      await current.upsertMessages(messages, { older, coverage, replace: authoritative, signal });
      if (signal.aborted || current !== index || session !== generation) return;
      if (authoritative) seen.clear();
      for (const message of messages) seen.add(message.id);
      const nextTitle = title(); if (nextTitle) current.setTitle(nextTitle);
    }).catch((error) => {
      if (signal.aborted || current !== index || session !== generation) return;
      historyError = error?.message || "unsupported-format";
      current.fail(historyError);
    });
    return queue;
  }

  function syncMounted() {
    if (disposed || !wanted) return Promise.resolve();
    let value;
    try { value = read(); }
    catch { historyError = "source-unavailable"; notify(); return Promise.resolve(); }
    const pending = capture(value, { older: operation?.direction === "older" });
    if (readFull && !historyAttempted && value.messages.length) {
      historyAttempted = true;
      const session = generation;
      void pending.then(() => { if (wanted && readFull && index && generation === session && !operation) void scan(); });
    }
    return pending;
  }

  function outline(config = {}) {
    if (!index) return { items: [], chapters: [], targets: new Map(), recognitionHintGroups: [] };
    const key = `${index.status().revision}:${JSON.stringify(config)}`;
    if (key !== cachedOutlineKey) { cachedOutline = index.getOutline(config); cachedOutlineKey = key; }
    return cachedOutline;
  }

  function visibleText(element) {
    const walker = document.createTreeWalker(element, win.NodeFilter.SHOW_TEXT);
    let value = "";
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.parentElement?.closest(EXCLUDED)) value += node.nodeValue || "";
    }
    return normalizeAnchorText(value);
  }

  function pick(candidates, target) {
    const nodes = [...new Set(candidates)].filter((node) => node?.isConnected && !node.closest(EXCLUDED));
    if (nodes.length === 1) return { element: nodes[0], reason: "" };
    if (Number.isInteger(target.ordinal) && nodes[target.ordinal]) return { element: nodes[target.ordinal], reason: "" };
    return { element: null, reason: nodes.length ? "ambiguous-anchor" : "anchor-not-found" };
  }

  function parsedMedia(element, type) {
    const blocks = domMessageBlocks(element, { baseUrl: win.location.href });
    const values = [];
    if (type === "image") visitConversationImages(blocks, (image) => values.push(image));
    else {
      const visit = (nodes) => {
        for (const node of nodes || []) {
          if (node.type === "attachment") values.push(node);
          visit(node.blocks);
          for (const item of node.items || []) visit(item.children);
        }
      };
      visit(blocks);
    }
    return values;
  }

  function nativeMedia(message, type) {
    const element = message.element;
    if (type === "attachment" && !message.attachmentElements) {
      const entries = [];
      domMessageBlocks(element, { baseUrl: win.location.href, role: message.role,
        onAttachment: (value, owner) => entries.push({ element: owner, value }) });
      return entries;
    }
    const explicit = type === "image" ? message.imageElements : message.attachmentElements;
    const selector = type === "image" ? "img" : FILE_NODE_SELECTOR;
    const candidates = explicit || [...(element.matches(selector) ? [element] : []), ...element.querySelectorAll(selector)];
    const same = (a, b) => type === "image" ? a.src === b.src : normalizeAnchorText(a.name) === normalizeAnchorText(b.name);
    let entries = candidates.filter((node) => node?.isConnected && element.contains(node)).map((node) => ({ element: node, values: parsedMedia(node, type) }))
      .filter((entry) => entry.values.length);
    if (!explicit && type === "attachment") entries = entries.filter((entry) => !entries.some((other) => other !== entry && entry.element.contains(other.element)));
    return entries.flatMap((entry) => entry.values.filter((value) => {
      // Reuse the reader's filtering for avatars, reasoning, hidden nodes,
      // file icons and media swallowed by ordinary file/control wrappers.
      const owners = [entry.element.closest('button, [role="button"]'), entry.element.closest(FILE_CARD_SELECTOR)];
      return owners.every((owner) => !owner || !element.contains(owner) || owner === entry.element
        || parsedMedia(owner, type).some((candidate) => same(candidate, value)));
    }).map((value) => ({ element: entry.element, value })));
  }

  function mediaLocation(candidates, ordinal, matches) {
    const exact = candidates[ordinal];
    if (exact && matches(exact.value)) return { element: exact.element, reason: "" };
    const matching = candidates.filter((candidate) => matches(candidate.value));
    return matching.length === 1 ? { element: matching[0].element, reason: "" }
      : { element: null, reason: matching.length ? "ambiguous-anchor" : "anchor-not-found" };
  }

  function resolveLocation(key, config = {}) {
    if (!index) return { element: null, reason: "target-missing" };
    let value;
    try { value = read(); } catch { return { element: null, reason: "source-unavailable" }; }
    if (routeFor(value) !== route) return { element: null, reason: "source-changed" };
    mounted(value);
    const target = outline(config).targets.get(key);
    if (!target) return { element: null, reason: "target-missing" };
    const messages = mounts.get(target.messageId) || [];
    if (messages.length !== 1) return { element: null, reason: messages.length ? "ambiguous-message" : "not-mounted" };
    const message = messages[0]; const element = message.element;
    const within = (selector) => [...(element.matches(selector) ? [element] : []), ...element.querySelectorAll(selector)];
    const exact = message.targets instanceof Map ? message.targets.get(key) : message.targets?.[key];
    if (exact?.isConnected && element.contains(exact)) return { element: exact, reason: "" };
    if (key === `index:${target.messageId}`) return { element, reason: "" };
    if (target.blockType === "image") {
      const image = index.image(target.imageKey);
      return mediaLocation(nativeMedia(message, "image"), target.imageOrdinal, (candidate) => candidate.src === image?.src);
    }
    if (target.blockType === "attachment") {
      return mediaLocation(nativeMedia(message, "attachment"), target.attachmentOrdinal,
        (candidate) => normalizeAnchorText(candidate.name) === normalizeAnchorText(target.title));
    }
    if (target.blockType === "table") {
      return pick(within("table").filter((table) => {
        const row = table.tHead?.rows[0] || table.rows[0];
        const cells = row ? [...row.cells].map(visibleText) : [];
        return cells.length === target.tableCells?.length && cells.every((cell, i) => cell === normalizeAnchorText(target.tableCells[i]));
      }), target);
    }
    const selector = target.blockType === "heading" ? 'h1,h2,h3,h4,h5,h6,[role="heading"],[class^="Heading-"],[class*=" Heading-"]'
      : target.blockType === "list" ? "li" : "strong,b";
    return pick(within(selector).filter((node) => {
      const text = visibleText(node); const titleText = normalizeAnchorText(target.title);
      return text === titleText || target.blockType === "list" && normalizeAnchorText(text.split(/[:：]/)[0]) === titleText;
    }), target);
  }

  const resolveTarget = (key, config) => resolveLocation(key, config).element;

  function scan({ key, config = {}, resume = false } = {}) {
    operation?.cancel(key ? "navigation-replaced" : "read-replaced");
    const current = index; const session = generation; const initialRoute = route;
    if (!current) return Promise.resolve({ element: null, reason: "not-mounted" });
    const first = read(); const scroller = first.scroller;
    if (!scroller && !first.loadEarlier) return Promise.resolve({ element: null, reason: "native-list-unavailable" });
    const style = scroller && win.getComputedStyle(scroller);
    const reverseFlow = style?.display === "flex" && style.flexDirection === "column-reverse";
    const scrollBounds = () => {
      const extent = Math.max(0, (scroller?.scrollHeight || 0) - (scroller?.clientHeight || 0));
      return { oldest: reverseFlow ? -extent : 0, newest: reverseFlow ? 0 : extent };
    };
    const checkpoint = !key && resume && current.status().coverage !== "complete"
      && historyProgress?.generation === session && historyProgress.route === initialRoute
      && historyProgress.scroller === scroller && historyProgress.reverseFlow === reverseFlow
      ? historyProgress : null;
    if (!key && !checkpoint) historyProgress = null;
    const initialTop = scroller?.scrollTop || 0; const initialHeight = scroller?.scrollHeight || 0;
    const initialMessage = first.messages.find((message) => message.element?.isConnected)?.element;
    const initialOffset = initialMessage?.getBoundingClientRect().top;
    let timer = 0; let wake = null;
    let cancelReason = ""; let direction = checkpoint?.direction || "older"; let historySteps = 0;
    const started = now();
    let finish;
    const done = new Promise((resolve) => { finish = resolve; });
    const run = { direction, cancel(reason) { cancelReason = reason; wake?.(); } };
    const cancelled = () => {
      if (cancelReason || disposed || index !== current || session !== generation || !wanted) return true;
      try { return routeFor(read()) !== initialRoute; }
      catch { cancelReason = "source-unavailable"; return true; }
    };
    const userCancel = () => run.cancel("user-cancelled");
    for (const name of ["wheel", "pointerdown", "touchstart", "keydown"]) win.addEventListener(name, userCancel, { capture: true, passive: true });
    const pause = () => new Promise((resolve) => {
      const settle = () => {
        win.clearTimeout(timer); wake = null; resolve();
      };
      wake = settle;
      // A bounded settle also samples sites whose history updates don't emit
      // useful mutations. A quiet page is never evidence of complete history.
      timer = win.setTimeout(settle, SETTLE_MS);
    });
    const scroll = (top) => {
      if (!scroller?.isConnected) return;
      const bounds = scrollBounds(); top = Math.max(bounds.oldest, Math.min(bounds.newest, top));
      if (typeof scroller.scrollTo === "function") scroller.scrollTo({ top, behavior: "instant" });
      else scroller.scrollTop = top;
    };
    const restore = () => {
      if (!scroller?.isConnected || cancelled()) return;
      if (initialMessage?.isConnected && Number.isFinite(initialOffset)) scroll(scroller.scrollTop + initialMessage.getBoundingClientRect().top - initialOffset);
      else scroll(initialTop + (reverseFlow ? 0 : Math.max(0, scroller.scrollHeight - initialHeight)));
    };
    operation = run; historyError = ""; notify();
    void (async () => {
      let result = { element: null, reason: "not-mounted" };
      let idle = 0; let lastState = ""; let readError = checkpoint?.readError || "";
      try {
        if (checkpoint) {
          const bounds = scrollBounds();
          const shift = reverseFlow ? 0 : scroller.scrollHeight - checkpoint.height;
          const boundary = Math.max(bounds.oldest, Math.min(bounds.newest, checkpoint.top + shift));
          const atEnd = direction === "older" ? boundary <= bounds.oldest + 1 : boundary >= bounds.newest - 1;
          const overlap = atEnd ? 0 : Math.max(1, (scroller.clientHeight || 500) * 0.2);
          // Revisit a small overlap at the saved boundary. Keep this cursor in
          // memory only; a time budget says nothing about history completeness.
          scroll(boundary + (direction === "older" ? overlap : -overlap));
          await pause();
        }
        while (!cancelled() && now() - started < NATIVE_READ_TIMEOUT_MS && historySteps++ < 160) {
          const value = read();
          await capture(value, { older: direction === "older" });
          if (cancelled()) break;
          if (key) {
            result = resolveLocation(key, config);
            if (result.element || !["not-mounted", "anchor-not-found"].includes(result.reason)) break;
            if (result.reason === "anchor-not-found") {
              const message = resolveLocation(`index:${outline(config).targets.get(key)?.messageId}`, config).element;
              if (message) { result = { element: message, reason: "", fallback: true }; break; }
            }
          } else if (current.status().coverage === "complete") { result = { element: null, reason: "" }; break; }
          const state = JSON.stringify([value.messages.map((message) => message.id), scroller?.scrollTop || 0, scroller?.scrollHeight || 0, Boolean(value.historyLoading)]);
          idle = state === lastState ? idle + 1 : 0; lastState = state;
          if (value.historyLoading) { await pause(); continue; }
          const top = scroller?.scrollTop || 0;
          const bounds = scrollBounds();
          const step = Math.max(100, (scroller?.clientHeight || 500) * 0.8);
          if (direction === "older") {
            if (idle >= 3 && top > bounds.oldest + 1) { result = { element: null, reason: "native-list-unavailable" }; break; }
            if (top > bounds.oldest + 1) scroll(Math.max(bounds.oldest, top - step));
            else if (value.loadEarlier?.isConnected && !value.loadEarlier.disabled && idle < 3) value.loadEarlier.click();
            else if (idle < 2) { await pause(); continue; }
            else if (scroller) {
              // A chat may open in the middle of its native virtual list. Read
              // both directions before restoring the original viewport.
              if (value.hasEarlier) readError = "history-unavailable";
              direction = "newer"; run.direction = direction; idle = 0; lastState = "";
            }
            else { result = { element: null, reason: value.hasEarlier ? "history-unavailable" : "" }; break; }
          } else {
            if (top >= bounds.newest - 1) {
              if (idle < 2) { await pause(); continue; }
              result = { element: null, reason: key ? "not-mounted" : readError }; break;
            }
            if (idle >= 3) { result = { element: null, reason: "native-list-unavailable" }; break; }
            scroll(Math.min(bounds.newest, top + step));
          }
          await pause();
        }
        if (cancelled()) result = { element: null, reason: cancelReason || "source-changed" };
        else if (now() - started >= NATIVE_READ_TIMEOUT_MS || historySteps >= 160) result = { element: null, reason: "native-load-timeout" };
        if (!key && operation === run) {
          if (result.reason === "native-load-timeout" && scroller?.isConnected) historyProgress = {
            generation: session, route: initialRoute, scroller, reverseFlow, direction, readError,
            top: scroller.scrollTop, height: scroller.scrollHeight
          };
          else if (!result.reason) historyProgress = null;
        }
      } catch { result = { element: null, reason: "native-list-unavailable" }; }
      finally {
        win.clearTimeout(timer); wake = null;
        for (const name of ["wheel", "pointerdown", "touchstart", "keydown"]) win.removeEventListener(name, userCancel, true);
        if (!key || !result.element) restore();
        if (operation === run) { operation = null; historyError = result.reason; notify(); }
        finish(result);
      }
    })();
    return done;
  }

  function ensureLocation(key, config, options) {
    operation?.cancel("navigation-replaced");
    const found = resolveLocation(key, config);
    if (found.element || !["not-mounted", "anchor-not-found"].includes(found.reason)) return Promise.resolve(found);
    return scan({ key, config, ...options });
  }

  return {
    configure(enabled, { readFull: full = false } = {}) {
      if (disposed) return;
      wanted = Boolean(enabled);
      if (!wanted) { if (index) { clear(); notify(); } return; }
      if (readFull && !full) { operation?.cancel("read-disabled"); historyProgress = null; }
      if (!readFull && full) historyAttempted = false;
      readFull = Boolean(full);
      void syncMounted();
    },
    enabled: () => Boolean(index),
    awaitingConversation: () => wanted && !index,
    title,
    snapshot: () => index ? { ...index.status(), generation, retryAt: 0,
      native: { phase: index.status().count ? "ready" : "loading", error: "" },
      refreshing: Boolean(operation), historyError, source: "dom" } : null,
    outline, syncMounted, resolveTarget, resolveLocation, ensureLocation,
    exportConversation: () => index?.exportConversation() || null,
    async search(query, options = {}) {
      searchController?.abort(); searchController = new AbortController();
      const current = index; const session = generation;
      const result = await current?.search(query, { ...options, signal: searchController.signal });
      return result && current === index && session === generation ? { ...result, generation: session } : null;
    },
    retry() {
      if (!index) return Promise.resolve();
      const session = generation;
      signature = ""; historyAttempted = true;
      return syncMounted().then(() => session === generation && readFull ? scan({ resume: true }) : undefined);
    },
    dispose() { disposed = true; wanted = false; clear("disposed"); }
  };
}
