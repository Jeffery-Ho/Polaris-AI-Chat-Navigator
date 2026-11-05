import { createIndexReadCooldown } from './index-read-cooldown.js';
import { geminiRoute, decodeGeminiRpc, readGeminiConversation } from './gemini-conversation.js';

// Keep credentials inside the page world. Only projected messages and a hashed
// account scope cross into the content script.
export function installGeminiIndexBridge(win) {
  win.__polarisGeminiBridge?.();
  const originalFetch = win.fetch;
  const cooldown = createIndexReadCooldown();
  let active = null; let disposed = false;
  function stop() {
    if (!active) return;
    active.controller?.abort(); win.clearTimeout(active.refreshTimer); active = null;
  }
  function valid(context) { return Boolean(context) && !disposed && active === context && context.path === win.location.pathname; }
  function send(context, event, detail = {}) {
    if (valid(context)) win.postMessage({ type: 'polaris-gemini-result', requestId: context.requestId,
      path: context.path, runId: context.runId, event, ...detail }, win.location.origin);
  }
  function identity() {
    const wiz = win.WIZ_global_data || {};
    const label = win.document.querySelector('a[href*="accounts.google.com"][href*="SignOutOptions"]')?.getAttribute('aria-label') || '';
    return label.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase()
      || (typeof wiz.oPEP7c === 'string' && wiz.oPEP7c.includes('@') ? wiz.oPEP7c.toLowerCase() : '');
  }
  async function scopeFor(context) {
    const owner = identity();
    context.owner = owner;
    if (!win.crypto?.subtle || !owner && context.route.kind !== 'share') return '';
    const value = context.route.kind === 'share' ? `gemini:share:${context.route.id}` : `gemini:account:${owner}`;
    const digest = await win.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function schedule(context) {
    if (!valid(context) || context.pendingStreams > 0) return;
    win.clearTimeout(context.refreshTimer);
    context.refreshTimer = win.setTimeout(() => { void read(context, true); }, Math.min(2147483647, Math.max(700, (cooldown.error()?.retryAt || 0) - Date.now())));
  }
  async function read(context, refresh = false) {
    if (!valid(context)) return;
    const blocked = cooldown.error();
    if (blocked) { send(context, 'error', { reason: blocked.message, retryAt: blocked.retryAt }); return; }
    context.controller?.abort(); const controller = new AbortController(); context.controller = controller;
    const runId = ++context.runId;
    const current = () => valid(context) && context.runId === runId && !controller.signal.aborted;
    const emit = (event, detail) => { if (current()) send(context, event, detail); };
    const began = Date.now(); let requests = 0;
    emit('loading', { refresh });
    const rpc = async (id, args, signal) => {
      const blocked = cooldown.error(); if (blocked) throw blocked;
      const wiz = win.WIZ_global_data || {};
      if (context.route.kind === 'app' && !wiz.SNlM0e) throw new Error('authentication-required');
      if (context.route.kind === 'app' && identity() !== context.owner) throw new Error('source-changed');
      const query = new URLSearchParams({ rpcids: id, 'source-path': context.path });
      if (wiz.cfb2h) query.set('bl', wiz.cfb2h);
      if (wiz.FdrFJe) query.set('f.sid', wiz.FdrFJe);
      if (context.route.account) query.set('authuser', context.route.account);
      let timeout;
      try {
        timeout = win.setTimeout(() => {
          emit('error', { reason: 'network-error' }); controller.abort();
        }, 45000);
        requests++;
        const response = await originalFetch.call(win, `/_/BardChatUi/data/batchexecute?${query}`, {
          method: 'POST', credentials: 'same-origin', signal,
          body: new URLSearchParams({ 'f.req': JSON.stringify([[[id, JSON.stringify(args), null, 'generic']]]), at: wiz.SNlM0e || '' })
        });
        cooldown.observe(response);
        if (!response.ok) throw cooldown.error() || new Error(`http-${response.status}`);
        return decodeGeminiRpc(await response.text(), id);
      } finally { win.clearTimeout(timeout); }
    };
    try {
      const scope = await scopeFor(context);
      if (!current()) return;
      emit('scope', { scope });
      await readGeminiConversation({ route: context.route, rpc, signal: controller.signal,
        onPage: (payload, options) => emit('page', { payload, ...options }) });
      emit('complete', { readMs: Date.now() - began, historicalRequests: requests, source: context.route.kind === 'share' ? 'shared' : 'native' });
    } catch (error) {
      const reason = /^(http-\d{3}|authentication-required|source-changed|wrong-conversation|repeated-cursor|incomplete-chain|conversation-unavailable|unsupported-format)$/.test(error.message) ? error.message : 'network-error';
      emit('error', { reason, retryAt: Number.isFinite(error.retryAt) ? error.retryAt : 0 });
    }
  }
  function isLatestRead(body, context) {
    try {
      const form = new URLSearchParams(typeof body === 'string' ? body : body?.toString());
      const calls = JSON.parse(form.get('f.req'));
      return calls.some(batch => batch.some(call => {
        if (call?.[0] !== 'hNvQHb') return false;
        const args = JSON.parse(call[1]);
        return args[0] === `c_${context.route.id}` && args[2] == null;
      }));
    } catch { return false; }
  }
  function wrappedFetch(input, init) {
    const context = active;
    let url; let method;
    try { url = new URL(typeof input === 'string' ? input : input.url, win.location.href); method = (init?.method || input?.method || 'GET').toUpperCase(); } catch { /* Non-URL requests retain host behavior. */ }
    const generating = valid(context) && url?.origin === win.location.origin && method === 'POST' && /\/StreamGenerate$/.test(url.pathname);
    if (generating) {
      context.pendingStreams++; context.controller?.abort(); context.runId++;
      win.clearTimeout(context.refreshTimer);
      send(context, 'dirty', { streaming: true });
    }
    const result = originalFetch.call(this, input, init);
    if (generating) {
      void Promise.resolve(result).then(async response => {
        const reader = response.clone().body?.getReader();
        try { if (reader) for (;;) { const chunk = await reader.read(); if (chunk.done || !valid(context)) break; } }
        finally { await reader?.cancel().catch(() => {}); }
      }).catch(() => {}).finally(() => {
        if (valid(context) && --context.pendingStreams === 0) { send(context, 'dirty', { streaming: false }); schedule(context); }
      });
    } else if (valid(context) && url?.origin === win.location.origin && url.pathname.endsWith('/batchexecute')
      && url.searchParams.get('rpcids')?.split(',').includes('hNvQHb') && isLatestRead(init?.body, context)) {
      // Native refetches cover edits, regenerated drafts and branch switches.
      void Promise.resolve(result).then(response => {
        if (response.ok && valid(context)) { context.controller?.abort(); context.runId++; send(context, 'dirty', { streaming: false }); schedule(context); }
      }).catch(() => {});
    }
    return result;
  }
  function command(event) {
    const data = event.data;
    if (event.source !== win || event.origin !== win.location.origin || data?.type !== 'polaris-gemini-command') return;
    if (data.command === 'stop') { stop(); return; }
    if (data.command !== 'start' || typeof data.requestId !== 'string') return;
    const route = geminiRoute(win.location.href); if (!route) return;
    stop(); active = { route, path: win.location.pathname, requestId: data.requestId, runId: 0, owner: '', controller: null, refreshTimer: 0, pendingStreams: 0 };
    void read(active);
  }
  const xhr = win.XMLHttpRequest?.prototype;
  const originalOpen = xhr?.open; const originalSend = xhr?.send;
  const requests = new WeakMap();
  function xhrOpen(method, url, ...args) {
    try { requests.set(this, { method: String(method).toUpperCase(), url: new URL(url, win.location.href) }); } catch { /* Preserve native errors. */ }
    return originalOpen.call(this, method, url, ...args);
  }
  function xhrSend(...args) {
    const context = active; const request = requests.get(this);
    const native = valid(context) && request?.url.origin === win.location.origin;
    const generating = native && request.method === 'POST' && /\/StreamGenerate$/.test(request.url.pathname);
    const reading = native && request.url.pathname.endsWith('/batchexecute') && request.url.searchParams.get('rpcids')?.split(',').includes('hNvQHb') && isLatestRead(args[0], context);
    if (generating) {
      context.pendingStreams++; context.controller?.abort(); context.runId++;
      win.clearTimeout(context.refreshTimer); send(context, 'dirty', { streaming: true });
    }
    if (generating || reading) this.addEventListener('loadend', () => {
      if (generating) context.pendingStreams--;
      if (valid(context) && !context.pendingStreams) {
        if (reading) { context.controller?.abort(); context.runId++; }
        send(context, 'dirty', { streaming: false }); schedule(context);
      }
    }, { once: true });
    try { return originalSend.apply(this, args); }
    catch (error) { if (generating) { context.pendingStreams--; schedule(context); } throw error; }
  }
  function dispose() {
    disposed = true; stop();
    win.removeEventListener('message', command); win.removeEventListener('polaris-gemini-dispose', dispose);
    if (win.fetch === wrappedFetch) win.fetch = originalFetch;
    if (xhr?.open === xhrOpen) xhr.open = originalOpen;
    if (xhr?.send === xhrSend) xhr.send = originalSend;
    delete win.__polarisGeminiBridge;
  }
  win.__polarisGeminiBridge = dispose;
  win.fetch = wrappedFetch;
  if (xhr) { xhr.open = xhrOpen; xhr.send = xhrSend; }
  win.addEventListener('message', command); win.addEventListener('polaris-gemini-dispose', dispose);
  return dispose;
}
if (typeof window !== 'undefined') installGeminiIndexBridge(window);
