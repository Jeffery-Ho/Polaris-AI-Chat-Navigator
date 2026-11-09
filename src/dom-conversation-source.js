import { domMessageBlocks } from "./dom-message-blocks.js";

const SOURCE_ATTRIBUTES = ["data-message-id", "data-msg-id", "data-event-id", "data-archer-id", "data-conversation-turn-id", "data-virtual-list-item-key", "data-turn-id", "data-index"];
const USER_BODY = {
  claude: '[data-testid="user-message"]',
  deepseek: ".ds-collapsible-text",
  manus: ".chat-message-body",
  xiaohongshu: ".user-message__text",
  kimi: ".user-content__text"
};

// A mounted window is a sample of the conversation, never proof of its beginning.
export function createDOMConversationSource({ window: win, platform, readContainers }) {
  let route = "";
  let sequence = 0;
  let nodeIds = new WeakMap();
  let replyOwners = new Map();
  let nativeParts = new Map();
  let previousWindow = null;

  function nativeSourceId(element, role) {
    for (let node = element, depth = 0; node && depth < 6; node = node.parentElement, depth++) {
      // Do not mistake a conversation/list identifier for a message identifier.
      if (node !== element && node.querySelectorAll('[data-message-author-role], .segment, .ds-message').length > 1) break;
      for (const attribute of SOURCE_ATTRIBUTES) {
        const value = node.getAttribute(attribute);
        if (value) return `${platform}:${role}:${attribute}:${value}`;
      }
      if (node.id && !/^(?:gpt-paragraph|polaris)/.test(node.id)
        && (node === element || /(?:message|turn|chat-item)/i.test(node.id))) return `${platform}:${role}:id:${node.id}`;
    }
    return "";
  }

  function scrollContainer(element) {
    for (let node = element?.parentElement; node; node = node.parentElement) {
      const style = win.getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 2) return node;
    }
    return win.document.scrollingElement || win.document.documentElement;
  }

  function mountedContainers(containers, innermost) {
    const nodes = new Set(containers.filter((node) => node?.isConnected));
    const nested = new Set(); const containing = new Set();
    for (const node of nodes) for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (nodes.has(parent)) { nested.add(node); containing.add(parent); }
    }
    // Users retain their attachment envelope; answers use their actual body.
    return [...nodes].filter((node) => !(innermost ? containing : nested).has(node));
  }

  function assignNativeParts(base, entries) {
    let state = nativeParts.get(base);
    if (!state) { state = { nodes: new WeakMap(), parts: new Map(), next: 0, previous: [] }; nativeParts.set(base, state); }
    const remounted = state.parts.size === entries.length && state.previous.length === entries.length
      && entries.every((entry) => !state.nodes.has(entry.element))
      && state.previous.every((part, index) => !part.elementRef.deref()?.isConnected && part.signature === entries[index].signature);
    const claimed = new Set();
    for (const [position, entry] of entries.entries()) {
      let id = state.nodes.get(entry.element) || (remounted ? state.previous[position].id : "");
      if (!id) {
        const matches = [...state.parts.values()].filter((part) => !part.elementRef.deref()?.isConnected
          && !claimed.has(part.id) && part.signature === entry.signature);
        if (matches.length === 1) id = matches[0].id;
        // A single known body may stream into a new node under the same native ID.
        else if (state.parts.size === 1 && entries.length === 1) {
          const only = state.parts.values().next().value;
          if (!only.elementRef.deref()?.isConnected) id = only.id;
        }
      }
      if (!id) { const part = state.next++; id = part ? `${base}:part:${part}` : base; }
      entry.id = id; claimed.add(id); state.nodes.set(entry.element, id);
      state.parts.set(id, { id, elementRef: new win.WeakRef(entry.element), signature: entry.signature });
    }
    state.previous = entries.map(({ id }) => state.parts.get(id));
  }

  function assignIds(entries, scroller) {
    let list = entries[0]?.element.parentElement;
    while (list && !entries.every(({ element }) => list.contains(element))) list = list.parentElement;
    const position = JSON.stringify([scroller?.scrollTop || 0, scroller?.scrollLeft || 0, list?.scrollTop || 0, list?.scrollLeft || 0]);
    const canRecover = list && list !== win.document.body && list !== win.document.documentElement
      && previousWindow && list === previousWindow.list && scroller === previousWindow.scroller
      && position === previousWindow.position && entries.length === previousWindow.entries.length
      && entries.some((entry) => entry.role === "user") && entries.some((entry) => entry.role === "assistant")
      && entries.every((entry, index) => !entry.base && !nodeIds.has(entry.element)
        && !previousWindow.entries[index].base && !previousWindow.entries[index].element.isConnected
        && entry.signature === previousWindow.entries[index].signature);
    const nativeGroups = new Map();
    entries.forEach((entry, index) => {
      if (entry.base) {
        const group = nativeGroups.get(entry.base) || []; group.push(entry); nativeGroups.set(entry.base, group);
      } else {
        if (canRecover) nodeIds.set(entry.element, { id: previousWindow.entries[index].id, role: entry.role });
        if (nodeIds.get(entry.element)?.role !== entry.role) nodeIds.set(entry.element, { id: `${platform}:${entry.role}:dom:${++sequence}`, role: entry.role });
        entry.id = nodeIds.get(entry.element).id;
      }
    });
    for (const [base, group] of nativeGroups) assignNativeParts(base, group);
    previousWindow = entries.length ? { list, scroller, position, entries } : null;
  }

  return () => {
    const url = new URL(win.location.href);
    // Tracking parameters do not identify a different conversation.
    const chatQuery = ["conversationId", "chatId", "sessionId"].map((key) => url.searchParams.get(key) || "").join(":");
    const routeKey = `${url.origin}${url.pathname}:${chatQuery}`;
    if (route !== routeKey) {
      route = routeKey; sequence = 0; nodeIds = new WeakMap(); replyOwners = new Map();
      nativeParts = new Map(); previousWindow = null;
    }
    const { userContainers: userCandidates = [], assistantContainers: assistantCandidates = [], assistantToUser, extraHeadings = [] } = readContainers();
    const userContainers = mountedContainers(userCandidates, false);
    const assistantContainers = mountedContainers(assistantCandidates, true);
    const semanticHeadings = new Map(extraHeadings.filter(({ element, level }) => element?.isConnected
      && Number.isInteger(level) && level >= 1 && level <= 6
      && !userContainers.some((user) => user.contains(element))).map((heading) => [heading.element, heading]));
    // Video cards can sit beside the Markdown body instead of inside it.
    const standaloneHeadings = [...semanticHeadings.keys()].filter((element) =>
      !assistantContainers.some((body) => body.contains(element)));
    const users = new Set(userContainers);
    const candidates = [...userContainers, ...assistantContainers, ...standaloneHeadings].filter((element) => element?.isConnected);
    const elements = [...new Set(candidates)].sort((left, right) => left === right ? 0 : left.compareDocumentPosition(right) & 4 ? -1 : 1);
    const entries = elements.map((element) => {
      const role = users.has(element) ? "user" : "assistant";
      const textSelector = role === "user" && USER_BODY[platform]
        && (platform === "claude" || element.querySelector(USER_BODY[platform])) ? USER_BODY[platform] : "";
      const headingElements = new Map();
      const blocks = domMessageBlocks(element, { baseUrl: url.href, role, textSelector,
        headingFor: (node) => semanticHeadings.get(node), onHeading: (block, node) => headingElements.set(block, node) });
      return { element, role, blocks, headingElements, base: nativeSourceId(element, role), signature: JSON.stringify([role, blocks]) };
    }).filter((entry) => entry.blocks.length);
    const scroller = scrollContainer(entries[0]?.element);
    assignIds(entries, scroller);
    const ids = new Map(entries.map(({ element, id }) => [element, id]));
    let currentUser = "";
    const messages = entries.map(({ id, element, role, blocks, headingElements }) => {
      if (role === "user") currentUser = id;
      let observedOwner = currentUser;
      if (assistantToUser && role === "assistant") {
        let source = element;
        while (source && !assistantToUser.has(source)) source = source.parentElement;
        const owner = assistantToUser.get(source);
        observedOwner = ids.get(userContainers.find((user) => user === owner || owner && user.contains(owner))) || "";
      }
      if (role === "assistant" && observedOwner) replyOwners.set(id, observedOwner);
      const replyTo = role === "assistant" ? replyOwners.get(id) || "" : undefined;
      const targets = new Map();
      blocks.forEach((block, ordinal) => {
        const heading = headingElements.get(block);
        if (heading) targets.set(`index:${id}:${ordinal}:0`, heading);
      });
      return { id, role, blocks, element, targets, ...(replyTo !== undefined ? { replyTo } : {}) };
    });
    const scope = scroller?.parentElement || win.document;
    const earlierControl = [...scope.querySelectorAll('button, [role="button"]')].find((node) =>
      /^(?:加载更多(?:历史(?:消息)?)?|查看更早(?:消息|记录)|Load (?:more|earlier)(?: messages)?|Show older messages)$/i.test(node.textContent.trim())
      && !node.closest('[hidden], [aria-hidden="true"]'));
    const loadEarlier = earlierControl && !earlierControl.disabled && earlierControl.getAttribute("aria-disabled") !== "true" ? earlierControl : null;
    const loadingSelector = '[aria-busy="true"], [data-history-loading="true"]';
    const historyLoading = Boolean(scope.matches?.(loadingSelector) || scope.querySelector(loadingSelector));
    // aria-setsize/posinset are explicit source evidence; scroll position is not.
    const positions = elements.map((element) => element.closest("[aria-posinset][aria-setsize]"));
    const total = Number(positions[0]?.getAttribute("aria-setsize"));
    const indices = positions.map((node) => Number(node?.getAttribute("aria-posinset")));
    const covered = new Set(indices);
    const complete = Number.isSafeInteger(total) && total > 0 && positions.every(Boolean)
      && indices.every((index) => Number.isSafeInteger(index) && index >= 1 && index <= total)
      && covered.size === total && covered.has(1) && covered.has(total)
      && positions.every((node) => Number(node.getAttribute("aria-setsize")) === total)
      && !earlierControl && !historyLoading;
    const title = win.document.title.replace(/\s*[-–|]\s*(?:Kimi|Grok|Claude|DeepSeek|豆包|通义千问|千问|腾讯元宝|Manus).*$/i, "").trim();
    return { routeKey, title, messages, scroller, loadEarlier, hasEarlier: Boolean(earlierControl), historyLoading,
      coverage: complete ? "complete" : "loaded", ...(complete ? { total } : {}) };
  };
}
