import { matchingPolarisTab, restorePopupWindowUpdate } from "./window-lifecycle.js";
import { snapshotDeliveryResult } from "./snapshot-delivery.js";

const WINDOW_STORAGE_KEY = "polaris-window-id";
const WINDOW_TAB_STORAGE_KEY = "polaris-window-tab-id";
const SOURCE_WINDOW_STORAGE_KEY = "polaris-source-window-id";
const SOURCE_TAB_STORAGE_KEY = "polaris-source-tab-id";
const DEFAULT_WINDOW = {
  type: "popup",
  width: 420,
  height: 760,
  focused: true,
  url: "polaris-home.html"
};

let polarisWindowId = null;
let polarisWindowTabId = null;
let lastNormalWindowId = null;
let currentTabId = null;
let latestSnapshot = null;
const contentInjectionPromises = new Map();

function isSupportedCandidateUrl(url) {
  try {
    const hostname = new URL(url || "").hostname;
    return [
      "chatgpt.com",
      "chat.openai.com",
      "claude.ai",
      "gemini.google.com",
      "grok.com",
      "manus.im",
      "chat.deepseek.com",
      "www.doubao.com",
      "www.kimi.com",
      "kimi.com",
      "www.qianwen.com",
      "qianwen.com",
      "yb.tencent.com",
      "yuanbao.tencent.com",
      "diandian.xiaohongshu.com",
      "www.xiaohongshu.com",
      "www.askdiandian.com",
      "www.diandianlife.top"
    ].some((supported) => hostname === supported || hostname.endsWith(`.${supported}`));
  } catch {
    return false;
  }
}

function isPolarisTab(tab) {
  if (!tab || tab.id === undefined) {
    return false;
  }
  if (tab.id === polarisWindowTabId) {
    return true;
  }
  return tab.url === chrome.runtime.getURL("polaris-home.html");
}

function isNormalSourceTab(tab) {
  return Boolean(tab?.id !== undefined && tab.windowId !== polarisWindowId && !isPolarisTab(tab));
}

async function publishEmptySnapshot(tabId, supportedRoute = false) {
  const stored = await chrome.storage.sync.get("gpt-paragraph-nav-config");
  const config = latestSnapshot?.config || stored["gpt-paragraph-nav-config"] || {};
  try {
    await chrome.runtime.sendMessage({
      type: "POLARIS_WINDOW_STATE",
      tabId,
      snapshot: {
        activeMarkerKey: "",
        config,
        hasConversation: false,
        headings: [],
        loading: Boolean(supportedRoute),
        markerItems: [],
        model: "",
        platform: "default",
        revision: Date.now(),
        releaseNotes: [],
        routeKey: "",
        supportedRoute,
        theme: "light",
        version: ""
      }
    });
  } catch {
    // The Polaris window may not be open while the source tab changes.
  }
}

