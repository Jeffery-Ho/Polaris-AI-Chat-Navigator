import { createConversationIndex, normalizeAnchorText } from "./conversation-index.js";
import { domMessageBlocks } from "./dom-message-blocks.js";
import { visitConversationImages } from "./conversation-images.js";
import { createBackfillMask } from "./backfill-mask.js";

// Budgets count only time while the page is visible to the user.
const BACKFILL_TIMEOUT_MS = 90000;
const BACKFILL_MAX_STEPS = 600;
const SETTLE_MS = 150;
// Longest wait for a virtualized list to render rows already in view.
const MOUNT_WAIT_MS = 2000;
// Quiet samples at the top before treating the site's history as exhausted for
// this run. A quiet page is never evidence of complete history.
const TOP_QUIET_STEPS = 8;
const CANCEL_EVENTS = ["wheel", "pointerdown", "touchstart", "keydown"];
const DEFAULT_BACKFILL_LABELS = {
  running: (count) => `Polaris is loading earlier messages… ${count} read`,
  stop: "Stop"
};
const EXCLUDED = 'button, [role="button"], [hidden], [aria-hidden="true"], script, style, .sr-only, .visually-hidden, [contenteditable="true"]';
const FILE_CARD_SELECTOR = '.attachment, .file-card, .file-card-info, [data-testid="attachment"], [data-testid="file-attachment"], [data-testid="file-card"]';
const FILE_NODE_SELECTOR = `${FILE_CARD_SELECTOR}, [data-file-name], [data-filename], .file-name, .filename, [data-testid="file-name"], a[download]`;

