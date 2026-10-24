// Use ChatGPT's own history loader and model merge. Never splice React-owned DOM.
// These are private host interfaces: require a unique, validated match and fail
// explicitly when a host release changes their shape.
export function createChatGptNativeNavigation({ window: win, loadModule = (url) => import(url) }) {
  const currentId = () => win.location.pathname.match(/\/c\/([a-zA-Z0-9-]+)(?:\/|$)/)?.[1] || "";

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
    function inspect(value, depth = 0) {
      if (!value || typeof value !== "object" || depth > 2 || visited.has(value)) return;
      visited.add(value);
      visit(value);
      for (const key of ["current", "value"]) inspect(value[key], depth + 1);
    }
    const doc = win.document;
    const starts = [doc.querySelector('main [data-message-id]'), doc.querySelector('main article'),
      doc.querySelector('main [data-conversation-role]'), doc.querySelector('main p'), doc.querySelector('main')].filter(Boolean);
    const fibers = new Set();
    for (const element of starts) {
      const key = Object.keys(element).find((name) => name.startsWith("__reactFiber"));
      for (let fiber = element[key], depth = 0; fiber && depth < 150 && !fibers.has(fiber); fiber = fiber.return, depth++) {
        fibers.add(fiber);
        inspect(fiber.ref);
        inspect(fiber.memoizedProps?.value);
        for (let context = fiber.dependencies?.firstContext; context; context = context.next) inspect(context.memoizedValue);
        for (let hook = fiber.memoizedState, count = 0; hook && count < 200; hook = hook.next, count++) inspect(hook.memoizedState);
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

  return {
    async reveal(conversationId, { messageId, prepare = false, signal } = {}) {
      if (!conversationId || currentId() !== conversationId || signal?.aborted) return { ok: false, reason: "source-changed" };
      try {
        const require = await runtime();
        if (!require) return { ok: false, reason: "native-list-unavailable" };
        const host = hostInterfaces(require);
        if (!host) return { ok: false, reason: "native-list-unavailable" };
        const scope = hostScope(host.token, host.families, conversationId);
        if (!scope) return { ok: false, reason: "native-list-unavailable" };
        if (currentId() !== conversationId || signal?.aborted) return { ok: false, reason: "source-changed" };
        await host.load(scope, conversationId, signal);
        if (currentId() !== conversationId || signal?.aborted) return { ok: false, reason: "source-changed" };
        if (messageId || prepare) {
          const list = hostMessageList();
          if (!list) return { ok: false, reason: "native-list-unavailable" };
          if (messageId) await list.scrollToMessage(messageId);
        }
        return currentId() === conversationId && !signal?.aborted ? { ok: true } : { ok: false, reason: "source-changed" };
      } catch (error) {
        return { ok: false, reason: signal?.aborted || currentId() !== conversationId ? "source-changed" : "native-load-failed" };
      }
    }
  };
}