async function readStoredNumber(key) {
  const result = await chrome.storage.local.get(key);
  const value = Number(result[key]);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

async function writeWindowState(windowId, tabId) {
  polarisWindowId = windowId;
  polarisWindowTabId = tabId;
  await chrome.storage.local.set({
    [WINDOW_STORAGE_KEY]: windowId,
    [WINDOW_TAB_STORAGE_KEY]: tabId
  });
}

async function forgetWindowState() {
  polarisWindowId = null;
  polarisWindowTabId = null;
  await chrome.storage.local.remove([WINDOW_STORAGE_KEY, WINDOW_TAB_STORAGE_KEY]);
}

async function restoreWindowState() {
  if (polarisWindowId === null) {
    polarisWindowId = await readStoredNumber(WINDOW_STORAGE_KEY);
  }
  if (polarisWindowTabId === null) {
    polarisWindowTabId = await readStoredNumber(WINDOW_TAB_STORAGE_KEY);
  }
  if (lastNormalWindowId === null) {
    lastNormalWindowId = await readStoredNumber(SOURCE_WINDOW_STORAGE_KEY);
  }
  if (currentTabId === null) {
    currentTabId = await readStoredNumber(SOURCE_TAB_STORAGE_KEY);
  }
}

async function existingPolarisWindow() {
  await restoreWindowState();
  if (polarisWindowId === null) {
    return null;
  }
  try {
    const existing = await chrome.windows.get(polarisWindowId, { populate: true });
    const windowUrl = chrome.runtime.getURL("polaris-home.html");
    const matchingTab = matchingPolarisTab(existing, windowUrl, polarisWindowTabId);
    if (!matchingTab) {
      await forgetWindowState();
      return null;
    }
    if (matchingTab.id !== polarisWindowTabId) {
      await writeWindowState(existing.id, matchingTab.id);
    }
    return existing;
  } catch {
    await forgetWindowState();
    return null;
  }
}

async function rememberNormalTab(tab) {
  if (!isNormalSourceTab(tab)) {
    return;
  }
  lastNormalWindowId = tab.windowId;
  currentTabId = tab.id ?? null;
  await chrome.storage.local.set({
    [SOURCE_WINDOW_STORAGE_KEY]: lastNormalWindowId,
    [SOURCE_TAB_STORAGE_KEY]: currentTabId
  });
}

async function activeNormalTab() {
  await restoreWindowState();
  if (lastNormalWindowId !== null) {
    const tabs = await chrome.tabs.query({ active: true, windowId: lastNormalWindowId });
    const activeTab = tabs.find(isNormalSourceTab);
    if (activeTab) {
      await rememberNormalTab(activeTab);
      return activeTab;
    }
    if (currentTabId !== null) {
      try {
        const rememberedTab = await chrome.tabs.get(currentTabId);
        if (rememberedTab.windowId === lastNormalWindowId && isNormalSourceTab(rememberedTab)) {
          await rememberNormalTab(rememberedTab);
          return rememberedTab;
        }
      } catch {
        // The remembered source tab may have been closed.
      }
    }
    const windowTabs = await chrome.tabs.query({ windowId: lastNormalWindowId });
    const fallbackTab = windowTabs.find((tab) => isNormalSourceTab(tab) && isSupportedCandidateUrl(tab.url))
      || windowTabs.find(isNormalSourceTab);
    if (fallbackTab) {
      await rememberNormalTab(fallbackTab);
      return fallbackTab;
    }
  }

  const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const activeTab = activeTabs.find(isNormalSourceTab);
  if (activeTab) {
    await rememberNormalTab(activeTab);
    return activeTab;
  }
  const focusedTabs = await chrome.tabs.query({ lastFocusedWindow: true });
  const tab = focusedTabs.find((candidate) => isNormalSourceTab(candidate) && isSupportedCandidateUrl(candidate.url))
    || focusedTabs.find(isNormalSourceTab)
    || null;
  await rememberNormalTab(tab);
  return tab;
}

async function requestContentState(tab, { publishEmpty = true } = {}) {
  const targetTab = tab || await activeNormalTab();
  if (!isNormalSourceTab(targetTab)) {
    if (publishEmpty) {
      await publishEmptySnapshot(null);
    }
    return;
  }
  currentTabId = targetTab.id;
  if (publishEmpty) {
    await publishEmptySnapshot(targetTab.id, isSupportedCandidateUrl(targetTab.url));
  }
  if (!isSupportedCandidateUrl(targetTab.url)) {
    return;
  }
  try {
    await sendContentMessage(targetTab.id, { type: "POLARIS_WINDOW_REQUEST_STATE" }, { injectIfMissing: true });
  } catch {
    // The content script may not be ready on a newly activated page.
  }
}

function uniqueExtensionFiles(files) {
  const seen = new Set();
  const unique = [];
  for (const file of files) {
    if (typeof file !== "string" || !file || seen.has(file)) {
      continue;
    }
    seen.add(file);
    unique.push(file);
  }
  return unique;
}

function packagedContentScriptFiles() {
  try {
    const entries = chrome.runtime.getManifest?.()?.content_scripts;
    if (!Array.isArray(entries)) {
      return null;
    }
    const css = uniqueExtensionFiles(entries.flatMap((entry) => entry?.css || []));
    const js = uniqueExtensionFiles(entries.flatMap((entry) => entry?.js || []));
    if (js.length === 0) {
      return null;
    }
    return { css, js };
  } catch (error) {
    console.warn("[Polaris] Could not read content script paths from the extension manifest.", error);
    return null;
  }
}

async function injectContentScript(tabId) {
  if (typeof chrome.scripting?.executeScript !== "function") {
    console.warn("[Polaris] chrome.scripting.executeScript is unavailable; content script injection was skipped.", tabId);
    return false;
  }
  const existing = contentInjectionPromises.get(tabId);
  if (existing) {
    return existing;
  }
  const injection = (async () => {
    // Built manifest order, including hashed filenames, is the injection list.
    const files = packagedContentScriptFiles();
    if (!files) {
      console.warn("[Polaris] Extension manifest has no content script files to inject.", tabId);
      return false;
    }
    try {
      if (files.css.length > 0 && typeof chrome.scripting.insertCSS === "function") {
        try {
          await chrome.scripting.insertCSS({
            files: files.css,
            target: { tabId }
          });
        } catch (error) {
          console.warn("[Polaris] Content stylesheet injection failed.", { tabId, css: files.css, error });
        }
      }
      await chrome.scripting.executeScript({
        files: files.js,
        target: { allFrames: false, tabId }
      });
      return true;
    } catch (error) {
      console.warn("[Polaris] Content script injection failed.", { tabId, js: files.js, error });
      return false;
    }
  })().finally(() => {
    contentInjectionPromises.delete(tabId);
  });
  contentInjectionPromises.set(tabId, injection);
  return injection;
}

async function sendContentMessage(tabId, message, { injectIfMissing = false } = {}) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, message);
    return message.expectResult ? response : true;
  } catch {
    if (!injectIfMissing || !(await injectContentScript(tabId))) {
      return false;
    }
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return message.expectResult ? response : true;
    } catch {
      // The injected content script may still be finishing its startup.
    }
  }
  console.warn("[Polaris] Content script did not respond after injection.", tabId);
  return false;
}

