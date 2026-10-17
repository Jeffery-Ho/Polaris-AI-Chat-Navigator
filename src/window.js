import { createI18n } from "./i18n.js";
import { createSidepanelChapterReader } from "./sidepanel-chapter-reader.js";
import { matchesSearch } from "./window-search.js";
import { bindSearchInput } from "./search-input.js";
import { sendRuntimeMessage } from "./runtime-message.js";
import { createMarkerListReconciler } from "./marker-list-reconciler.js";
import { createMarkerStreamingIndicator } from "./marker-motion-suppression.js";
import { createSidepanelReleaseNotice } from "./sidepanel-release-notice.js";
import { didWindowConversationChange } from "./window-source-state.js";
import { releaseNotesForUpdate } from "./release-notes.js";

export function initializeSidepanel() {
  const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
  const root = document.getElementById("polaris-window");
  const { locale, t } = createI18n();
  const settingsDestinations = ["preferences", "help", "feedback", "updates", "about"];
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
    settingsPage: "menu",
    settingsScrollByPage: new Map(),
    settingsReturnPage: "",
    returnScrollY: 0,
    returnFocusTarget: "",
    markerQuery: "",
    chapterQuery: "",
    chaptersStatus: "idle",
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
  const chapterReader = createSidepanelChapterReader({
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
  });
  let sourceRetryTimer = 0;

  function changeContentMode(nextTab) {
    const previousTab = state.activeTab;
    if (previousTab === nextTab) return;
    if (previousTab === "navigation") state.navigationScrollY = window.scrollY;
    state.activeTab = nextTab;
    state.isChangingMode = ["navigation", "chapters"].includes(previousTab)
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

  function sendReady() {
    sendRuntimeMessage(chrome, { type: "POLARIS_WINDOW_READY", windowType: "sidepanel" });
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
    const focusedSettingsControl = document.activeElement?.dataset?.settingsFocus || "";
    document.querySelector(".image-preview")?.remove();
    applyTheme(snapshot);
    syncSourceRetry(state.snapshot);
    if (state.activeTab !== "chapters") chapterReader?.suspend();
    const body = renderBody(snapshot, { isLoading, existingBody });
    const header = renderHeader(snapshot);
    const oldHeader = root.querySelector(":scope > .window-header");
    if (existingBody === body && oldHeader) {
      oldHeader.replaceWith(header);
    } else root.replaceChildren(header, body);
    if (focusedTab) header.querySelector(`[data-window-tab="${focusedTab}"]`)?.focus({ preventScroll: true });
    if (focusedSettingsControl && state.activeTab === "settings") {
      root.querySelector(`[data-settings-focus="${focusedSettingsControl}"]`)?.focus({ preventScroll: true });
    }
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
    const focused = document.activeElement;
    if (focused?.matches?.(".window-search input")) {
      state.returnFocusTarget = "search";
    } else if (focused?.matches?.(".maker-card[data-marker-render-key]")) {
      state.returnFocusTarget = { selector: ".maker-card[data-marker-render-key]", key: focused.dataset.markerRenderKey, attribute: "markerRenderKey" };
    } else if (focused?.matches?.(".chapter-node-title[data-key], .chapter-node-dot[data-key]")) {
      state.returnFocusTarget = { selector: `.${focused.classList[0]}[data-key]`, key: focused.dataset.key, attribute: "key" };
    } else if (!state.returnFocusTarget && focused?.matches?.(".window-settings-button")) {
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
      } else if (typeof state.returnFocusTarget === "object") {
        const { selector, key, attribute } = state.returnFocusTarget;
        [...root.querySelectorAll(selector)].find((node) => node.dataset[attribute] === key)?.focus({ preventScroll: true });
      }
      state.returnFocusTarget = "";
    });
  }

  function openSettings() {
    if (state.activeTab === "settings") return;
    rememberViewState();
    state.previousContentTab = state.activeTab;
    state.activeTab = "settings";
    state.settingsPage = "menu";
    state.settingsScrollByPage.clear();
    state.settingsReturnPage = "";
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

  function openSettingsPage(page) {
    if (page !== "menu" && !settingsDestinations.includes(page)) return;
    state.settingsScrollByPage.set(state.settingsPage, window.scrollY);
    if (page !== "menu") state.settingsReturnPage = page;
    state.settingsPage = page;
    render();
    window.scrollTo({ top: state.settingsScrollByPage.get(page) || 0, behavior: "auto" });
    window.requestAnimationFrame(() => {
      const target = page === "menu"
        ? root.querySelector(`[data-settings-destination="${state.settingsReturnPage}"]`)
        : root.querySelector(".window-settings-back");
      target?.focus({ preventScroll: true });
    });
  }

  function backFromSettings() {
    if (state.settingsPage !== "menu") openSettingsPage("menu");
    else closeSettings();
  }

  function renderHeader(snapshot) {
    const header = element("header", "window-header");
    if (state.activeTab === "settings") {
      const settingsNav = element("div", "window-settings-nav");
      const back = element("button", "window-settings-back");
      back.type = "button";
      back.dataset.settingsFocus = "back";
      back.setAttribute("aria-label", state.settingsPage === "menu" ? t("settings.backToContent") : t("settings.backToMenu"));
      back.title = back.getAttribute("aria-label");
      back.appendChild(createBackIcon());
      back.addEventListener("click", backFromSettings);
      settingsNav.append(back, element("h1", "window-settings-nav-title", t(`settings.page.${state.settingsPage}`)));
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

    const search = element("div", "window-search");
    const isChapterSearch = state.activeTab === "chapters";
    search.setAttribute("aria-label", isChapterSearch
      ? (locale === "zh" ? "搜索章节" : "Search chapters")
      : (locale === "zh" ? "搜索 Maker" : "Search Makers"));
    const input = document.createElement("input");
    input.setAttribute("aria-label", search.getAttribute("aria-label"));
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
    const clear = element("button", "clear-search");
    clear.type = "button";
    clear.title = locale === "zh" ? "清除搜索" : "Clear search";
    clear.setAttribute("aria-label", clear.title);
    clear.hidden = !input.value;
    const clearIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    clearIcon.setAttribute("viewBox", "0 0 24 24");
    clearIcon.setAttribute("aria-hidden", "true");
    const clearPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    clearPath.setAttribute("d", "M6 6l12 12M18 6L6 18");
    clearIcon.appendChild(clearPath);
    clear.appendChild(clearIcon);
    clear.addEventListener("click", () => {
      if (isChapterSearch) state.chapterQuery = "";
      else state.markerQuery = "";
      render();
      focusSearchInput();
    });
    bindSearchInput(input, {
      onInput: (value) => {
        clear.hidden = !value;
        if (state.activeTab === "chapters") state.chapterQuery = value;
        else state.markerQuery = value;
      },
      onCommit: () => {
        render();
        focusSearchInput();
      }
    });
    search.append(input, clear);
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

  function renderSearchEmpty(query) {
    const empty = element("div", "empty-search");
    empty.appendChild(element(
      "p",
      "empty-search-copy",
      locale === "zh" ? `没有匹配“${query}”的结果` : `No results for “${query}”`
    ));
    return empty;
  }

  function renderBody(snapshot, { isLoading = false, existingBody = null } = {}) {
    const canReuseBody = existingBody instanceof HTMLElement
      && existingBody.dataset.activeTab === state.activeTab;
    const body = canReuseBody ? existingBody : element("section", "window-body");
    body.dataset.activeTab = state.activeTab;
    body.classList.toggle("is-mode-transition", state.isChangingMode);
    if (state.activeTab === "settings") {
      const panel = renderSettings(snapshot, body.querySelector(":scope > .settings-panel"));
      if (body.firstElementChild !== panel) body.replaceChildren(panel);
      return body;
    }
    if (state.activeTab === "chapters") {
      const needsConversation = isLoading || snapshot.loading || !snapshot.hasConversation;
      if (needsConversation) chapterReader.suspend();
      const panel = needsConversation
        ? renderNavigation(snapshot, {
            isLoading,
            existingPanel: canReuseBody ? body.querySelector(":scope > .navigation-panel") : null
          })
        : renderChapters(snapshot);
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
    const awaitingConversation = !snapshot.hasConversation
      && (snapshot.supportedRoute || activePlatform(snapshot));
    if (isLoading || snapshot.loading || awaitingConversation) {
      windowMarkerListReconciler.reset();
      markerStreamingIndicator.reset();
      const isReading = Boolean(isLoading || snapshot.loading
        || (snapshot.supportedRoute && isPotentialConversationRoute(snapshot.routeKey)));
      const loading = panel.querySelector(":scope > .conversation-skeleton") || renderConversationSkeleton();
      loading.classList.toggle("is-reading", isReading);
      const copy = isReading
        ? (locale === "zh" ? "正在读取会话…" : "Reading conversation…")
        : (locale === "zh" ? "等待会话…" : "Waiting for a conversation…");
      const status = loading.querySelector(".conversation-skeleton-status");
      if (status.textContent !== copy) status.textContent = copy;
      if (panel.firstElementChild !== loading) panel.replaceChildren(loading);
      return panel;
    }
    if (!snapshot.supportedRoute || !snapshot.hasConversation) {
      windowMarkerListReconciler.reset();
      markerStreamingIndicator.reset();
      const empty = element("div", "empty-state");
      empty.append(element("h1", "empty-title", locale === "zh" ? "打开支持的 AI 对话" : "Open a supported AI conversation"));
      empty.append(element("p", "empty-copy", locale === "zh" ? "Maker 会自动显示在这里。" : "Makers will appear here automatically."));
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
        panel.replaceChildren(renderSearchEmpty(state.markerQuery));
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

  function renderConversationSkeleton() {
    const loading = element("div", "conversation-skeleton");
    const status = element("p", "conversation-skeleton-status");
    status.setAttribute("role", "status");
    const list = element("div", "conversation-skeleton-list");
    list.setAttribute("aria-hidden", "true");
    [58, 57, 56, 54, 51].forEach((width, index) => {
      const row = element("div", "conversation-skeleton-row");
      const copy = element("div", "conversation-skeleton-copy");
      copy.style.width = `${width}%`;
      copy.append(element("span", "conversation-skeleton-line"));
      if (index < 2) copy.append(element("span", "conversation-skeleton-line conversation-skeleton-detail"));
      row.append(element("span", "conversation-skeleton-icon"), copy);
      list.append(row);
    });
    loading.append(status, list);
    return loading;
  }

  function isPotentialConversationRoute(routeKey) {
    if (!routeKey) return false;
    try {
      const path = new URL(routeKey).pathname.replace(/\/+$/, "") || "/";
      return !["/", "/new", "/app", "/chat", "/ai_chat"].includes(path);
    } catch {
      return false;
    }
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
    if (item.type === "fold") button.setAttribute("aria-expanded", String(Boolean(item.isExpanded)));
    const primaryText = item.title || item.preview || "";
    const title = button.querySelector(":scope .maker-title");
    if (item.type !== "user" || !title.textContent) {
      title.textContent = primaryText;
    }
    let remainder = button.querySelector(":scope .maker-remainder");
    if (item.type === "fold") {
      if (!(remainder instanceof HTMLElement)) {
        remainder = element("span", "maker-remainder");
        button.appendChild(remainder);
      }
      remainder.textContent = t("fold.more");
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
    if (item.type === "user" || item.type === "fold") {
      const chevron = element("span", "maker-chevron");
      chevron.setAttribute("aria-hidden", "true");
      if (item.type === "fold") button.prepend(chevron);
      else button.append(chevron);
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
    return chapterReader.update({
      conversationKey: `${state.sourceTabId}:${state.routeKey}`,
      nodes: state.treeChapters,
      preferredKey: snapshot.activeMarkerKey,
      query: state.chapterQuery,
      ready: state.chaptersStatus === "ready" || !snapshot.hasConversation
    });
  }

  function renderSettings(snapshot, existingPanel) {
    if (existingPanel?.dataset.settingsPage === state.settingsPage) {
      if (state.settingsPage === "preferences") syncSettingsPreferences(existingPanel, snapshot);
      return existingPanel;
    }
    const panel = state.settingsPage === "preferences" ? renderSettingsPreferences(snapshot) : element("div", "settings-panel");
    panel.dataset.settingsPage = state.settingsPage;
    if (state.settingsPage === "menu") {
      const menu = element("nav", "settings-section settings-menu settings-home-menu");
      menu.setAttribute("aria-label", t("settings.page.menu"));
      for (const page of settingsDestinations) {
        const row = element("button", "settings-menu-row");
        row.type = "button";
        row.dataset.settingsDestination = page;
        row.dataset.settingsFocus = `page-${page}`;
        row.append(createSettingsMenuIcon(page), element("span", "settings-menu-label", t(`settings.page.${page}`)));
        row.addEventListener("click", () => openSettingsPage(page));
        menu.appendChild(row);
      }
      menu.appendChild(settingsExternalLink(t("settings.privacy"), "https://jeffery-ho.github.io/Polaris-AI-Chat-Navigator/privacy-policy.html", "privacy", createSettingsMenuIcon("privacy")));
      panel.appendChild(menu);
    } else if (state.settingsPage === "help") renderSettingsHelp(panel);
    else if (state.settingsPage === "feedback") renderSettingsFeedback(panel);
    else if (state.settingsPage === "updates") renderSettingsUpdates(panel);
    else if (state.settingsPage === "about") renderSettingsAbout(panel);
    return panel;
  }

  function createSettingsMenuIcon(page) {
    // Preferences and updates use Lucide paths from Iconify; see icons/LICENSE-lucide.txt.
    const paths = {
      preferences: ["M10 5H3m9 14H3M14 3v4m2 10v4m5-9h-9m9 7h-5m5-14h-7m-6 5v4m0-2H3"],
      help: ["M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18", "M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2.5-2.5 4 M12 17h.01"],
      feedback: ["M4 5h16v12H8l-4 3V5Z"],
      updates: ["M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594zM20 2v4m2-2h-4", "M6 20a2 2 0 1 0-4 0a2 2 0 1 0 4 0Z"],
      about: ["M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18", "M12 11v5 M12 8h.01"],
      privacy: ["M12 2 4 5v6c0 5 3.4 8.7 8 11 4.6-2.3 8-6 8-11V5l-8-3Z", "M9 12l2 2 4-4"]
    };
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.classList.add("settings-menu-icon");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    for (const d of paths[page]) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      icon.appendChild(path);
    }
    return icon;
  }

  function renderSettingsPreferences(snapshot) {
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
      input.dataset.configKey = key;
      input.dataset.settingsFocus = key;
      input.setAttribute("aria-label", label);
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
      input.dataset.configKey = configKey;
      input.dataset.settingsFocus = key;
      input.checked = Boolean(config[configKey]?.[platform]);
      input.addEventListener("change", () => send({ command: "update-config", patch: { [configKey]: { [state.snapshot?.platform || "default"]: input.checked } } }));
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
      input.value = String(level);
      input.dataset.headingLevel = String(level);
      input.dataset.settingsFocus = `heading-${level}`;
      input.disabled = input.checked && selectedLevels.length <= 1;
      input.addEventListener("change", () => {
        const nextLevels = [...levels.querySelectorAll("input:checked")].map((control) => Number(control.value));
        if (!nextLevels.length) { input.checked = true; return; }
        levels.querySelectorAll("input").forEach((control) => { control.disabled = control.checked && nextLevels.length === 1; });
        send({ command: "update-config", patch: { enabledLevelsByPlatform: { [state.snapshot?.platform || "default"]: nextLevels } } });
      });
      checkbox.append(input, element("span", "settings-check-label", `H${level}`));
      levels.appendChild(checkbox);
    });
    recognitionSection.appendChild(levels);
    panel.appendChild(recognitionSection);
    const actions = element("div", "settings-footer");
    actions.appendChild(settingsCommandButton(t("settings.preferences.reset"), "reset-config"));
    recognitionSection.appendChild(actions);
    return panel;
  }

  function settingsCommandButton(label, command) {
    const button = element("button", "secondary-button", label);
    button.type = "button";
    button.dataset.settingsFocus = command;
    button.addEventListener("click", () => send({ command }));
    return button;
  }

  function syncSettingsPreferences(panel, snapshot) {
    const config = snapshot.config || {};
    const platform = snapshot.platform || "default";
    panel.querySelectorAll('input[type="range"]').forEach((input) => {
      input.value = String(config[input.dataset.configKey] ?? input.min);
      input.closest("label").querySelector("output").textContent = input.value;
    });
    panel.querySelectorAll('input[type="checkbox"][data-config-key]').forEach((input) => {
      input.checked = Boolean(config[input.dataset.configKey]?.[platform]);
    });
    const selectedLevels = config.enabledLevelsByPlatform?.[platform] || [1, 2, 3];
    panel.querySelectorAll("[data-heading-level]").forEach((input) => {
      input.checked = selectedLevels.includes(Number(input.dataset.headingLevel));
      input.disabled = input.checked && selectedLevels.length === 1;
    });
  }

  function renderSettingsHelp(panel) {
    const section = element("section", "settings-section");
    section.appendChild(element("h2", "settings-section-title", t("settings.help.stepsTitle")));
    const steps = element("ol", "settings-diagnostic-steps");
    for (const [index, imageName] of ["reproduce", "download", "attach", "send"].entries()) {
      const step = element("li", "settings-diagnostic-step");
      step.appendChild(element("p", "settings-step-text", t(`settings.help.step${index + 1}`)));
      const image = element("img", "settings-step-image");
      image.src = chrome.runtime.getURL(`icons/diagnostics-${imageName}.png`);
      image.alt = "";
      image.width = 640;
      image.height = 240;
      step.appendChild(image);
      steps.appendChild(step);
    }
    section.appendChild(steps);
    const actions = element("div", "settings-footer settings-diagnostic-actions");
    const status = element("p", "settings-diagnostic-status");
    status.setAttribute("role", "status");
    async function runDiagnostic(command) {
      try {
        const result = await chrome.runtime.sendMessage({
          type: "POLARIS_WINDOW_COMMAND", command, expectResult: true,
          expectedTabId: state.sourceTabId, expectedRouteKey: state.routeKey
        });
        const successKey = command === "send-diagnostics"
          ? "settings.diagnostics.sendSuccess" : "settings.diagnostics.downloadSuccess";
        status.textContent = result?.diagnosticStatus || t(result?.ok ? successKey : "settings.diagnostics.failure");
      } catch {
        status.textContent = t("settings.diagnostics.failure");
      }
    }
    const sendButton = element("button", "settings-diagnostic-primary", t("settings.help.send"));
    sendButton.type = "button";
    sendButton.dataset.settingsFocus = "send-diagnostics";
    sendButton.addEventListener("click", () => { void runDiagnostic("send-diagnostics"); });
    const downloadButton = element("button", "secondary-button", t("settings.help.download"));
    downloadButton.type = "button";
    downloadButton.dataset.settingsFocus = "download-diagnostics";
    downloadButton.addEventListener("click", () => { void runDiagnostic("download-diagnostics"); });
    actions.append(sendButton, downloadButton);
    section.appendChild(actions);
    section.appendChild(status);
    const fallback = element("p", "settings-diagnostic-fallback", `${t("settings.help.emailFallback")} `);
    const email = element("a", "settings-email", "jefferyho.build@gmail.com");
    email.href = "mailto:jefferyho.build@gmail.com";
    email.dataset.settingsFocus = "diagnostic-email";
    fallback.appendChild(email);
    section.appendChild(fallback);
    panel.appendChild(section);
  }

  function settingsExternalLink(label, href, focusKey, leadingIcon = null) {
    const link = element("a", "settings-menu-row settings-external-link", leadingIcon ? "" : label);
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.dataset.settingsFocus = focusKey;
    const icon = createBackIcon();
    icon.classList.add("settings-external-icon");
    icon.querySelector("path").setAttribute("d", "M15 3h6v6m0-6-9 9M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5");
    if (leadingIcon) link.append(leadingIcon, element("span", "settings-menu-label", label));
    link.appendChild(icon);
    return link;
  }

  function settingsSocialIcon(brand) {
    const icon = element("span", `settings-social-icon settings-social-${brand}`);
    icon.setAttribute("aria-hidden", "true");
    icon.style.setProperty("--settings-social-icon", `url("${chrome.runtime.getURL(`icons/social-${brand}.svg`)}")`);
    return icon;
  }

  function renderSettingsFeedback(panel) {
    const section = element("section", "settings-section settings-menu");
    section.append(
      settingsExternalLink(t("settings.feedback.github"), "https://github.com/Jeffery-Ho/Polaris-AI-Chat-Navigator/issues", "feedback-github"),
      settingsExternalLink(t("settings.feedback.email"), "mailto:jefferyho.build@gmail.com", "feedback-email")
    );
    panel.appendChild(section);
    const links = element("nav", "settings-feedback-icons");
    links.setAttribute("aria-label", t("contact.label"));
    for (const [brand, href] of [
      ["x", "https://x.com/JefferyHo_"],
      ["xiaohongshu", "https://xhslink.com/m/3wXO9kRBrLO"]
    ]) {
      const label = t(`settings.feedback.${brand}`);
      const link = element("a", "settings-feedback-icon-link");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = label;
      link.setAttribute("aria-label", label);
      link.dataset.settingsFocus = `feedback-${brand}`;
      link.appendChild(settingsSocialIcon(brand));
      links.appendChild(link);
    }
    panel.appendChild(links);
  }

  function renderSettingsUpdates(panel) {
    const manifest = chrome.runtime.getManifest();
    for (const note of releaseNotesForUpdate(null, manifest.version, 1)) {
      const localized = note[locale] || note.en;
      const section = element("section", "settings-section settings-update-note");
      section.appendChild(element("h2", "settings-section-title", `${note.version} · ${localized.title}`));
      const changes = element("ul", "settings-update-changes");
      for (const change of localized.changes) changes.appendChild(element("li", "", change));
      section.appendChild(changes);
      panel.appendChild(section);
    }
  }

  function renderSettingsAbout(panel) {
    const identity = element("section", "settings-section settings-about-identity");
    const icon = element("img", "settings-app-icon");
    icon.src = chrome.runtime.getURL("icons/gpt-voyager-icon-96.png");
    icon.alt = "";
    icon.width = 40;
    icon.height = 40;
    const manifest = chrome.runtime.getManifest();
    identity.append(icon, element("h2", "settings-app-name", "Polaris"), element("p", "settings-app-version", manifest.version_name || manifest.version));
    panel.appendChild(identity);
    const credit = element("p", "settings-about-copy");
    const [creditStart, creditEnd] = t("settings.about.developerCredit").split("{heart}");
    const heart = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    heart.classList.add("settings-about-heart");
    heart.setAttribute("viewBox", "0 0 24 24");
    heart.setAttribute("role", "img");
    heart.setAttribute("aria-label", t("settings.about.love"));
    const heartPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    heartPath.setAttribute("d", "M12 21s-7-4.35-9.5-8.5C.38 8.93 2.71 5 6.5 5c2.08 0 4.04 1.08 5.5 2.72C13.46 6.08 15.42 5 17.5 5c3.79 0 6.12 3.93 4 7.5C19 16.65 12 21 12 21Z");
    heart.appendChild(heartPath);
    credit.append(creditStart, heart, creditEnd);
    const story = element("section", "settings-about-story");
    story.append(
      element("h2", "settings-about-heading settings-about-headline", t("settings.about.headline")),
      element("p", "settings-about-copy", t("settings.about.description1")),
      element("h2", "settings-about-heading", t("settings.about.developer")),
      credit,
      element("h2", "settings-about-heading", t("settings.about.thanks")),
      element("p", "settings-about-copy", t("settings.about.thanksCopy")),
      element("p", "settings-about-copy settings-about-thanks-names", "011, Bunny, Kina, Bahar, Kalaso, 大气球")
    );
    panel.appendChild(story);
    const platforms = element("section", "settings-section");
    platforms.appendChild(element("h2", "settings-section-title", t("settings.about.platforms")));
    const list = element("ul", "settings-platforms");
    for (const { label, favicon } of supportedPlatforms) {
      const item = element("li", "settings-platform");
      const image = element("img", "settings-platform-icon");
      image.src = chrome.runtime.getURL(favicon);
      image.alt = "";
      image.width = 20;
      image.height = 20;
      item.append(image, element("span", "", label));
      list.appendChild(item);
    }
    platforms.appendChild(list);
    panel.appendChild(platforms);
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
        state.treeChapters = [];
        state.imageUrls = [];
        state.imageIndex = 0;
        state.chaptersStatus = "idle";
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
      state.chaptersStatus = "ready";
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

  const releaseNotice = createSidepanelReleaseNotice({ document, chrome, locale, t });
  render();
  startThemeObserver();
  startSourceObserver();
  window.setInterval(() => {
    if (state.activeTab === "chapters" && !document.hidden && state.snapshot?.hasConversation) {
      send({ command: "request-chapters", onlyIfChanged: true });
    }
  }, 1500);
  window.addEventListener("scroll", () => {
    if (state.activeTab === "navigation") state.navigationScrollY = window.scrollY;
  }, { passive: true });
  window.addEventListener("keydown", (event) => {
    if (document.querySelector(".release-notice-dialog[open]")) return;
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
      } else if (state.activeTab === "settings") {
        backFromSettings();
      }
    }
    if (!event.metaKey && !event.ctrlKey && !event.altKey && state.imageUrls.length && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      state.imageIndex = (state.imageIndex + (event.key === "ArrowLeft" ? -1 : 1) + state.imageUrls.length) % state.imageUrls.length;
      render();
    }
  });
  void sendReady();
}
