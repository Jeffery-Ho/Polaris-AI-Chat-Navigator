import { createConversationIndex, normalizeAnchorText } from './conversation-index.js';
import { resolveGeminiLocation, geminiNativeMessages, geminiVisibleText } from './gemini-native.js';
import { geminiRoute } from '../public/src/gemini-conversation.js';

export function createGeminiIndexController({ window: win, bridgeUrl, onChange, imagePlaceholder, cache = null, onDiagnostics = () => {} }) {
  let index = null; let generation = ''; let path = ''; let script = null;
  let locationRun = null; let preparation = null;
  let nativeState = { phase: 'loading', error: '' }; let streaming = false; let refreshing = false;
  let scope = ''; let lease = ''; let authoritative = false; let retryAt = 0; let runId = -1;
  let restorePromise = Promise.resolve(); let persistTimer = 0; let searchController = null;
  let observedTitle = ''; let started = 0; let timings = {}; let reportedRevision = -1;
  let wanted = false; let disposed = false; let ready = false; let timer = 0;
  let invalid = false; let cached = null; let cacheKey = '';
  let queue = Promise.resolve(); let ingestion = new AbortController();
  const post = command => win.postMessage({ type: 'polaris-gemini-command', command, requestId: generation }, win.location.origin);
  const title = () => win.document.title.replace(/(?:^‎?Gemini\s*[-–]\s*|\s*[-–]\s*(?:Google )?Gemini$)/g, '').trim();
  function clear() {
    locationRun?.cancel('source-changed'); preparation?.(); preparation = null;
    searchController?.abort(); win.clearTimeout(persistTimer);
    scope = ''; lease = ''; authoritative = false; retryAt = 0; runId = -1;
    restorePromise = Promise.resolve(); streaming = false; refreshing = false; reportedRevision = -1;
    nativeState = { phase: 'loading', error: '' };
    post('stop'); win.clearTimeout(timer); ingestion.abort(); ingestion = new AbortController();
    index?.dispose(); index = null; generation = ''; queue = Promise.resolve(); invalid = false; cached = null; cacheKey = '';
  }
  function start() {
    clear(); path = win.location.pathname; generation = win.crypto.randomUUID();
    index = createConversationIndex({ platform: 'gemini', imagePlaceholder });
    index.subscribe(onChange); observedTitle = title(); index.setTitle(observedTitle);
    started = performance.now(); timings = { cacheHit: false, cacheMs: 0, indexMs: 0, historicalRequests: 0 };
    timer = win.setTimeout(() => index?.fail('bridge-unavailable'), 60000);
    if (ready) post('start');
    else if (!script) {
      script = win.document.createElement('script'); script.type = 'module'; script.src = `${bridgeUrl}?instance=${win.crypto.randomUUID()}`;
      script.onload = () => { ready = true; if (index && !disposed) post('start'); };
      script.onerror = () => { win.clearTimeout(timer); index?.fail('bridge-unavailable'); script?.remove(); script = null; };
      (win.document.head || win.document.documentElement).append(script);
    }
    onChange();
  }
  const conversationKey = () => {
    const route = geminiRoute(win.location.href);
    return route ? `gemini:${route.kind}:${route.id}` : '';
  };
  function saveWhenReady() {
    win.clearTimeout(persistTimer);
    if (!index || index.status().phase !== 'complete' || nativeState.phase !== 'ready' || invalid) return;
    const current = index; const session = generation; const owner = scope; const key = conversationKey();
    persistTimer = win.setTimeout(async () => {
      await restorePromise;
      if (index !== current || generation !== session || scope !== owner || invalid || current.status().phase !== 'complete') return;
      const revision = current.status().revision;
      if (reportedRevision !== revision) {
        reportedRevision = revision;
        onDiagnostics({ ...timings, source: geminiRoute(win.location.href)?.kind === 'share' ? 'shared' : 'native', outcome: 'complete', totalMs: performance.now() - started, conversationLength: current.status().count });
      }
      if (cache && owner && lease) {
        const snapshot = current.exportSnapshot();
        if (snapshot) void Promise.resolve(cache.write(owner, key, lease, snapshot)).catch(() => {});
      }
    }, 100);
  }
  function restoreCache(owner) {
    if (owner === scope) return;
    if (scope) { searchController?.abort(); index.reset(); authoritative = false; }
    scope = owner; lease = '';
    if (!owner || !cache) return;
    const current = index; const session = generation; const key = conversationKey(); const began = performance.now();
    restorePromise = (async () => {
      let stored;
      try { stored = await cache.read(owner, key); } catch { return; }
      if (current !== index || session !== generation || scope !== owner) return;
      timings.cacheMs += performance.now() - began; lease = stored?.lease || '';
      if (stored?.snapshot && !authoritative) timings.cacheHit = current.restoreSnapshot(stored.snapshot);
    })();
  }
  function receive(event) {
    const data = event.data;
    if (event.source !== win || event.origin !== win.location.origin || data?.type !== 'polaris-gemini-result'
      || !index || data.requestId !== generation || data.path !== path || path !== win.location.pathname) return;
    const nextRun = Number(data.runId) || 0;
    if (nextRun < runId) return;
    if (nextRun > runId) {
      runId = nextRun; ingestion.abort(); ingestion = new AbortController(); queue = Promise.resolve(); invalid = false;
      win.clearTimeout(persistTimer); authoritative = false;
    }
    win.clearTimeout(timer);
    if (['page', 'loading', 'scope'].includes(data.event)) timer = win.setTimeout(() => { index?.fail('network-error'); }, 60000);
    const current = index; const signal = ingestion.signal;
    queue = queue.then(async () => {
      if (signal.aborted || current !== index) return;
      if (data.event === 'scope') restoreCache(/^[a-f0-9]{64}$/.test(data.scope) ? data.scope : '');
      else if (data.event === 'loading') { refreshing = Boolean(data.refresh); retryAt = 0; current.begin(); }
      else if (data.event === 'dirty') { streaming = Boolean(data.streaming); refreshing = true; current.begin(); syncMounted(); }
      else if (data.event === 'page') {
        authoritative = true; const began = performance.now();
        await current.ingest(data.payload, { replace: data.replace !== false && !data.older, older: Boolean(data.older), signal });
        timings.indexMs += performance.now() - began;
        if (!data.payload.title) current.setTitle(title());
      } else if (data.event === 'complete' && !invalid) {
        streaming = false; refreshing = false;
        timings.readMs = Number(data.readMs) || 0; timings.historicalRequests = Number(data.historicalRequests) || 0;
        current.finish(); prepareNative(); saveWhenReady();
      } else if (data.event === 'error') {
        invalid = true; retryAt = Number(data.retryAt) || 0;
        const reason = /^(http-\d{3}|authentication-required|source-changed|wrong-conversation|repeated-cursor|incomplete-chain|conversation-unavailable|unsupported-format|network-error)$/.test(data.reason) ? data.reason : 'unknown-error';
        current.fail(reason);
        onDiagnostics({ ...timings, outcome: 'error', reason, conversationLength: current.status().count, totalMs: performance.now() - started });
      }
    }).catch(error => {
      if (!signal.aborted && current === index) { invalid = true; current.fail('unsupported-format'); onDiagnostics({ outcome: 'error', reason: 'unsupported-format' }); }
    });
  }
  win.addEventListener('message', receive);
  const titleObserver = new win.MutationObserver(syncMounted);
  if (win.document.head) titleObserver.observe(win.document.head, { childList: true, subtree: true, characterData: true });
  function outline(config) {
    const key = JSON.stringify([index?.status().revision, config]);
    if (!cached || key !== cacheKey) { cacheKey = key; cached = index?.getOutline(config) || { items: [], chapters: [], targets: new Map() }; }
    return cached;
  }
  const resolveLocation = (key, config) => resolveGeminiLocation(win.document, outline(config), key);
  function prepareNative() {
    preparation?.(); nativeState = { phase: 'preparing', error: '' };
    const began = performance.now(); const session = generation;
    const observer = new win.MutationObserver(check); let timeout;
    function finish(ready) {
      observer.disconnect(); win.clearTimeout(timeout); preparation = null;
      if (session !== generation) return;
      nativeState = { phase: ready ? 'ready' : 'error', error: ready ? '' : 'native-load-timeout' };
      timings.nativeMs = performance.now() - began; onChange(); saveWhenReady();
    }
    function check() {
      // Read completion verifies the server's conversation identity. Native
      // readiness means the host has mounted its body, not that every private
      // API string is byte-identical to the rendered wording.
      const nodes = [...geminiNativeMessages(win.document, 'user'), ...geminiNativeMessages(win.document, 'assistant')];
      if (nodes.some(node => node.isConnected && (geminiVisibleText(node).trim() || node.querySelector('img')))) finish(true);
    }
    preparation = () => { observer.disconnect(); win.clearTimeout(timeout); };
    observer.observe(win.document.body || win.document.documentElement, { subtree: true, childList: true, characterData: true });
    timeout = win.setTimeout(() => finish(false), 30000);
    check(); onChange();
  }
  function syncMounted() {
    if (!index) return;
    const nextTitle = title();
    if (nextTitle && nextTitle !== observedTitle) { observedTitle = nextTitle; index.setTitle(nextTitle); }
    if (!streaming) return;
    const tree = outline({});
    for (const [key, target] of tree.targets) {
      if (target.role !== 'assistant' || key !== `index:${target.messageId}`) continue;
      const found = resolveGeminiLocation(win.document, tree, key).element;
      if (found) index.updateMessage(target.messageId, geminiVisibleText(found));
    }
  }
  function ensureLocation(key, config) {
    locationRun?.cancel('navigation-cancelled');
    const found = resolveLocation(key, config);
    if (found.element || found.reason !== 'not-mounted') return Promise.resolve(found);
    // Ask the host to mount history through its own scroll container. Never
    // substitute a different Polaris view for the requested native location.
    let scroller = win.document.querySelector('user-query, model-response')?.parentElement;
    while (scroller && !(/auto|scroll/.test(win.getComputedStyle(scroller).overflowY)
      && scroller.scrollHeight > scroller.clientHeight)) scroller = scroller.parentElement;
    scroller ||= win.document.scrollingElement;
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight) return Promise.resolve(found);
    const session = generation; const route = path;
    const seen = new Set();
    const targets = [...outline(config).targets.values()].filter(target => {
      if (seen.has(target.messageId)) return false;
      seen.add(target.messageId); return true;
    });
    const targetPosition = targets.findIndex(target => target.messageId === outline(config).targets.get(key)?.messageId);
    return new Promise(resolve => {
      let interval; let timeout;
      const observer = new win.MutationObserver(check);
      const run = { cancel: reason => finish({ element: null, reason }) };
      function finish(result) {
        if (locationRun !== run) return;
        locationRun = null; observer.disconnect(); win.clearInterval(interval); win.clearTimeout(timeout);
        for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) win.document.removeEventListener(event, interrupt, true);
        resolve(result);
      }
      function interrupt() { run.cancel('navigation-cancelled'); }
      function check() {
        if (generation !== session || win.location.pathname !== route) { run.cancel('source-changed'); return true; }
        const result = resolveLocation(key, config);
        if (result.element || result.reason !== 'not-mounted') { finish(result); return true; }
        return false;
      }
      function step() {
        if (check()) return;
        const mounted = [...win.document.querySelectorAll('user-query .query-text, user-query .query-content, model-response message-content')]
          .map(node => normalizeAnchorText(geminiVisibleText(node)));
        const positions = targets.flatMap((target, i) => mounted.includes(target.anchorText) ? [i] : []);
        const direction = positions.length && targetPosition > Math.max(...positions) ? 1 : -1;
        const next = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight,
          scroller.scrollTop + direction * Math.max(200, scroller.clientHeight * 0.8)));
        scroller.scrollTo({ top: next, behavior: 'instant' });
        scroller.dispatchEvent(new win.Event('scroll'));
      }
      locationRun = run;
      observer.observe(scroller, { childList: true, subtree: true, characterData: true });
      for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) win.document.addEventListener(event, interrupt, true);
      timeout = win.setTimeout(() => finish({ element: null, reason: 'native-load-timeout' }), 20000);
      interval = win.setInterval(step, 400);
      step();
    });
  }
  return {
    configure(enabled) {
      if (disposed) return;
      wanted = enabled;
      if (!enabled || !geminiRoute(win.location.href)) { if (index) { clear(); onChange(); } return; }
      if (!index || path !== win.location.pathname) start();
    },
    enabled: () => Boolean(index), awaitingConversation: () => wanted && !index && /^\/(?:u\/\d+\/)?app\/?$/.test(win.location.pathname),
    title, snapshot: () => index ? { ...index.status(), generation, native: { ...nativeState }, provider: 'gemini', retryAt, refreshing, timings: { ...timings } } : null,
    outline, syncMounted, resolveLocation,
    exportConversation: () => index?.exportConversation() || null,
    resolveTarget: (key, config) => resolveLocation(key, config).element,
    ensureLocation,
    async search(query, options) {
      searchController?.abort(); searchController = new AbortController();
      const current = index; const session = generation;
      const result = await current?.search(query, { ...options, signal: searchController.signal });
      return current === index && session === generation && result ? { ...result, generation } : null;
    },
    retry() { if (index && Date.now() >= retryAt) start(); },
    dispose() { disposed = true; titleObserver.disconnect(); clear(); win.removeEventListener('message', receive); win.dispatchEvent(new win.Event('polaris-gemini-dispose')); script?.remove(); }
  };
}
