import "./i18n.js";
import { createSidepanelChapterReader } from "./sidepanel-chapter-reader.js";
import { matchesSearch } from "./window-search.js";
import { bindSearchInput } from "./search-input.js";
import { sendRuntimeMessage } from "./runtime-message.js";
import { createMarkerListReconciler } from "./marker-list-reconciler.js";
import { createMarkerStreamingIndicator } from "./marker-motion-suppression.js";
import { appendParsedMarkdownInline, parseChapterMarkdown } from "./chapter-markdown.js";
import { revealChapterOption } from "./chapter-selector-scroll.js";
import {
  chapterSelectionIdentity,
  chapterParentPath,
  resolveSelectedChapterKey
} from "./window-chapter-outline.js";
import { didWindowConversationChange } from "./window-source-state.js";

(() => {
  const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
  const root = document.getElementById("polaris-window");
  const i18n = globalThis.PolarisI18n || { locale: "en", t: (key) => key };
  const { locale, t } = i18n;
  const supportedPlatforms = [
    { key: "chatgpt", label: "ChatGPT", favicon: "icons/platform-chatgpt.png" },
    { key: "claude", label: "Claude", favicon: "icons/platform-claude.png" },
    { key: "gemini", label: "Gemini", favicon: "icons/platform-gemini.png" },
    { key: "grok", label: "Grok", favicon: "icons/platform-grok.png" },
    { key: "doubao", label: "Doubao", favicon: "icons/platform-doubao.png" },
    { key: "kimi", label: "Kimi", favicon: "icons/platform-kimi.png" },
    { key: "qianwen", label: "Qwen", favicon: "icons/platform-qianwen.png" },
    { key: "yuanbao", label: "Yuanbao", favicon: "icons/platform-yuanbao.png" },
    { key: "xiaohongshu", label: "点点 AI", favicon: "icons/platform-xiaohongshu.png" },
    { key: "manus", label: "Manus", favicon: "icons/platform-manus.png" },
    { key: "deepseek", label: "DeepSeek", favicon: "icons/platform-deepseek.ico" }
  ];
  const state = {
    snapshot: null,
    activeTab: "navigation",
    previousContentTab: "navigation",
    returnScrollY: 0,
    returnFocusTarget: "",
    markerQuery: "",
    chapterQuery: "",
    chapterKey: "",
    chapterSelection: null,
    pendingChapterJump: null,
    chaptersStatus: "idle",
    chapterDirectoryExpanded: false,
    chapterSelectorScrollTop: 0,
    chapterFocusPending: false,
    chapters: [],
    treeChapters: [],
    imageUrls: [],
    imageIndex: 0,
    sourceTabId: null,
    routeKey: "",
    navigationScrollY: 0,
    pendingModeTarget: "",
    isChangingMode: false
  };
  const markerStreamingIndicator = createMarkerStreamingIndicator({
    setActive(marker, isActive) {
      marker.classList.toggle("is-streaming", isActive);
    }
  });
  const windowMarkerListReconciler = createMarkerListReconciler({
    createRow: renderMarker,
    updateRow: updateWindowMarker
  });
  const isSidepanel = document.documentElement.dataset.windowType === "sidepanel";
  const chapterReader = isSidepanel ? createSidepanelChapterReader({
    document, locale,
    onQueryChange(query) {
      state.chapterQuery = query;
      const input = root.querySelector(".window-search input");
      if (input) input.value = query;
    },
    async onCopy(text) {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
    },
    async onLocate(markerKey) {
      const response = await chrome.runtime.sendMessage({
        type: "POLARIS_WINDOW_COMMAND", command: "jump-to-chapter", markerKey,
        expectedTabId: state.sourceTabId, expectedRouteKey: state.routeKey, expectResult: true
      });
      if (!response?.ok) throw new Error("Source unavailable");
    }
  }) : null;
  let sourceRetryTimer = 0;

  function changeContentMode(nextTab) {
    const previousTab = state.activeTab;
    if (previousTab === nextTab) return;
    if (previousTab === "navigation") state.navigationScrollY = window.scrollY;
    state.activeTab = nextTab;
    state.isChangingMode = isSidepanel && ["navigation", "chapters"].includes(previousTab)
      && ["navigation", "chapters"].includes(nextTab);
    render();
    state.isChangingMode = false;
    if (nextTab === "navigation") window.scrollTo({ top: state.navigationScrollY, behavior: "auto" });
  }

  function selectContentTab(key) {
    if (key === state.activeTab) {
      if (key === "navigation") state.pendingModeTarget = "";
      return;
    }
    if (key === "chapters" && state.snapshot?.hasConversation && state.chaptersStatus !== "ready") {
      state.pendingModeTarget = "chapters";
      if (state.chaptersStatus !== "loading") requestChapters();
      return;
    }
    state.pendingModeTarget = "";
    changeContentMode(key);
  }

  function requestSourceState() {
    send({ command: "refresh-state" });
  }

  function stopSourceRetry() {
    if (!sourceRetryTimer) return;
    window.clearInterval(sourceRetryTimer);
    sourceRetryTimer = 0;
  }

  function syncSourceRetry(snapshot) {
    const shouldRetry = !snapshot || Boolean(snapshot.supportedRoute && !snapshot.hasConversation);
    if (!shouldRetry) {
      stopSourceRetry();
      return;
    }
    if (!sourceRetryTimer) {
      sourceRetryTimer = window.setInterval(requestSourceState, 1200);
    }
  }

  function startSourceObserver() {
    const refresh = () => requestSourceState();
    chrome.tabs?.onActivated?.addListener?.(refresh);
    chrome.tabs?.onUpdated?.addListener?.((_tabId, changeInfo) => {
      if (changeInfo?.url || changeInfo?.status === "loading" || changeInfo?.status === "complete") {
        refresh();
      }
    });
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refresh();
    });
  }

  function send(message) {
    sendRuntimeMessage(chrome, { type: "POLARIS_WINDOW_COMMAND", ...message });
  }

  function requestChapters() {
    state.chaptersStatus = "loading";
    send({ command: "request-chapters" });
  }

  async function sendReady() {
    const windowType = document.documentElement.dataset.windowType;
    if (windowType === "sidepanel") {
      sendRuntimeMessage(chrome, {
        type: "POLARIS_WINDOW_READY",
        windowType
      });
      return;
    }
    try {
      const currentWindow = await chrome.windows.getCurrent({ populate: true });
      const currentTab = currentWindow.tabs?.find((tab) => tab.active) || currentWindow.tabs?.[0];
      sendRuntimeMessage(chrome, {
        type: "POLARIS_WINDOW_READY",
        windowId: currentWindow.id,
        windowTabId: currentTab?.id,
        windowType: currentWindow.type
      });
    } catch {
      // The background worker will be recreated after an extension reload.
    }
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function activePlatform(snapshot) {
    return supportedPlatforms.find(({ key }) => key === snapshot?.platform) || null;
  }

  function createSettingsIcon() {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("fill", "currentColor");
    icon.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.37-.31-.6-.22l-2.49 1a7.12 7.12 0 0 0-1.69-.98L14.5 2.42C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.5.42L9.12 5.07c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.08-.48 0-.6.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.37.31.6.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.38-2.65a7.12 7.12 0 0 0 1.69-.98l2.49 1c.23.08.48 0 .6-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7Z");
    icon.appendChild(path);
    return icon;
  }

  function createBackIcon() {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "2");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("stroke-linejoin", "round");
    icon.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "m15 18-6-6 6-6");
    icon.appendChild(path);
    return icon;
  }

  function applyTheme(snapshot) {
    let theme = snapshot?.theme === "dark" ? "dark" : "light";
    try {
      theme = window.matchMedia(SYSTEM_THEME_QUERY).matches ? "dark" : "light";
    } catch {
      // Use the snapshot theme if matchMedia is unavailable.
    }
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
  }

  function startThemeObserver() {
    let mediaQueryList;
    try {
      mediaQueryList = window.matchMedia(SYSTEM_THEME_QUERY);
    } catch {
      return;
    }
    const refresh = () => applyTheme(state.snapshot || {});
    if (typeof mediaQueryList.addEventListener === "function") {
      mediaQueryList.addEventListener("change", refresh);
    } else if (typeof mediaQueryList.addListener === "function") {
      mediaQueryList.addListener(refresh);
    }
  }

  function render() {
    const snapshot = state.snapshot || { markerItems: [], hasConversation: false, supportedRoute: false };
    const isLoading = !state.snapshot;
    const existingBody = root.querySelector(":scope > .window-body");
    const activeSearch = document.activeElement?.matches?.(".window-search input")
      ? {
          selectionStart: document.activeElement.selectionStart,
          selectionEnd: document.activeElement.selectionEnd
        }
      : null;
    const focusedTab = document.activeElement?.dataset?.windowTab || "";
    document.querySelector(".image-preview")?.remove();
    applyTheme(snapshot);
    syncSourceRetry(state.snapshot);
    if (state.activeTab !== "chapters") chapterReader?.suspend();
    const body = renderBody(snapshot, { isLoading, existingBody });
    const header = renderHeader(snapshot);
    const oldHeader = root.querySelector(":scope > .window-header");
    if (isSidepanel && existingBody === body && oldHeader) {
      oldHeader.replaceWith(header);
    } else root.replaceChildren(header, body);
    if (focusedTab) header.querySelector(`[data-window-tab="${focusedTab}"]`)?.focus({ preventScroll: true });
    if (activeSearch && state.activeTab !== "settings") {
      focusSearchInput(activeSearch);
    }
    if (state.imageUrls.length) renderImagePreview();
  }

  function focusSearchInput({ selectionStart, selectionEnd, select = false, preventScroll = false } = {}) {
    const input = document.querySelector(".window-search input");
    if (!(input instanceof HTMLInputElement)) return;
    input.focus({ preventScroll });
    if (select) input.select();
    else input.setSelectionRange(selectionStart ?? input.value.length, selectionEnd ?? input.value.length);
  }

  function rememberViewState() {
    state.returnScrollY = window.scrollY;
    if (document.activeElement?.matches?.(".window-search input")) {
      state.returnFocusTarget = "search";
    } else if (!state.returnFocusTarget && document.activeElement?.matches?.(".window-settings-button")) {
      state.returnFocusTarget = "settings";
    }
  }

  function restoreViewState() {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: state.returnScrollY, behavior: "auto" });
      if (state.returnFocusTarget === "search") {
        focusSearchInput();
      } else if (state.returnFocusTarget === "settings") {
        document.querySelector(".window-settings-button")?.focus({ preventScroll: true });
      }
      state.returnFocusTarget = "";
    });
  }

  function openSettings() {
    if (state.activeTab === "settings") return;
    rememberViewState();
    state.previousContentTab = state.activeTab;
    state.activeTab = "settings";
    render();
    window.scrollTo({ top: 0, behavior: "auto" });
    window.requestAnimationFrame(() => {
      document.querySelector(".window-settings-back")?.focus({ preventScroll: true });
    });
  }

  function closeSettings() {
    if (state.activeTab !== "settings") return;
    state.activeTab = state.previousContentTab;
    render();
    restoreViewState();
  }

  function renderHeader(snapshot) {
    const header = element("header", "window-header");
    if (state.activeTab === "settings") {
      const settingsNav = element("div", "window-settings-nav");
      const back = element("button", "window-settings-back");
      back.type = "button";
      back.setAttribute("aria-label", locale === "zh" ? "返回" : "Back");
      back.title = locale === "zh" ? "返回" : "Back";
      back.appendChild(createBackIcon());
      back.addEventListener("click", closeSettings);
      settingsNav.append(back, element("h1", "window-settings-nav-title", locale === "zh" ? "设置" : "Settings"));
      header.appendChild(settingsNav);
      return header;
    }
    const identity = element("div", "window-identity");
    const brand = element("div", "window-brand");
    const icon = element("img", "window-logo");
    icon.src = chrome.runtime.getURL("icons/gpt-voyager-icon-96.png");
    icon.alt = "";
    brand.append(icon, element("div", "window-title", "Polaris"));
    identity.append(brand);
    const meta = element("div", "window-meta");
    const platformData = activePlatform(snapshot);
    if (snapshot?.supportedRoute && platformData) {
      const platform = element("span", "window-platform");
      platform.setAttribute("role", "img");
      platform.setAttribute("aria-label", platformData.label);
      platform.title = platformData.label;
      const platformIcon = element("img", "window-platform-icon");
      platformIcon.src = chrome.runtime.getURL(platformData.favicon);
      platformIcon.alt = "";
      platform.appendChild(platformIcon);
      meta.append(platform);
    }
    const settingsButton = element(
      "button",
      `window-settings-button${state.activeTab === "settings" ? " is-active" : ""}`
    );
    settingsButton.type = "button";
    settingsButton.setAttribute("aria-label", locale === "zh" ? "设置" : "Settings");
    settingsButton.title = locale === "zh" ? "设置" : "Settings";
    settingsButton.setAttribute("aria-pressed", String(state.activeTab === "settings"));
    settingsButton.appendChild(createSettingsIcon());
    settingsButton.addEventListener("pointerdown", () => {
      if (state.activeTab !== "settings") rememberViewState();
    });
    settingsButton.addEventListener("click", () => {
      if (state.activeTab === "settings") closeSettings();
      else openSettings();
    });
    identity.append(meta, settingsButton);
    header.append(identity);

    const search = element("label", "window-search");
    const isChapterSearch = state.activeTab === "chapters";
    search.setAttribute("aria-label", isChapterSearch
      ? (locale === "zh" ? "搜索章节" : "Search chapters")
      : (locale === "zh" ? "搜索 Maker" : "Search Makers"));
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.dir = "auto";
    input.lang = locale === "zh" ? "zh-CN" : "en";
    input.placeholder = isChapterSearch
      ? (locale === "zh" ? "搜索章节" : "Search chapters")
      : (locale === "zh" ? "搜索 Maker" : "Search Makers");
    input.value = state.activeTab === "chapters" ? state.chapterQuery : state.markerQuery;
    bindSearchInput(input, {
      onInput: (value) => {
        if (state.activeTab === "chapters") state.chapterQuery = value;
        else state.markerQuery = value;
      },
      onCommit: () => {
        render();
        focusSearchInput();
      }
    });
    search.append(input);
    header.append(search);

    const tabs = element("nav", "window-tabs");
    [
      ["navigation", locale === "zh" ? "导航" : "Navigation"],
      ["chapters", locale === "zh" ? "章节" : "Chapters"]
    ].forEach(([key, label]) => {
      const button = element("button", `window-tab${state.activeTab === key ? " is-active" : ""}`);
      button.type = "button";
      button.dataset.windowTab = key;
      button.setAttribute("aria-pressed", String(state.activeTab === key));
      button.append(element("span", "window-tab-label", label));
      button.addEventListener("click", () => selectContentTab(key));
      tabs.appendChild(button);
    });
    header.append(tabs);
    return header;
  }

  function renderSearchEmpty(query, onClear) {
    const empty = element("div", "empty-search");
    empty.appendChild(element(
      "p",
      "empty-search-copy",
      locale === "zh" ? `没有匹配“${query}”的结果` : `No results for “${query}”`
    ));
    const clear = element("button", "secondary-button clear-search", locale === "zh" ? "清除搜索" : "Clear search");
    clear.type = "button";
    clear.addEventListener("click", () => {
      onClear();
      render();
      focusSearchInput();
    });
    empty.appendChild(clear);
    return empty;
  }

  function renderBody(snapshot, { isLoading = false, existingBody = null } = {}) {
    const canReuseBody = existingBody instanceof HTMLElement
      && existingBody.dataset.activeTab === state.activeTab;
    const body = canReuseBody ? existingBody : element("section", "window-body");
    body.dataset.activeTab = state.activeTab;
    body.classList.toggle("is-mode-transition", state.isChangingMode);
    if (state.activeTab === "settings") {
      body.replaceChildren(renderSettings(snapshot));
      return body;
    }
    if (state.activeTab === "chapters") {
      const panel = renderChapters(snapshot);
      if (body.firstElementChild !== panel) body.replaceChildren(panel);
      return body;
    }
    const existingPanel = canReuseBody ? body.querySelector(":scope > .navigation-panel") : null;
    const panel = renderNavigation(snapshot, { isLoading, existingPanel });
    if (body.firstElementChild !== panel || body.childElementCount !== 1) {
      body.replaceChildren(panel);
    }
    return body;
  }

  function renderNavigation(snapshot, { isLoading = false, existingPanel = null } = {}) {
    const panel = existingPanel instanceof HTMLElement
      ? existingPanel
      : element("div", "navigation-panel");
    if (isLoading || snapshot.loading) {
      windowMarkerListReconciler.reset();
      markerStreamingIndicator.reset();
      const loading = element("div", "empty-state");
      loading.append(element("h1", "empty-title", locale === "zh" ? "正在读取会话" : "Reading conversation"));
      loading.append(element("p", "empty-copy", locale === "zh" ? "正在检查当前标签页是否为支持的 AI 会话。" : "Checking the current tab for a supported AI conversation."));
      panel.replaceChildren(loading);
      return panel;
    }
    if (!snapshot.supportedRoute || !snapshot.hasConversation) {
      windowMarkerListReconciler.reset();
      markerStreamingIndicator.reset();
      const empty = element("div", "empty-state");
      empty.append(element("h1", "empty-title", locale === "zh" ? "这里还没有对话" : "No conversation here"));
      empty.append(element("p", "empty-copy", locale === "zh" ? "打开支持的 AI 对话后，Maker 会出现在这里。" : "Open a supported AI conversation to see its Makers here."));
      const platforms = element("div", "platform-stack");
      platforms.setAttribute("role", "list");
      platforms.setAttribute("aria-label", locale === "zh" ? "支持的平台" : "Supported platforms");
      supportedPlatforms.forEach(({ label, favicon }) => {
        const icon = element("img", "platform-favicon");
        icon.src = chrome.runtime.getURL(favicon);
        icon.alt = label;
        icon.title = label;
        icon.loading = "lazy";
        icon.setAttribute("role", "listitem");
        platforms.appendChild(icon);
      });
      empty.append(platforms);
      panel.replaceChildren(empty);
      return panel;
    }

    const items = filterItems(snapshot.markerItems || [], state.markerQuery);
    if (!items.length) {
      windowMarkerListReconciler.reset();
      markerStreamingIndicator.reset();
      if (state.markerQuery.trim()) {
        panel.replaceChildren(renderSearchEmpty(state.markerQuery, () => { state.markerQuery = ""; }));
      } else {
        const empty = element("div", "empty-state empty-state-compact");
        empty.appendChild(element("p", "empty-copy", locale === "zh" ? "当前对话还没有 Maker。" : "No Makers in this conversation yet."));
        panel.replaceChildren(empty);
      }
      return panel;
    }
    const existingList = panel.querySelector(":scope > .maker-list");
    const list = existingList instanceof HTMLElement ? existingList : element("div", "maker-list");
    const hadRows = list.childElementCount > 0;
    const previousContentSignatures = new Map(
      Array.from(list.children).map((row) => [row.dataset.markerRenderKey, row.dataset.markerContentSignature || ""])
    );
    const renderItems = items.map(windowMarkerRenderItem);
    const { changed, changedKeys } = windowMarkerListReconciler.reconcile(list, renderItems);
    if (panel.firstElementChild !== list || panel.childElementCount !== 1) {
      panel.replaceChildren(list);
    }
    if (hadRows && changed) {
      const changedKeySet = new Set(changedKeys);
      const streamingItem = renderItems.findLast((item) => (
        item.type === "ai"
        && changedKeySet.has(item.key)
        && previousContentSignatures.get(item.key) !== markerContentSignature(item)
      ));
      const streamingMarker = streamingItem
        ? Array.from(list.children).find((row) => row.dataset.markerRenderKey === streamingItem.key)
        : null;
      markerStreamingIndicator.pulse(streamingMarker);
    }
    return panel;
  }

  function filterItems(items, query) {
    if (!String(query || "").trim()) return items;
    return items.filter((item) => matchesSearch(query, item.title || ""));
  }

  function windowMarkerRenderItem(item) {
    return {
      ...item,
      isActive: Boolean(item.markerKey && item.markerKey === state.snapshot?.activeMarkerKey),
      signature: JSON.stringify([
        item.type,
        item.title,
        item.preview,
        item.remainder,
        item.ariaLabel,
        item.isExpanded,
        item.thumbnailSrc,
        item.imageCount,
        item.markerKey && item.markerKey === state.snapshot?.activeMarkerKey
      ])
    };
  }

  function markerContentSignature(item) {
    return JSON.stringify([item.type, item.title, item.preview, item.remainder]);
  }

  function syncWindowMarkerThumbnail(button, item) {
    let image = button.querySelector(":scope > .maker-thumb");
    if (item.type !== "user" || !item.thumbnailSrc) {
      image?.remove();
      return;
    }
    if (!(image instanceof HTMLImageElement)) {
      image = element("img", "maker-thumb");
      image.alt = "";
      image.addEventListener("load", () => {
        image.classList.remove("is-loading");
      });
      image.addEventListener("error", () => {
        image.remove();
      });
      image.addEventListener("click", (event) => {
        event.stopPropagation();
        send({ command: "request-image-preview", groupKey: button.dataset.groupKey || "" });
      });
      button.insertBefore(image, button.querySelector(":scope > .maker-copy"));
    }
    if (image.getAttribute("src") !== item.thumbnailSrc) {
      image.classList.add("is-loading");
      image.src = item.thumbnailSrc;
    }
  }

  function updateWindowMarker(button, item) {
    if (item.type === "empty") {
      button.className = "empty-search";
      button.dataset.markerRenderKey = item.key;
      button.textContent = item.message || "";
      return;
    }
    const wasStreaming = button.classList.contains("is-streaming");
    button.className = `maker-card maker-card-${item.type}${item.isExpanded ? " is-expanded" : ""}${item.isActive ? " is-active" : ""}`;
    button.classList.toggle("is-streaming", wasStreaming);
    button.dataset.markerRenderKey = item.key;
    button.dataset.markerContentSignature = markerContentSignature(item);
    button.dataset.itemType = item.type;
    button.dataset.markerKey = item.markerKey || "";
    button.dataset.groupKey = item.groupKey || "";
    button.dataset.foldKey = item.foldKey || "";
    button.setAttribute("aria-label", item.ariaLabel || item.title || item.preview || "Maker");
    const primaryText = item.type === "fold"
      ? (item.preview || item.title || "")
      : (item.title || item.preview || "");
    const title = button.querySelector(":scope .maker-title");
    if (item.type !== "user" || !title.textContent) {
      title.textContent = primaryText;
    }
    let remainder = button.querySelector(":scope .maker-remainder");
    if (item.type === "fold" && item.remainder) {
      if (!(remainder instanceof HTMLElement)) {
        remainder = element("span", "maker-remainder");
        button.querySelector(":scope .maker-copy").appendChild(remainder);
      }
      remainder.textContent = item.remainder;
    } else {
      remainder?.remove();
    }
    syncWindowMarkerThumbnail(button, item);
  }

  function renderMarker(item) {
    if (item.type === "empty") return element("p", "empty-search", item.message);
    const button = element("button", "maker-card");
    button.type = "button";
    const copy = element("span", "maker-copy");
    copy.append(element("span", "maker-title"));
    if (item.type === "ai") {
      const loader = element("img", "maker-streaming-loader");
      loader.src = chrome.runtime.getURL("icons/loader-2.svg");
      loader.alt = "";
      loader.setAttribute("aria-hidden", "true");
      button.append(loader);
    }
    button.append(copy);
    if (item.type === "user") {
      const chevron = element("span", "maker-chevron");
      chevron.setAttribute("aria-hidden", "true");
      button.append(chevron);
    }
    button.addEventListener("click", () => {
      const itemType = button.dataset.itemType;
      if (itemType === "ai") send({ command: "jump-to-marker", markerKey: button.dataset.markerKey || "" });
      if (itemType === "user") send({ command: "toggle-user-group", groupKey: button.dataset.groupKey || "" });
      if (itemType === "fold") send({ command: "toggle-fold-group", foldKey: button.dataset.foldKey || "" });
      if (itemType === "earlier") send({ command: "toggle-earlier-groups" });
    });
    updateWindowMarker(button, item);
    return button;
  }

  function renderChapters(snapshot) {
    if (chapterReader) return chapterReader.update({
      conversationKey: `${state.sourceTabId}:${state.routeKey}`,
      nodes: state.treeChapters,
      preferredKey: snapshot.activeMarkerKey,
      query: state.chapterQuery,
      ready: state.chaptersStatus === "ready" || !snapshot.hasConversation
    });
    const panel = element("div", "chapters-panel");
    const hasLoadedChapters = state.chaptersStatus === "ready";
    const chapters = hasLoadedChapters ? state.chapters : (snapshot.headings || []).map((heading) => ({
      id: heading.id,
      title: heading.title,
      markerKey: heading.markerKey,
      depth: 0,
      parentKey: "",
      paragraphs: []
    }));
    if (!chapters.length) {
      panel.appendChild(element(
        "p",
        "empty-search",
        state.chaptersStatus === "loading"
          ? (locale === "zh" ? "正在读取章节内容…" : "Reading chapter content…")
          : (locale === "zh" ? "当前对话没有章节" : "No chapters in this conversation")
      ));
      return panel;
    }
    const filtered = chapters.filter((chapter) => matchesSearch(
      state.chapterQuery,
      [chapterParentPath(chapters, chapter), chapter.title].filter(Boolean).join(" / ")
    ));
    if (!filtered.length) {
      panel.appendChild(renderSearchEmpty(state.chapterQuery, () => { state.chapterQuery = ""; }));
      return panel;
    }
    const preferredSelection = state.pendingChapterJump || state.chapterSelection;
    state.chapterKey = resolveSelectedChapterKey(chapters, state.chapterKey, preferredSelection);
    const currentChapter = chapters.find((entry) => entry.markerKey === state.chapterKey) || chapters[0];
    const visibleIndex = Math.max(0, filtered.indexOf(currentChapter));
    const chapter = filtered[visibleIndex] || filtered[0];
    state.chapterKey = chapter.markerKey || "";
    state.chapterSelection = chapterSelectionIdentity(chapters, chapter);
    const layout = element("div", "chapter-layout");
    const selectorSlot = element("div", "chapter-selector-slot");
    const selectorShell = element("div", `chapter-selector-shell${state.chapterDirectoryExpanded ? " is-expanded" : ""}`);
    const selector = element("nav", "chapter-selector");
    selector.id = "chapter-selector";
    selector.setAttribute("aria-label", locale === "zh" ? "章节目录" : "Chapters");
    selector.addEventListener("scroll", () => { state.chapterSelectorScrollTop = selector.scrollTop; });
    filtered.forEach((entry) => {
      const isActive = entry === chapter;
      const option = element("button", `chapter-option${isActive ? " is-active" : ""}`);
      option.type = "button";
      option.style.setProperty("--chapter-depth", String(Math.max(0, Number(entry.depth) || 0)));
      const path = state.chapterQuery.trim() ? chapterParentPath(chapters, entry) : "";
      if (path) option.appendChild(element("span", "chapter-option-path", path));
      option.appendChild(element("span", "chapter-option-title", entry.title));
      if (isActive) option.setAttribute("aria-current", "true");
      option.addEventListener("click", () => {
        state.chapterSelectorScrollTop = selector.scrollTop;
        state.chapterKey = entry.markerKey || "";
        const selection = chapterSelectionIdentity(chapters, entry);
        state.chapterSelection = selection;
        state.pendingChapterJump = selection;
        if (entry.markerKey) {
          send({ command: "jump-to-chapter", markerKey: entry.markerKey });
        }
        state.chapterDirectoryExpanded = false;
        state.chapterFocusPending = true;
        render();
      });
      selector.appendChild(option);
    });
    const menu = element("button", "chapter-menu-button");
    menu.type = "button";
    const setMenuLabel = () => {
      const label = state.chapterDirectoryExpanded
        ? (locale === "zh" ? "收起章节目录" : "Collapse chapters")
        : (locale === "zh" ? "展开章节目录" : "Expand chapters");
      menu.setAttribute("aria-label", label);
      menu.title = label;
      menu.setAttribute("aria-expanded", String(state.chapterDirectoryExpanded));
    };
    menu.setAttribute("aria-controls", selector.id);
    setMenuLabel();
    menu.appendChild(createChapterMenuIcon());
    menu.addEventListener("click", () => {
      state.chapterDirectoryExpanded = !state.chapterDirectoryExpanded;
      selectorShell.classList.toggle("is-expanded", state.chapterDirectoryExpanded);
      if (state.chapterDirectoryExpanded) fitExpandedChapterDirectory(selectorShell, selector);
      else {
        selectorShell.style.removeProperty("--chapter-directory-top");
        selectorShell.style.removeProperty("--chapter-directory-max-height");
      }
      setMenuLabel();
    });
    selectorShell.append(selector, menu);
    selectorSlot.appendChild(selectorShell);
    layout.appendChild(selectorSlot);
    window.requestAnimationFrame(() => {
      if (!selector.isConnected) return;
      selector.scrollTop = state.chapterSelectorScrollTop;
      const activeOption = selector.querySelector(".chapter-option.is-active");
      if (state.chapterFocusPending && activeOption) {
        revealChapterOption(selector, activeOption);
        state.chapterSelectorScrollTop = selector.scrollTop;
        state.chapterFocusPending = false;
        activeOption.focus({ preventScroll: true });
      }
      if (state.chapterDirectoryExpanded) fitExpandedChapterDirectory(selectorShell, selector);
    });
    const card = element("article", "chapter-card");
    card.appendChild(element("h1", "chapter-title", chapter.title));
    const content = element("div", "chapter-content");
    const blocks = Array.isArray(chapter.blocks) && chapter.blocks.length
      ? chapter.blocks
      : (chapter.paragraphs || []).map((text) => ({ tagName: "p", text }));
    blocks.forEach((block) => appendChapterBlock(content, block));
    if (!blocks.length) {
      content.appendChild(element(
        "p",
        "chapter-muted",
        hasLoadedChapters
          ? (locale === "zh" ? "当前章节没有可读取的正文。" : "No readable content was found for this chapter.")
          : (locale === "zh" ? "正在读取章节内容…" : "Reading chapter content…")
      ));
    }
    card.appendChild(content);
    const actions = element("div", "chapter-actions");
    const copy = element("button", "secondary-button", locale === "zh" ? "复制本章" : "Copy chapter");
    copy.type = "button";
    copy.addEventListener("click", () => writeClipboardAndConfirm(copy, chapterPlainText(chapter)));
    const more = element("details", "chapter-more");
    const moreLabel = element("summary", "secondary-button", locale === "zh" ? "更多" : "More");
    const full = element("button", "chapter-more-action copy-full-text", locale === "zh" ? "复制全文" : "Copy full text");
    full.type = "button";
    full.addEventListener("click", () => writeClipboardAndConfirm(full, chapters.map(chapterPlainText).join("\n\n")));
    more.append(moreLabel, full);
    if (blocks.length) actions.append(copy, more);
    card.appendChild(actions);
    layout.appendChild(card);
    panel.appendChild(layout);
    return panel;
  }

  function createChapterMenuIcon() {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "1.8");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("aria-hidden", "true");
    for (const y of [6, 12, 18]) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
      line.setAttribute("d", `M4 ${y}h16`);
      icon.appendChild(line);
    }
    return icon;
  }

  function fitExpandedChapterDirectory(shell, selector) {
    const top = shell.getBoundingClientRect().top;
    const brandBottom = document.querySelector(".window-identity")?.getBoundingClientRect().bottom || 0;
    const minTop = Math.max(12, brandBottom + 8);
    const maxHeight = Math.max(180, window.innerHeight - minTop - 12);
    shell.style.setProperty("--chapter-directory-max-height", `${maxHeight}px`);
    const height = Math.min(selector.scrollHeight, maxHeight);
    const shift = Math.min(0, window.innerHeight - 12 - height - top);
    shell.style.setProperty("--chapter-directory-top", `${Math.max(minTop - top, shift)}px`);
  }

  function appendChapterMarkdownBlocks(target, blocks) {
    blocks.forEach((block) => {
      if (block.type === "list") {
        const list = element(block.ordered ? "ol" : "ul");
        block.items.forEach((item) => {
          const li = element("li");
          if (typeof item.checked === "boolean") {
            const checkbox = element("input");
            checkbox.type = "checkbox";
            checkbox.checked = item.checked;
            checkbox.disabled = true;
            li.appendChild(checkbox);
          }
          appendParsedMarkdownInline(li, item.inline, document, state.snapshot?.routeKey || location.href);
          appendChapterMarkdownBlocks(li, item.children);
          list.appendChild(li);
        });
        target.appendChild(list);
        return;
      }
      if (block.type === "table") {
        const wrap = element("div", "chapter-table-wrap");
        const table = element("table");
        const head = element("thead");
        const headerRow = element("tr");
        block.headers.forEach((nodes) => {
          const cell = element("th");
          appendParsedMarkdownInline(cell, nodes, document, state.snapshot?.routeKey || location.href);
          headerRow.appendChild(cell);
        });
        head.appendChild(headerRow);
        table.appendChild(head);
        const body = element("tbody");
        block.rows.forEach((row) => {
          const tr = element("tr");
          row.forEach((nodes) => {
            const cell = element("td");
            appendParsedMarkdownInline(cell, nodes, document, state.snapshot?.routeKey || location.href);
            tr.appendChild(cell);
          });
          body.appendChild(tr);
        });
        table.appendChild(body);
        wrap.appendChild(table);
        target.appendChild(wrap);
        return;
      }
      if (block.type === "codeBlock") {
        const pre = element("pre");
        pre.appendChild(element("code", "", block.value));
        target.appendChild(pre);
        return;
      }
      if (block.type === "rule") {
        target.appendChild(element("hr"));
        return;
      }
      const node = element(block.type === "heading" ? `h${block.level}` : block.type === "quote" ? "blockquote" : "p");
      if (block.type === "quote") appendChapterMarkdownBlocks(node, block.blocks);
      else appendParsedMarkdownInline(node, block.children, document, state.snapshot?.routeKey || location.href);
      target.appendChild(node);
    });
  }

  function appendChapterBlock(target, block) {
    const value = block.text || (block.hasImage ? "[Image]" : "");
    const parsed = ["p", "table"].includes(block.tagName) ? parseChapterMarkdown(value) : null;
    if (parsed) {
      appendChapterMarkdownBlocks(target, parsed);
      return;
    }
    const tagName = ["pre", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6"].includes(block.tagName) ? block.tagName : "p";
    target.appendChild(element(tagName, "", value));
  }

  function chapterPlainText(chapter) {
    const content = Array.isArray(chapter.blocks) && chapter.blocks.length
      ? chapter.blocks.map((block) => block.text || (block.hasImage ? "[Image]" : ""))
      : (chapter.paragraphs || []);
    return [chapter.title, ...content].filter(Boolean).join("\n\n");
  }

  async function writeClipboardAndConfirm(button, text) {
    const label = button.textContent;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(text);
      button.textContent = locale === "zh" ? "已复制" : "Copied";
    } catch {
      button.textContent = locale === "zh" ? "复制失败" : "Copy failed";
    }
    window.setTimeout(() => { button.textContent = label; }, 1200);
  }

  function renderSettings(snapshot) {
    const panel = element("div", "settings-panel");
    const config = snapshot.config || {};
    const displaySection = element("section", "settings-section");
    displaySection.appendChild(element("h2", "settings-section-title", locale === "zh" ? "列表显示" : "List display"));
    [["maxVisibleUserGroups", locale === "zh" ? "用户分组上限" : "User group limit", 1, 80], ["foldThreshold", locale === "zh" ? "折叠阈值" : "Fold threshold", 2, 80]].forEach(([key, label, min, max]) => {
      const wrapper = element("label", "settings-range");
      const line = element("span", "settings-range-line");
      line.append(element("span", "settings-label", label), element("output", "settings-value", String(config[key] ?? min)));
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(min);
      input.max = String(max);
      input.value = String(config[key] ?? min);
      input.addEventListener("input", () => { line.querySelector("output").textContent = input.value; send({ command: "update-config", patch: { [key]: Number(input.value) } }); });
      wrapper.append(line, input);
      displaySection.appendChild(wrapper);
    });
    panel.appendChild(displaySection);
    const recognitionSection = element("section", "settings-section");
    recognitionSection.appendChild(element("h2", "settings-section-title", locale === "zh" ? "内容识别" : "Content recognition"));
    const types = element("fieldset", "settings-types");
    types.appendChild(element("legend", "settings-legend", locale === "zh" ? "Maker 类型" : "Maker types"));
    [["strong", locale === "zh" ? "粗体文本" : "Bold text"], ["orderedList", locale === "zh" ? "有序列表" : "Ordered list"], ["unorderedList", locale === "zh" ? "无序列表" : "Unordered list"]].forEach(([key, label]) => {
      const checkbox = element("label", "settings-check");
      const input = document.createElement("input");
      input.type = "checkbox";
      const platform = snapshot.platform || "default";
      const configKey = key === "strong" ? "enabledStrongByPlatform" : key === "orderedList" ? "enabledOrderedListByPlatform" : "enabledUnorderedListByPlatform";
      input.checked = Boolean(config[configKey]?.[platform]);
      input.addEventListener("change", () => send({ command: "update-config", patch: { [configKey]: { [platform]: input.checked } } }));
      checkbox.append(input, element("span", "settings-check-label", label));
      types.appendChild(checkbox);
    });
    recognitionSection.appendChild(types);
    const levels = element("fieldset", "settings-types");
    levels.appendChild(element("legend", "settings-legend", locale === "zh" ? "标题级别" : "Heading levels"));
    const platform = snapshot.platform || "default";
    const selectedLevels = Array.isArray(config.enabledLevelsByPlatform?.[platform])
      ? config.enabledLevelsByPlatform[platform]
      : [1, 2, 3];
    [1, 2, 3, 4].forEach((level) => {
      const checkbox = element("label", "settings-check");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = selectedLevels.includes(level);
      input.disabled = input.checked && selectedLevels.length <= 1;
      input.addEventListener("change", () => {
        const nextLevels = selectedLevels.filter((selected) => selected !== level);
        if (input.checked) nextLevels.push(level);
        nextLevels.sort((first, second) => first - second);
        send({ command: "update-config", patch: { enabledLevelsByPlatform: { [platform]: nextLevels } } });
      });
      checkbox.append(input, element("span", "settings-check-label", `H${level}`));
      levels.appendChild(checkbox);
    });
    recognitionSection.appendChild(levels);
    panel.appendChild(recognitionSection);
    const helpSection = element("section", "settings-section");
    helpSection.appendChild(element("h2", "settings-section-title", locale === "zh" ? "帮助与诊断" : "Help and diagnostics"));
    helpSection.appendChild(element("p", "settings-supported", locale === "zh" ? "支持 ChatGPT、Claude、Gemini、Grok、Doubao、Kimi、Qwen、Yuanbao、点点 AI 和 Manus。" : "Supports ChatGPT, Claude, Gemini, Grok, Doubao, Kimi, Qwen, Yuanbao, Diandian AI, and Manus."));
    const footer = element("div", "settings-footer");
    [[locale === "zh" ? "恢复默认" : "Reset", "reset-config"], [locale === "zh" ? "下载诊断" : "Download diagnostics", "download-diagnostics"], [locale === "zh" ? "发送诊断" : "Send diagnostics", "send-diagnostics"]].forEach(([label, command]) => {
      const button = element("button", "secondary-button", label);
      button.type = "button";
      button.addEventListener("click", () => send({ command }));
      footer.appendChild(button);
    });
    helpSection.appendChild(footer);
    const links = element("div", "settings-links");
    [[locale === "zh" ? "更新说明" : "Release notes", "https://github.com/Jeffery-Ho/Polaris-AI-Chat-Navigator/blob/main/changelog.md"], [locale === "zh" ? "反馈" : "Feedback", "https://github.com/Jeffery-Ho/Polaris-AI-Chat-Navigator/issues"]].forEach(([label, url]) => {
      const link = element("a", "settings-link", label);
      link.href = url;
      link.target = "_blank";
      link.rel = "noreferrer";
      links.appendChild(link);
    });
    helpSection.appendChild(links);
    const note = snapshot.releaseNotes?.[0];
    if (note) helpSection.appendChild(element("p", "settings-release-note", `${note.version}: ${note.summary || note.title || ""}`));
    helpSection.appendChild(element("p", "settings-version", snapshot.version || ""));
    panel.appendChild(helpSection);
    return panel;
  }

  function renderImagePreview() {
    const overlay = element("div", "image-preview");
    overlay.addEventListener("click", (event) => { if (event.target === overlay) { state.imageUrls = []; render(); } });
    const close = element("button", "preview-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", t("userMarker.closeImagePreview"));
    close.addEventListener("click", () => { state.imageUrls = []; render(); });
    const image = element("img", "preview-image");
    image.src = state.imageUrls[state.imageIndex] || "";
    image.alt = t("userMarker.imagePreview");
    const previous = element("button", "preview-nav preview-previous", "‹");
    previous.type = "button";
    previous.setAttribute("aria-label", t("userMarker.previousImage"));
    previous.disabled = state.imageUrls.length < 2;
    previous.addEventListener("click", () => { state.imageIndex = (state.imageIndex - 1 + state.imageUrls.length) % state.imageUrls.length; render(); });
    const next = element("button", "preview-nav preview-next", "›");
    next.type = "button";
    next.setAttribute("aria-label", t("userMarker.nextImage"));
    next.disabled = state.imageUrls.length < 2;
    next.addEventListener("click", () => { state.imageIndex = (state.imageIndex + 1) % state.imageUrls.length; render(); });
    overlay.append(close, previous, image, next);
    document.body.appendChild(overlay);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return;
    if (message.type === "POLARIS_WINDOW_STATE" && message.snapshot) {
      const nextTabId = message.tabId ?? null;
      const changedConversation = didWindowConversationChange(state, message);
      if (changedConversation) {
        const pendingChapterJump = state.pendingChapterJump;
        state.chapters = [];
        state.treeChapters = [];
        state.imageUrls = [];
        state.imageIndex = 0;
        state.chapterKey = pendingChapterJump?.markerKey || "";
        state.chapterSelection = pendingChapterJump;
        state.chaptersStatus = "idle";
        state.chapterDirectoryExpanded = false;
        state.chapterSelectorScrollTop = 0;
        state.chapterFocusPending = false;
        windowMarkerListReconciler.reset();
        markerStreamingIndicator.reset();
      }
      state.sourceTabId = nextTabId;
      state.routeKey = message.snapshot.routeKey || "";
      state.snapshot = message.snapshot;
      if (!message.snapshot.hasConversation && state.pendingModeTarget === "chapters") {
        state.pendingModeTarget = "";
        changeContentMode("chapters");
      }
      if ((state.activeTab === "chapters" || state.pendingModeTarget === "chapters")
        && state.chaptersStatus === "idle" && message.snapshot.hasConversation) requestChapters();
      render();
      if (message.expectAck && typeof sendResponse === "function") {
        sendResponse({
          accepted: true,
          hasConversation: Boolean(message.snapshot.hasConversation),
          markerCount: Array.isArray(message.snapshot.markerItems) ? message.snapshot.markerItems.length : 0
        });
      }
    }
    if (message.type === "POLARIS_WINDOW_CHAPTERS") {
      if (message.tabId != null && message.tabId !== state.sourceTabId) return;
      if (message.routeKey && message.routeKey !== state.routeKey) return;
      state.treeChapters = Array.isArray(message.treeChapters) ? message.treeChapters : [];
      state.chapters = Array.isArray(message.chapters) ? message.chapters : [];
      state.chaptersStatus = "ready";
      const preferredSelection = state.pendingChapterJump || state.chapterSelection;
      state.chapterKey = resolveSelectedChapterKey(state.chapters, state.chapterKey, preferredSelection);
      const selectedChapter = state.chapters.find((chapter) => chapter.markerKey === state.chapterKey) || null;
      state.chapterSelection = chapterSelectionIdentity(state.chapters, selectedChapter);
      state.pendingChapterJump = null;
      if (state.pendingModeTarget === "chapters" && state.activeTab === "navigation") {
        state.pendingModeTarget = "";
        changeContentMode("chapters");
      } else render();
    }
    if (message.type === "POLARIS_WINDOW_IMAGE") {
      state.imageUrls = Array.isArray(message.imageUrls) ? message.imageUrls : [];
      state.imageIndex = 0;
      if (state.imageUrls.length) render();
    }
  });

  render();
  startThemeObserver();
  startSourceObserver();
  if (isSidepanel) window.setInterval(() => {
    if (state.activeTab === "chapters" && !document.hidden && state.snapshot?.hasConversation) {
      send({ command: "request-chapters", onlyIfChanged: true });
    }
  }, 1500);
  window.addEventListener("resize", () => {
    if (!state.chapterDirectoryExpanded) return;
    const shell = document.querySelector(".chapter-selector-shell.is-expanded");
    const selector = shell?.querySelector(".chapter-selector");
    if (shell && selector) fitExpandedChapterDirectory(shell, selector);
  });
  if (isSidepanel) window.addEventListener("scroll", () => {
    if (state.activeTab === "navigation") state.navigationScrollY = window.scrollY;
  }, { passive: true });
  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "f") {
      event.preventDefault();
      if (event.shiftKey) {
        state.chapterQuery = "";
        selectContentTab("chapters");
      }
      render();
      focusSearchInput({ select: true });
    }
    if (event.key === "Escape") {
      if (state.imageUrls.length) {
        state.imageUrls = [];
        render();
      } else if (state.chapterDirectoryExpanded && state.activeTab === "chapters") {
        state.chapterDirectoryExpanded = false;
        document.querySelector(".chapter-selector-shell")?.classList.remove("is-expanded");
        const menu = document.querySelector(".chapter-menu-button");
        menu?.setAttribute("aria-expanded", "false");
        menu?.setAttribute("aria-label", locale === "zh" ? "展开章节目录" : "Expand chapters");
        if (menu) menu.title = locale === "zh" ? "展开章节目录" : "Expand chapters";
        menu?.focus({ preventScroll: true });
      } else if (state.activeTab === "settings") {
        closeSettings();
      }
    }
    if (!event.metaKey && !event.ctrlKey && !event.altKey && state.imageUrls.length && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      state.imageIndex = (state.imageIndex + (event.key === "ArrowLeft" ? -1 : 1) + state.imageUrls.length) % state.imageUrls.length;
      render();
    }
  });
  void sendReady();
})();
