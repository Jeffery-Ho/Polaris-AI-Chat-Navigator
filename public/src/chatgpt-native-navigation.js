// Use ChatGPT's own history loader and model merge. Never splice React-owned DOM.
// These are private host interfaces: require a unique, validated match and fail
// explicitly when a host release changes their shape.
const SCROLL_TO_KEY_LIMIT_MS = 2000;

export function createChatGptNativeNavigation({ window: win, loadModule = (url) => import(url) }) {
  const currentId = () => win.location.pathname.match(/\/c\/([a-zA-Z0-9-]+)(?:\/|$)/)?.[1] || "";
  let loadRun = null;

  // Share the host load between preparation and later location requests. The
  // bridge invalidates it when the conversation changes or finishes streaming.
  function ensureLoaded(host, scope, conversationId, signal) {
    if (!loadRun || loadRun.id !== conversationId || loadRun.node !== scope.node || loadRun.signal?.aborted) {
      const run = { id: conversationId, node: scope.node, signal };
      run.promise = Promise.resolve(host.load(scope, conversationId, signal));
      void run.promise.catch(() => {
        if (loadRun === run) loadRun = null;
      });
      loadRun = run;
    }
    return loadRun.promise;
  }

  function completePayload(scope, conversationId) {
    for (const key of ["chatgpt-conversation", "chatgpt-conversation-full"]) {
      const payload = scope.queryClient.getQueryData([key, conversationId]);
      if (!payload || (payload.id || payload.conversation_id) !== conversationId) continue;
      if (Array.isArray(payload.messages) && payload.page_info?.has_previous_page === false && payload.page_info.has_next_page === false) return payload;
      if (!payload.mapping || !payload.current_node) continue;
      const seen = new Set(); let node = payload.current_node;
      while (node && !seen.has(node) && payload.mapping[node] && Object.hasOwn(payload.mapping[node], "parent")) {
        seen.add(node); node = payload.mapping[node].parent;
      }
      if (!node) return payload;
    }
    return null;
  }

  async function runtime() {
    const path = win.__reactRouterManifest?.entry?.imports?.[0];
    if (typeof path !== "string") return null;
    const url = new URL(path, win.location.href);
    if (url.origin !== win.location.origin || !/^\/cdn\/assets\/[\w.-]+\.js$/.test(url.pathname)) return null;
    const value = (await loadModule(url.href)).__webpack_require__;
    return typeof value === "function" && value.m ? value : null;
  }

  function hostInterfaces(require) {
    const factories = Object.entries(require.m);
    const full = factories.filter(([, factory]) => {
      if (typeof factory !== "function") return false;
      const source = Function.prototype.toString.call(factory);
      return ["chatgpt-conversation-full", "forceFull", "mergeActiveBranch"].every((value) => source.includes(value));
    });
    const paging = factories.filter(([, factory]) => {
      if (typeof factory !== "function") return false;
      const source = Function.prototype.toString.call(factory);
      return ["externalSignal", "getDynamicConfig", "num_turns", "Number.isInteger"].every((value) => source.includes(value));
    });
    if (full.length !== 1 || paging.length !== 1) return null;
    const loaders = Object.values(require(full[0][0])).filter((value) => typeof value === "function"
      && ["chatgpt-conversation-full", "forceFull", "mergeActiveBranch"].every((marker) => Function.prototype.toString.call(value).includes(marker)));
    const families = Object.values(require(paging[0][0])).filter((value) => value?.scope);
    const tokens = new Set(families.map((value) => value.scope));
    if (loaders.length !== 1 || tokens.size !== 1) return null;
    return { load: loaders[0], token: families[0].scope, families };
  }

  function visitHostValues(visit) {
    const visited = new Set();
    function inspect(value, fiber, depth = 0) {
      if (!value || typeof value !== "object" || depth > 2 || visited.has(value)) return;
      visited.add(value);
      visit(value, fiber);
      for (const key of ["current", "value"]) inspect(value[key], fiber, depth + 1);
    }
    const doc = win.document;
    const starts = [doc.querySelector('main [data-message-id]'), doc.querySelector('main article'),
      doc.querySelector('main [data-conversation-role]'), doc.querySelector('main p'), doc.querySelector('main')].filter(Boolean);
    const fibers = new Set();
    for (const element of starts) {
      const key = Object.keys(element).find((name) => name.startsWith("__reactFiber"));
      for (let fiber = element[key], depth = 0; fiber && depth < 150 && !fibers.has(fiber); fiber = fiber.return, depth++) {
        fibers.add(fiber);
        inspect(fiber.ref, fiber);
        inspect(fiber.memoizedProps?.value, fiber);
        for (let context = fiber.dependencies?.firstContext; context; context = context.next) inspect(context.memoizedValue, fiber);
        for (let hook = fiber.memoizedState, count = 0; hook && count < 200; hook = hook.next, count++) inspect(hook.memoizedState, fiber);
      }
    }
  }

  function hostScope(token, families, conversationId) {
    const scopes = new Map();
    visitHostValues((value) => {
      if (value.scope === token && value.node && typeof value.get === "function" && typeof value.set === "function"
        && typeof value.query?.setData === "function" && typeof value.queryClient?.getQueryData === "function") {
        try {
          const data = value.queryClient.getQueryData(["chatgpt-conversation", conversationId]);
          const known = (data?.id || data?.conversation_id) === conversationId;
          const paging = !known && families.some((family) => typeof value.get(family, conversationId)?.complete === "boolean");
          if (known || paging) scopes.set(value.node, value);
        } catch { /* A scope without current-conversation state is not a match. */ }
      }
    });
    return scopes.size === 1 ? [...scopes.values()][0] : null;
  }

  function hostMessageList() {
    const handles = new Set();
    visitHostValues((value) => {
      if (typeof value.scrollToMessage !== "function") return;
      const source = Function.prototype.toString.call(value.scrollToMessage);
      if (source.includes("messageIds") && source.includes("scrollToKey")) handles.add(value);
    });
    return handles.size === 1 ? [...handles][0] : null;
  }

  function hostVirtualTarget(messageId) {
    const targets = new Map();
    visitHostValues((api, fiber) => {
      if (typeof api.getEntryGeometry !== "function" || typeof api.scrollToKey !== "function") return;
      const entries = fiber.memoizedProps?.entries;
      if (!Array.isArray(entries)) return;
      const matches = entries.filter((entry) => entry.turn?.messageIds?.includes(messageId));
      if (matches.length === 1 && typeof matches[0].turnKey === "string") targets.set(api, { api, key: matches[0].turnKey });
    });
    return targets.size === 1 ? [...targets.values()][0] : null;
  }

  async function scrollTowardTarget(target, conversationId, signal) {
    if (win.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const row = win.document.querySelector('main [data-turn-key]');
    let scroller = row?.parentElement;
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight
      && /^(auto|scroll|overlay)$/.test(win.getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
    if (!scroller || typeof scroller.scrollTo !== "function") return;
    // The host only offers instant scrollToKey. Its geometry lets us approach
    // the unmounted turn first, without teleporting there to measure its DOM.
    function destination() {
      const anchor = scroller.querySelector('[data-turn-key]');
      const from = anchor && target.api.getEntryGeometry(anchor.dataset.turnKey);
      const to = target.api.getEntryGeometry(target.key);
      if (!from || !to || !anchor) return null;
      const zoom = anchor.offsetWidth ? anchor.getBoundingClientRect().width / anchor.offsetWidth : 1;
      return scroller.scrollTop + anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top + (to.startPx - from.startPx) * zoom;
    }
    const initial = destination();
    if (!Number.isFinite(initial) || Math.abs(initial - scroller.scrollTop) < 2) return;
    await new Promise((resolve, reject) => {
      let frame = 0, start, previous = 0;
      const inputs = ["wheel", "touchstart", "pointerdown", "keydown"];
      const cancel = () => finish(new Error("navigation-cancelled"));
      function finish(error) {
        win.cancelAnimationFrame(frame);
        signal?.removeEventListener("abort", cancel);
        for (const input of inputs) scroller.removeEventListener(input, cancel, true);
        error ? reject(error) : resolve();
      }
      function step(time) {
        if (signal?.aborted || currentId() !== conversationId || !scroller.isConnected) { cancel(); return; }
        start ??= time;
        const progress = Math.min(1, (time - start) / 450);
        const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
        const top = destination();
        if (!Number.isFinite(top)) { finish(); return; }
        // Re-read geometry as the host measures newly visible turns, so height
        // corrections do not fight the animation or send it back to old offsets.
        scroller.scrollTo({ top: scroller.scrollTop + (top - scroller.scrollTop) * (eased - previous) / (1 - previous), behavior: "instant" });
        previous = eased;
        if (progress === 1) finish();
        else frame = win.requestAnimationFrame(step);
      }
      signal?.addEventListener("abort", cancel, { once: true });
      for (const input of inputs) scroller.addEventListener(input, cancel, { capture: true, passive: true });
      frame = win.requestAnimationFrame(step);
    });
  }

  const navigation = {
    invalidate() { loadRun = null; },
    prepare(conversationId, options = {}) { return navigation.reveal(conversationId, { ...options, prepare: true, includeSnapshot: true }); },
    // `instant` skips the approach animation, so a jump lands and highlights at once.
    async reveal(conversationId, { messageId, prepare = false, includeSnapshot = false, instant = false, signal } = {}) {
      if (!conversationId || currentId() !== conversationId || signal?.aborted) return { ok: false, reason: "source-changed" };
      try {
        const require = await runtime();
        if (!require) return { ok: false, reason: "native-list-unavailable" };
        const host = hostInterfaces(require);
        if (!host) return { ok: false, reason: "native-list-unavailable" };
        const scope = hostScope(host.token, host.families, conversationId);
        if (!scope) return { ok: false, reason: "native-list-unavailable" };
        if (currentId() !== conversationId || signal?.aborted) return { ok: false, reason: "source-changed" };
        await ensureLoaded(host, scope, conversationId, signal);
        if (currentId() !== conversationId || signal?.aborted) return { ok: false, reason: "source-changed" };
        if (messageId || prepare) {
          const list = hostMessageList();
          if (!list) return { ok: false, reason: "native-list-unavailable" };
          if (messageId) {
            const target = hostVirtualTarget(messageId);
            if (target) {
              if (!instant) await scrollTowardTarget(target, conversationId, signal);
              if (currentId() !== conversationId || signal?.aborted) return { ok: false, reason: "source-changed" };
              // scrollToKey may never settle in some hosts; the turn is mounted by then.
              await Promise.race([target.api.scrollToKey(target.key, undefined, { align: "top", signal }),
                new Promise((resolve) => win.setTimeout(resolve, SCROLL_TO_KEY_LIMIT_MS))]);
            } else await list.scrollToMessage(messageId);
          }
        }
        if (currentId() !== conversationId || signal?.aborted) return { ok: false, reason: "source-changed" };
        return includeSnapshot ? { ok: true, payload: completePayload(scope, conversationId) } : { ok: true };
      } catch (error) {
        return { ok: false, reason: signal?.aborted || currentId() !== conversationId ? "source-changed"
          : error?.message === "navigation-cancelled" ? "navigation-cancelled" : "native-load-failed" };
      }
    }
  };
  return navigation;
}