async function forwardCommand(message) {
  const tab = await activeNormalTab();
  if (!tab?.id) {
    return;
  }
  if (message.expectResult && message.expectedTabId !== tab.id) return { ok: false };
  currentTabId = tab.id;
  let result;
  try {
    result = await sendContentMessage(tab.id, message, {
      injectIfMissing: isSupportedCandidateUrl(tab.url)
    });
  } catch {
    // Unsupported pages and pages that are still loading have no receiver.
    if (message.expectResult) return { ok: false };
  }
  if (message.expectResult && !result?.ok) return { ok: false };
  if (message.command === "jump-to-marker" || message.command === "jump-to-chapter") {
    try {
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch {
      // The tab may have closed between the send and the focus request.
    }
  }
  return { ok: true };
}

async function isCurrentSourceTab(tab) {
  if (!tab?.id || tab.windowId === polarisWindowId) {
    return false;
  }
  if (tab.id === currentTabId) {
    return true;
  }
  const activeTabs = await chrome.tabs.query({ active: true, windowId: tab.windowId });
  if (activeTabs[0]?.id !== tab.id) {
    return false;
  }
  await rememberNormalTab(tab);
  return true;
}

async function persistWindowConfigCommand(message) {
  if (message.command === "reset-config") {
    await chrome.storage.sync.remove("gpt-paragraph-nav-config");
    return;
  }
  if (message.command !== "update-config" || !message.patch || typeof message.patch !== "object") {
    return;
  }
  const key = "gpt-paragraph-nav-config";
  const stored = await chrome.storage.sync.get(key);
  const current = stored[key] && typeof stored[key] === "object" ? stored[key] : {};
  const patch = { ...message.patch };
  ["enabledLevelsByPlatform", "enabledOrderedListByPlatform", "enabledStrongByPlatform", "enabledUnorderedListByPlatform"].forEach((nestedKey) => {
    if (patch[nestedKey] && typeof patch[nestedKey] === "object") {
      patch[nestedKey] = { ...(current[nestedKey] || {}), ...patch[nestedKey] };
    }
  });
  await chrome.storage.sync.set({ [key]: { ...current, ...patch } });
}

async function openOrFocusWindow(tab) {
  await rememberNormalTab(tab);
  const sourceWindowId = tab?.windowId ?? lastNormalWindowId;
  const sourceTabId = tab?.id ?? currentTabId;
  const existing = await existingPolarisWindow();
  if (existing?.id !== undefined) {
    let restored = false;
    try {
      await chrome.windows.update(existing.id, restorePopupWindowUpdate());
      restored = true;
    } catch {
      await forgetWindowState();
    }
    if (restored) {
      try {
        await requestContentState();
      } catch {
        // A transient source-tab failure must not create a duplicate popup.
      }
      return;
    }
  }

  const created = await chrome.windows.create({
    ...DEFAULT_WINDOW,
    url: chrome.runtime.getURL("polaris-home.html")
  });
  const windowTab = created?.tabs?.[0];
  if (created?.id !== undefined && windowTab?.id !== undefined) {
    await writeWindowState(created.id, windowTab.id);
  }
  // Creating and focusing the popup emits an activation event before the
  // window IDs above are known. Restore the tab that triggered the action so
  // the ready handshake cannot accidentally target the popup itself.
  if (sourceWindowId !== null && sourceWindowId !== undefined) {
    lastNormalWindowId = sourceWindowId;
    currentTabId = sourceTabId ?? null;
    await chrome.storage.local.set({
      [SOURCE_WINDOW_STORAGE_KEY]: lastNormalWindowId,
      [SOURCE_TAB_STORAGE_KEY]: currentTabId
    });
  }
  await requestContentState(tab);
}

async function rememberWindowReadyState(message, sender) {
  if (message.windowType === "sidepanel") {
    polarisWindowId = null;
    polarisWindowTabId = null;
    await chrome.storage.local.remove([WINDOW_STORAGE_KEY, WINDOW_TAB_STORAGE_KEY]);
    return;
  }
  const readyWindowId = Number.isInteger(message.windowId) ? message.windowId : sender.tab?.windowId;
  const readyTabId = Number.isInteger(message.windowTabId) ? message.windowTabId : sender.tab?.id;
  if (readyWindowId === undefined || readyTabId === undefined) {
    return;
  }
  const isPopup = message.windowType === undefined || message.windowType === "popup";
  if (isPopup) {
    polarisWindowId = readyWindowId;
    polarisWindowTabId = readyTabId;
    await chrome.storage.local.set({
      [WINDOW_STORAGE_KEY]: polarisWindowId,
      [WINDOW_TAB_STORAGE_KEY]: polarisWindowTabId
    });
    return;
  }
  polarisWindowId = null;
  polarisWindowTabId = readyTabId;
  await chrome.storage.local.remove(WINDOW_STORAGE_KEY);
  await chrome.storage.local.set({ [WINDOW_TAB_STORAGE_KEY]: polarisWindowTabId });
}

function replyToSnapshotDelivery(sendResponse, payload) {
  if (typeof sendResponse !== "function") {
    return;
  }
  try {
    sendResponse(payload);
  } catch {
    // The content script already stopped waiting for this delivery report.
  }
}

async function forwardContentSnapshot(message, sender, sendResponse) {
  try {
    const isCurrent = await isCurrentSourceTab(sender.tab);
    if (!isCurrent) {
      const markerCount = message.snapshot?.markerItems?.length || 0;
      const headingCount = message.snapshot?.headings?.length || 0;
      if (markerCount > 0 || headingCount > 0 || message.snapshot?.hasConversation) {
        console.warn("[Polaris] Page sections were not forwarded to the side panel because this tab is not the current source tab.", {
          tabId: sender.tab?.id ?? null,
          currentTabId,
          polarisWindowId,
          markerCount,
          headingCount
        });
      }
      replyToSnapshotDelivery(sendResponse, snapshotDeliveryResult({ isCurrentSource: false }));
      return;
    }
    latestSnapshot = message.snapshot;
    try {
      const pending = chrome.runtime.sendMessage({
        type: "POLARIS_WINDOW_STATE",
        tabId: sender.tab?.id ?? null,
        snapshot: message.snapshot,
        expectAck: Boolean(message.reportDelivery)
      });
      const ack = pending && typeof pending.then === "function" ? await pending : null;
      replyToSnapshotDelivery(sendResponse, snapshotDeliveryResult({ isCurrentSource: true, ack }));
    } catch (error) {
      replyToSnapshotDelivery(sendResponse, snapshotDeliveryResult({
        isCurrentSource: true,
        errorMessage: error?.message || String(error)
      }));
    }
  } catch (error) {
    console.warn("[Polaris] Failed while forwarding page sections to the side panel.", error);
    replyToSnapshotDelivery(sendResponse, snapshotDeliveryResult({
      isCurrentSource: true,
      errorMessage: "forward-failed"
    }));
  }
}

function configureAction() {
  if (typeof chrome.sidePanel?.setPanelBehavior === "function") {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
      chrome.action.onClicked.addListener((tab) => {
        void openOrFocusWindow(tab);
      });
    });
    return;
  }
  chrome.action.onClicked.addListener((tab) => {
    void openOrFocusWindow(tab);
  });
}