// Platform readers own message identity and history evidence. This controller
// retains the messages they have actually read, independently of mounted rows.
export function createDOMIndexController({ window: win, platform, readMessages, onChange = () => {}, imagePlaceholder,
  backfillLabels = DEFAULT_BACKFILL_LABELS, createMask = createBackfillMask, canBackfill = () => true }) {
  let index = null;
  let backfillWanted = false;
  let backfillAttempted = false;
  let backfillState = null;
  let backfillCheckpoint = null;
  let rebuilding = false;
  let operation = null;
  let route = "";
  let generation = "";
  let wanted = false;
  let retainLoaded = false;
  let disposed = false;
  let source = { messages: [] };
  let signature = "";
  let queue = Promise.resolve();
  let ingestion = new AbortController();
  let searchController = null;
  let cachedOutline = null;
  let cachedOutlineKey = "";
  let readingProgress = null;
  let mutationTimer = 0;
  let pendingMutations = [];
  const versions = new Map();
  const seen = new Set();
  const mounts = new Map();
  const document = win.document;
  const pageRoute = () => `${win.location.origin}${win.location.pathname}${win.location.search}`;
  const routeFor = (value) => value.routeKey || pageRoute();
  const read = (options) => {
    const value = readMessages(options) || {};
    return { ...value, messages: Array.isArray(value.messages) ? value.messages : [] };
  };
  const title = () => source.title || document.title.replace(/\s*[-–—|]\s*[^-–—|]+$/, "").trim();
  const notify = () => { if (!disposed) onChange(); };

  function clear() {
    operation?.cancel("source-changed"); operation = null;
    backfillAttempted = false; backfillState = null; backfillCheckpoint = null;
    win.clearTimeout(mutationTimer); mutationTimer = 0; pendingMutations = []; versions.clear();
    searchController?.abort();
    ingestion.abort(); ingestion = new AbortController();
    index?.dispose(); index = null;
    queue = Promise.resolve(); signature = ""; route = ""; generation = "";
    source = { messages: [] }; seen.clear(); mounts.clear();
    cachedOutline = null; cachedOutlineKey = "";
    readingProgress = null;
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

  // Management and utility pages never host a conversation and must not prompt
  // the user to pick a chat, even while no index has started yet.
  function isManagementRoute() {
    const path = win.location.pathname.replace(/\/+$/, "") || "/";
    return /^\/(?:settings|plugins|tasks|mykimi|inspiration|slides|make3d|chat\/history)(?:\/|$)/.test(path);
  }
  function isConversation(value) {
    if (value.isConversation === false) return false;
    if (value.isConversation || value.messages.length) return true;
    const path = win.location.pathname.replace(/\/+$/, "") || "/";
    return !isManagementRoute() && !["/", "/app", "/chat", "/new", "/ai_chat"].includes(path);
  }

  function start(value) {
    clear();
    // A confirmed rebuild indexes only what the page currently holds.
    if (rebuilding) { backfillAttempted = true; rebuilding = false; }
    route = routeFor(value); generation = win.crypto.randomUUID();
    source = value;
    index = createConversationIndex({ platform, imagePlaceholder });
    index.subscribe(notify);
  }

  function capture(value) {
    if (disposed || !wanted) return Promise.resolve();
    if (!index || route !== routeFor(value)) {
      if (!isConversation(value)) { if (index) { clear(); notify(); } return Promise.resolve(); }
      start(value);
    }
    mounted(value);
    const messages = value.messages.map(({ id, role, blocks, markdown, replyTo, version }) => ({ id, role, blocks,
      ...(Number.isInteger(version) ? { version } : {}),
      ...(typeof markdown === "string" ? { markdown } : {}),
      ...(replyTo !== undefined ? { replyTo } : {}) }));
    const authoritative = value.coverage === "complete";
    const replace = !retainLoaded || authoritative;
    const incoming = new Set([...(replace ? [] : seen), ...messages.map((message) => message.id)]);
    const coverage = authoritative
      || value.hasEarlier === false && Number.isSafeInteger(value.total) && value.total > 0 && incoming.size === value.total
      || retainLoaded && index.status().coverage === "complete" && value.hasEarlier !== true && messages.every((message) => seen.has(message.id))
      ? "complete" : "loaded";
    const nextSignature = JSON.stringify([messages.map(({ blocks, ...message }) =>
      Number.isInteger(message.version) ? message : { ...message, blocks }), coverage, replace, value.title || ""]);
    if (signature === nextSignature) return queue;
    signature = nextSignature;
    const current = index; const session = generation; const signal = ingestion.signal;
    queue = queue.catch(() => {}).then(async () => {
      if (signal.aborted || current !== index || session !== generation) return;
      // A refreshed page may index an empty shell before its messages mount.
      // Only a non-empty batch consumes the initial reading progress.
      const initialRead = !current.status().count && messages.length > 0;
      const unchangedIds = new Set(messages.filter(message => Number.isInteger(message.version)
        && versions.get(message.id) === message.version).map(message => message.id));
      await current.upsertMessages(messages, { coverage, replace, signal, unchangedIds, progressive: initialRead && retainLoaded,
        onProgress: initialRead ? (progress) => {
          if (signal.aborted || current !== index || session !== generation) return;
          readingProgress = progress; notify();
        } : undefined });
      if (signal.aborted || current !== index || session !== generation) return;
      if (readingProgress) { readingProgress = null; notify(); }
      if (replace) seen.clear();
      if (replace) versions.clear();
      for (const message of messages) { seen.add(message.id); versions.set(message.id, message.version); }
      const nextTitle = title(); if (nextTitle) current.setTitle(nextTitle);
      // Long conversation mode backfills older messages once per index, after
      // the first readable batch has been published.
      if (messages.length) scheduleBackfill();
    }).catch((error) => {
      if (signal.aborted || current !== index || session !== generation) return;
      readingProgress = null;
      current.fail(error?.message || "unsupported-format");
    });
    return queue;
  }

  function scheduleBackfill() {
    if (!backfillWanted || backfillAttempted || operation || !index?.status().count || !canBackfill()) return;
    backfillAttempted = true;
    const current = index; const session = generation;
    win.setTimeout(() => { if (current === index && session === generation) void backfill(); }, 0);
  }

  function syncMounted(options) {
    if (disposed || !wanted) return Promise.resolve();
    let value;
    try { value = read(options); }
    catch { index?.fail("source-unavailable"); return Promise.resolve(); }
    return capture(value);
  }

  function scheduleSync(mutations) {
    if (disposed || !wanted) return;
    pendingMutations.push(...mutations);
    if (mutationTimer) return;
    mutationTimer = win.setTimeout(() => {
      mutationTimer = 0;
      const batch = pendingMutations; pendingMutations = [];
      void syncMounted({ mutations: batch });
    }, 40);
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

  function frame() {
    return new Promise((resolve) => {
      const timer = win.setTimeout(resolve, 50);
      win.requestAnimationFrame?.(() => { win.clearTimeout(timer); resolve(); });
    });
  }

  // Render the conversation's unmounted messages with the website's own list
  // mechanics (scrolling its message container, or its explicit "load earlier"
  // control) while the list is hidden beneath a still mask: older first, then
  // newer, then back to the reader's position. Guardrails: it runs only while
  // the page is visible, once per index, at the pace the page renders; it never
  // calls a website API, and indexed content stays in this page's memory.
  function backfill({ resume = false } = {}) {
    if (disposed || !wanted || !backfillWanted || !index || !canBackfill()) return Promise.resolve(backfillState);
    operation?.cancel("backfill-replaced");
    const current = index; const session = generation; const initialRoute = route;
    let first;
    try { first = read(); } catch { first = { messages: [] }; }
    const scroller = first.scroller?.isConnected ? first.scroller : null;
    if (!scroller && !first.loadEarlier) {
      backfillState = { phase: "unavailable", steps: 0 }; notify();
      return Promise.resolve(backfillState);
    }
    const style = scroller && win.getComputedStyle(scroller);
    const reverseFlow = style?.display === "flex" && style.flexDirection === "column-reverse";
    const scrollBounds = () => {
      const extent = Math.max(0, (scroller?.scrollHeight || 0) - (scroller?.clientHeight || 0));
      return { oldest: reverseFlow ? -extent : 0, newest: reverseFlow ? 0 : extent };
    };
    const checkpoint = resume && backfillCheckpoint?.generation === session && backfillCheckpoint.scroller === scroller
      ? backfillCheckpoint : null;
    backfillCheckpoint = null;
    const initialTop = scroller?.scrollTop || 0; const initialHeight = scroller?.scrollHeight || 0;
    const initial = first.messages.find((message) => message.element?.isConnected);
    const initialMessage = initial?.element; const initialId = initial?.id;
    const initialOffset = initialMessage?.getBoundingClientRect().top;
    let timer = 0; let wake = null; let cancelReason = ""; let steps = 0;
    const run = { cancel(reason) { cancelReason ||= reason; wake?.(); } };
    const sameSource = () => !disposed && index === current && session === generation;
    const cancelled = () => {
      if (cancelReason || !sameSource() || !wanted || !backfillWanted) return true;
      try { return routeFor(read()) !== initialRoute; }
      catch { cancelReason = "source-unavailable"; return true; }
    };
    const userCancel = () => run.cancel("user-cancelled");
    const pause = () => new Promise((resolve) => {
      const settle = () => { win.clearTimeout(timer); wake = null; resolve(); };
      wake = settle;
      timer = win.setTimeout(settle, SETTLE_MS);
    });
    const scroll = (top) => {
      if (!scroller?.isConnected) return;
      const bounds = scrollBounds(); top = Math.max(bounds.oldest, Math.min(bounds.newest, top));
      if (typeof scroller.scrollTo === "function") scroller.scrollTo({ top, behavior: "instant" });
      else scroller.scrollTop = top;
    };
    const visible = () => new Promise((resolve) => {
      const settle = () => { document.removeEventListener("visibilitychange", check); wake = null; resolve(); };
      const check = () => { if (!document.hidden) settle(); };
      wake = settle;
      document.addEventListener("visibilitychange", check);
    });
    const restore = () => {
      if (!scroller?.isConnected || !sameSource()) return;
      if (initialMessage?.isConnected && Number.isFinite(initialOffset)) {
        scroll(scroller.scrollTop + initialMessage.getBoundingClientRect().top - initialOffset);
        return;
      }
      scroll(initialTop + (reverseFlow ? 0 : Math.max(0, scroller.scrollHeight - initialHeight)));
      // A virtualized list may have remounted the reader's message as a new node.
      let remounted = null;
      try { remounted = read().messages.find((message) => message.id === initialId && message.element?.isConnected)?.element; } catch {}
      if (remounted && Number.isFinite(initialOffset)) scroll(scroller.scrollTop + remounted.getBoundingClientRect().top - initialOffset);
    };
    const label = () => backfillLabels.running(current.status().count || 0);
    let mask = null;
    try {
      mask = scroller ? createMask({ window: win, scroller, text: label(), stopLabel: backfillLabels.stop, onStop: userCancel }) : null;
    } catch { mask = null; }
    for (const name of CANCEL_EVENTS) win.addEventListener(name, userCancel, { capture: true, passive: true });
    operation = run; backfillState = { phase: "running", steps: 0 }; notify();
    return (async () => {
      let phase = "done";
      let direction = checkpoint?.direction || "older";
      try {
        if (checkpoint) {
          const bounds = scrollBounds();
          const shift = reverseFlow ? 0 : scroller.scrollHeight - checkpoint.height;
          const boundary = Math.max(bounds.oldest, Math.min(bounds.newest, checkpoint.top + shift));
          // Revisit a small overlap at the saved boundary.
          const overlap = Math.max(1, (scroller.clientHeight || 500) * 0.2) * (direction === "older" ? 1 : -1);
          scroll(boundary + overlap);
          await pause();
        }
        let idle = 0; let lastState = ""; let mountWait = 0; let active = 0;
        let last = win.performance.now();
        while (!cancelled()) {
          if (document.hidden) { await visible(); last = win.performance.now(); continue; }
          const now = win.performance.now(); active += now - last; last = now;
          if (active >= BACKFILL_TIMEOUT_MS || steps >= BACKFILL_MAX_STEPS) { phase = "timeout"; break; }
          steps += 1;
          const value = read();
          await capture(value);
          if (cancelled()) break;
          backfillState = { phase: "running", steps }; mask?.update(label()); notify();
          // Let rows already in view render before moving on, within a bound.
          if (value.historyLoading && mountWait < MOUNT_WAIT_MS) { mountWait += SETTLE_MS; await pause(); continue; }
          mountWait = 0;
          const state = JSON.stringify([value.messages.map((message) => message.id), scroller?.scrollTop || 0, scroller?.scrollHeight || 0]);
          idle = state === lastState ? idle + 1 : 0; lastState = state;
          const top = scroller?.scrollTop || 0; const bounds = scrollBounds();
          const step = Math.max(100, (scroller?.clientHeight || 500) * 0.8);
          if (direction === "older") {
            if (scroller && top > bounds.oldest + 1) {
              if (idle >= 3) { phase = "unavailable"; break; }
              scroll(Math.max(bounds.oldest, top - step));
            } else if (value.loadEarlier?.isConnected && !value.loadEarlier.disabled && idle < 3) value.loadEarlier.click();
            else if (idle < TOP_QUIET_STEPS) { /* the site may still be loading at the top */ }
            else if (scroller) { direction = "newer"; idle = 0; lastState = ""; }
            else break;
          } else if (top < bounds.newest - 1) {
            if (idle >= 3) { phase = "unavailable"; break; }
            scroll(Math.min(bounds.newest, top + step));
          } else break;
          await pause();
        }
        if (cancelled()) phase = cancelReason === "user-cancelled" ? "stopped" : "";
        if (phase === "timeout" && scroller?.isConnected) backfillCheckpoint = {
          generation: session, scroller, direction, top: scroller.scrollTop, height: scroller.scrollHeight
        };
      } catch { phase = "unavailable"; }
      finally {
        win.clearTimeout(timer); wake = null;
        for (const name of CANCEL_EVENTS) win.removeEventListener(name, userCancel, true);
        restore();
        if (mask) { await frame(); mask.remove(); }
        if (operation === run) {
          operation = null;
          if (sameSource()) { backfillState = phase ? { phase, steps } : null; notify(); }
        }
      }
      return backfillState;
    })();
  }

  // Location reads the mounted page only. Navigation never scrolls or activates
  // the website's history loader; older messages arrive through masked backfill.
  function ensureLocation(key, config) {
    return Promise.resolve(resolveLocation(key, config));
  }

  return {
    configure(enabled, { retainLoaded: retain = false, backfill: autoBackfill = false } = {}) {
      if (disposed) return;
      wanted = Boolean(enabled);
      if (!wanted) { backfillWanted = false; if (index) { clear(); readMessages.reset?.(); notify(); } return; }
      if (retainLoaded !== Boolean(retain)) { clear(); readMessages.reset?.(); }
      retainLoaded = Boolean(retain);
      const nextBackfill = Boolean(autoBackfill && retainLoaded);
      if (backfillWanted && !nextBackfill) {
        operation?.cancel("backfill-disabled"); backfillState = null; backfillCheckpoint = null;
      }
      backfillWanted = nextBackfill;
      scheduleBackfill();
      void syncMounted();
    },
    backfill,
    enabled: () => Boolean(index),
    awaitingConversation: () => wanted && !index && !isManagementRoute(),
    title,
    snapshot: () => index ? { ...index.status(), ...(readingProgress ? { phase: "loading", progress: readingProgress } : {}),
      ...(backfillState ? { backfill: { ...backfillState } } : {}), generation, source: "dom" } : null,
    outline, syncMounted, scheduleSync, resolveTarget, resolveLocation, ensureLocation,
    retainedChapter(key, config = {}) {
      const target = outline(config).targets.get(key);
      return target ? index.messageChapter(target.messageId, target.title) : null;
    },
    exportConversation: () => index?.exportConversation() || null,
    async search(query, options = {}) {
      searchController?.abort(); searchController = new AbortController();
      const current = index; const session = generation;
      const result = await current?.search(query, { ...options, signal: searchController.signal });
      return result && current === index && session === generation ? { ...result, generation: session } : null;
    },
    retry() {
      if (!index) return Promise.resolve();
      signature = "";
      return syncMounted();
    },
    rebuild() {
      if (disposed || !wanted) return Promise.resolve();
      clear(); readMessages.reset?.(); notify();
      rebuilding = true;
      const pending = syncMounted({ force: true });
      rebuilding = false;
      return pending;
    },
    dispose() { disposed = true; wanted = false; clear(); readMessages.reset?.(); }
  };
}