configureAction();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return;
  }

  if (message.type === "POLARIS_WINDOW_READY") {
    void rememberWindowReadyState(message, sender)
      .then(() => requestContentState())
      .catch(() => {});
    return;
  }

  if (message.type === "POLARIS_WINDOW_COMMAND") {
    if (message.command === "refresh-state") {
      void requestContentState(undefined, { publishEmpty: false });
      return;
    }
    if (message.command === "update-config" || message.command === "reset-config") {
      void persistWindowConfigCommand(message).catch(() => {});
    }
    if (message.expectResult) {
      void forwardCommand(message).then((result) => sendResponse(result || { ok: false })).catch(() => sendResponse({ ok: false }));
      return true;
    }
    void forwardCommand(message);
    return;
  }

  if (message.type === "POLARIS_CONTENT_STATE") {
    const reportDelivery = message.reportDelivery === true;
    void forwardContentSnapshot(message, sender, reportDelivery ? sendResponse : null);
    return reportDelivery ? true : undefined;
  }

  if (message.type === "POLARIS_WINDOW_CHAPTERS") {
    void isCurrentSourceTab(sender.tab).then((isCurrent) => {
      if (!isCurrent) return;
      return chrome.runtime.sendMessage({
        type: "POLARIS_WINDOW_CHAPTERS",
        chapters: message.chapters,
        treeChapters: message.treeChapters,
        tabId: sender.tab?.id ?? null,
        routeKey: message.routeKey
      });
    }).catch(() => {});
    return;
  }

  if (message.type === "POLARIS_WINDOW_IMAGE") {
    void isCurrentSourceTab(sender.tab).then((isCurrent) => {
      if (!isCurrent) return;
      return chrome.runtime.sendMessage({
        type: "POLARIS_WINDOW_IMAGE",
        imageUrls: message.imageUrls
      });
    }).catch(() => {});
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  if (activeInfo.windowId === polarisWindowId) {
    return;
  }
  void chrome.tabs.get(activeInfo.tabId).then((tab) => {
    void rememberNormalTab(tab);
    void requestContentState(tab);
  }).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.windowId === polarisWindowId || tabId !== currentTabId && !tab.active) {
    return;
  }
  if (changeInfo.url || changeInfo.status === "loading" || changeInfo.status === "complete") {
    void rememberNormalTab(tab);
    void requestContentState(tab);
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === polarisWindowId || windowId === chrome.windows.WINDOW_ID_NONE) {
    return;
  }
  lastNormalWindowId = windowId;
  void requestContentState();
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === polarisWindowId) {
    void forgetWindowState();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === polarisWindowTabId) {
    void forgetWindowState();
  }
  if (tabId === currentTabId) {
    currentTabId = null;
    latestSnapshot = null;
    void publishEmptySnapshot(null);
    void chrome.storage.local.remove(SOURCE_TAB_STORAGE_KEY);
  }
});
