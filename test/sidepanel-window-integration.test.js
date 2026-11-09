import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

async function boot(windowType = "sidepanel", { locale = "zh", transitionApi = false, openChapters = true, deliverChapters = true, stallAnimationFrames = false, reducedMotion = false, onboardingSeen = true } = {}) {
  const dom = new JSDOM(`<html data-window-type="${windowType}"><body><div id="polaris-window"></div></body></html>`, { url: "https://extension.test/sidepanel.html", runScripts: "outside-only", pretendToBeVisual: true });
  const win = dom.window;
  win.matchMedia = (query) => ({ matches: reducedMotion && query === "(prefers-reduced-motion: reduce)", addEventListener() {} });
  let scrollY = 0;
  Object.defineProperty(win, "scrollY", { get: () => scrollY });
  const scrollRequests = [];
  win.scrollTo = (options) => { scrollRequests.push(options); scrollY = options.top || 0; };
  const resizeObservers = [];
  win.ResizeObserver = class {
    constructor(callback) { this.callback = callback; resizeObservers.push(this); }
    observe(target) { this.target = target; }
    unobserve() {}
    disconnect() {}
  };
  win.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  win.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new win.Event("close")); };
  if (stallAnimationFrames) win.requestAnimationFrame = () => 1;
  win.setInterval = () => 0;
  Object.defineProperty(win.navigator, "language", { value: locale === "zh" ? "zh-CN" : "en" });
  win.eval((await readFile(new URL("../src/i18n.js", import.meta.url), "utf8")).replace("export function createI18n", "function createI18n"));
  const listeners = []; const commands = [];
  const local = { "polaris-release-notice-version": "0.66.0", ...(onboardingSeen ? { "polaris-onboarding-version": 1 } : {}) };
  const writes = [];
  win.chrome = { storage: { local: { get: async () => ({ ...local }), set: async (values) => { writes.push(values); Object.assign(local, values); } } } };
  const transitions = [];
  if (transitionApi) win.document.startViewTransition = (update) => {
    const updateCallbackDone = Promise.resolve().then(update);
    const transition = { updateCallbackDone, finished: updateCallbackDone, skipTransition() {} };
    transitions.push(transition);
    return transition;
  };
  win.chrome = { ...win.chrome, runtime: { getURL: (path) => `https://extension.test/${path}`, onMessage: { addListener(listener) { listeners.push(listener); } }, sendMessage: async (message) => { commands.push(JSON.parse(JSON.stringify(message))); return { ok: true }; }, getManifest: () => ({ version: "0.66.0" }) } };
  let source = await readFile(new URL("../src/window.js", import.meta.url), "utf8");
  for (const match of source.matchAll(/import\s+\{([^}]+)\}\s+from\s+"([^"]+)";/g)) {
    const exports = await import(new URL(`../src/${match[2].replace(/^\.\//, "")}`, import.meta.url));
    for (const name of match[1].split(",").map((name) => name.trim()).filter(Boolean)) {
      if (name !== "createI18n") win[name] = exports[name];
    }
  }
  source = source.replace(/import\s+\{[^}]+\}\s+from\s+"[^"]+";/g, "").replace(/import\s+"[^"]+";/g, "").replace(/^export function /m, "function ");
  win.eval(`${source}\ninitializeSidepanel();`);
  const send = (message) => listeners.forEach((listener) => listener(message, {}));
  const snapshot = { hasConversation: true, supportedRoute: true, routeKey: "https://chatgpt.com/c/one", platform: "chatgpt", config: {}, headings: [], markerItems: [{ key: "ai-second", type: "ai", markerKey: "second", title: "second", preview: "second" }], activeMarkerKey: "second" };
  const chapters = ["first", "second"].map((key) => ({ markerKey: key, sourceKey: key, title: key, parentKey: "", contents: [{ type: "block", text: `${key} body`, html: `<p>${key} body</p>` }], blocks: [{ tagName: "p", text: `${key} body` }] }));
  send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot });
  if (openChapters) [...win.document.querySelectorAll(".window-tab")].find((button) => button.textContent === (locale === "zh" ? "大纲" : "Outline")).click();
  if (deliverChapters) send({ type: "POLARIS_WINDOW_CHAPTERS", tabId: 7, routeKey: snapshot.routeKey, treeChapters: chapters, chapters });
  return { dom, win, send, commands, snapshot, chapters, transitions, scrollRequests, writes, resizeObservers };
}

test("更新提示仅在未打开会话的空页出现，关闭后切换页面也不再显示", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    await new Promise(resolve => setTimeout(resolve, 0));
    const { document } = s.win;
    const emptySnapshot = { hasConversation: false, supportedRoute: false, routeKey: "https://example.com", platform: "", markerItems: [], config: {} };
    const showEmpty = () => s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: emptySnapshot });
    assert.equal(document.querySelector(".release-notice-tip"), null);
    showEmpty();
    assert.equal(document.querySelector(".empty-state > .release-notice-tip").hidden, false);
    document.querySelector(".window-settings-button").click();
    assert.equal(document.querySelector(".release-notice-tip"), null);
    document.querySelector(".window-settings-back").click();
    assert.equal(document.querySelector(".release-notice-tip").hidden, false);
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, markerItems: [] } });
    assert.equal(document.querySelector(".release-notice-tip"), null, "a conversation without Makers is not the start page");
    showEmpty();
    document.querySelector(".release-notice-tip-close").click();
    assert.equal(document.querySelector(".release-notice-tip").hidden, true);
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: s.snapshot });
    showEmpty();
    assert.equal(document.querySelector(".release-notice-tip").hidden, true);
    assert.ok(s.writes.some(values => values["polaris-release-tip-dismissed"] === true));
  } finally { s.dom.window.close(); }
});

test("DOM indexes virtualize file labels and user thumbnails without claiming complete history", async () => {
  const s = await boot("sidepanel", { locale: "en", openChapters: false, deliverChapters: false });
  try {
    const snapshot = { ...s.snapshot, platform: "kimi", routeKey: "https://www.kimi.com/chat/one",
      conversationIndex: { source: "dom", coverage: "loaded", generation: "run", revision: 1, phase: "complete", count: 2, native: { phase: "ready" } },
      markerItems: [{ key: "user:index:u1", groupKey: "index:u1", type: "user", title: "Prompt", isExpanded: true, thumbnailSrc: "https://cdn.test/upload.png", imageCount: 1, attachments: [{ name: "history.md", mimeType: "MD" }] }]
    };
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.match(s.win.document.querySelector(".maker-attachments").textContent, /history.md/);
    assert.equal(s.win.document.querySelector(".maker-thumb").src, "https://cdn.test/upload.png");
    assert.match(s.win.document.querySelector(".index-list-status").textContent, /loaded messages indexed/);
    assert.doesNotMatch(s.win.document.querySelector(".index-list-status").textContent, /All .*messages/);
    assert.equal(s.win.document.querySelector(".window-search input").placeholder, "Search Makers");
    s.win.document.querySelector(".maker-thumb").click();
    assert.equal(s.commands.findLast((command) => command.command === "request-image-preview").groupKey, "index:u1");
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...snapshot, markerItems: [{ ...snapshot.markerItems[0], imageCount: 2 }] } });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.match(s.win.document.querySelector(".maker-copy").textContent, /2 images/);
  } finally { s.dom.window.close(); }
});

test("Claude attachment tags independently locate their native cards and update when files arrive", async () => {
  const s = await boot("sidepanel", { locale: "en", openChapters: false, deliverChapters: false });
  try {
    const snapshot = { ...s.snapshot, platform: "claude", routeKey: "https://claude.ai/chat/one",
      conversationIndex: { source: "dom", coverage: "loaded", generation: "run", revision: 1, phase: "complete", count: 1 },
      markerItems: [{ key: "index:u", markerKey: "index:u", groupKey: "index:u", type: "user", title: "Prompt", isExpanded: true, attachments: [] }] };
    const publish = async () => {
      s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...snapshot, markerItems: snapshot.markerItems.map((item) => ({ ...item })) } });
      await new Promise((resolve) => setTimeout(resolve, 30));
    };
    await publish();
    snapshot.markerItems[0].attachments = [0, 1].map((i) => ({ name: "history.md", attachmentKey: `u:attachment:${i}` }));
    await publish();
    const tags = [...s.win.document.querySelectorAll("button.maker-attachment")];
    assert.equal(tags.length, 2);
    for (const [i, tag] of tags.entries()) {
      assert.equal(tag.parentElement.closest("button"), null, "附件按钮不能嵌在另一个按钮中");
      tag.click();
      assert.equal(s.commands.at(-1).command, "jump-to-marker");
      assert.equal(s.commands.at(-1).markerKey, `index:u:attachment:${i}`);
      assert.equal(s.commands.at(-1).expectedRouteKey, snapshot.routeKey);
    }
    assert.equal(s.commands.some((command) => command.command === "toggle-user-group"), false);
    s.win.document.querySelector(".maker-user-toggle").click();
    assert.equal(s.commands.at(-1).command, "toggle-user-group");
  } finally { s.dom.window.close(); }
});

test("TOC virtualizes all 10,000 image labels without previews or download commands and keeps source navigation", async () => {
  const s = await boot("sidepanel", { locale: "en", openChapters: false, deliverChapters: false });
  try {
    let downloads = 0; s.win.fetch = () => { downloads++; throw new Error("Images must not download"); };
    const markerItems = Array.from({ length: 10000 }, (_, i) => ({ key: `index:picture-${i}:image:0`, markerKey: `index:picture-${i}:image:0`, type: "ai", title: "[Image]",
      image: { imageKey: `picture-${i}:image:0`, src: "sediment://file_one", alt: "Image description", width: 2048, height: 1024 } }));
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, markerItems,
      conversationIndex: { generation: "run", revision: 1, phase: "complete", count: 10000, native: { phase: "ready" } } } });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const rows = s.win.document.querySelectorAll('.maker-card-ai'); assert.ok(rows.length > 0 && rows.length < 100);
    assert.ok([...rows].every((row) => row.textContent === "Image"));
    assert.equal(s.win.document.querySelector('.navigation-panel img'), null);
    assert.equal(s.commands.some((command) => command.command === "resolve-index-image"), false);
    assert.equal(downloads, 0);
    rows[0].click(); await new Promise((resolve) => setTimeout(resolve, 0));
    const jump = s.commands.findLast((command) => command.command === "jump-to-marker"); assert.equal(jump.markerKey, markerItems[0].markerKey);
    assert.equal(s.win.document.querySelector('.window-body').dataset.activeTab, "navigation");
    s.win.document.querySelector('.window-settings-button').click();
    s.win.document.querySelector('[data-settings-destination="preferences"]').click();
    assert.equal(s.win.document.querySelector('[data-image-setting]'), null);
  } finally { s.dom.window.close(); }
});

test("scroll controls stay hidden until a conversation is read and return when it is ready", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const root = s.win.document.getElementById("polaris-window");
    const controls = s.win.document.querySelector(".window-scroll-controls");
    assert.equal(controls.hidden, false);
    for (const unavailable of [
      { hasConversation: false, supportedRoute: false, platform: "", routeKey: "https://example.com", markerItems: [] },
      { hasConversation: false, routeKey: "https://chatgpt.com/", markerItems: [] },
      { loading: true },
      { conversationLoading: true },
      { conversationStalled: true }
    ]) {
      s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, ...unavailable } });
      assert.equal(controls.hidden, true, JSON.stringify(unavailable));
      assert.equal(root.classList.contains("has-scroll-controls"), false);
      s.win.dispatchEvent(new s.win.Event("scroll"));
      s.win.dispatchEvent(new s.win.Event("resize"));
      assert.equal(controls.hidden, true, "scrolling and resizing cannot reveal the hidden group");
      s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: s.snapshot });
      assert.equal(controls.hidden, false);
      assert.equal(root.classList.contains("has-scroll-controls"), true);
      assert.equal(s.win.document.querySelectorAll(".window-scroll-controls").length, 1);
    }
  } finally { s.dom.window.close(); }
});

test("scroll controls require TOC or Outline rows and hide on all settings pages", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const { document } = s.win;
    const controls = document.querySelector(".window-scroll-controls");
    const sendItems = (markerItems, extra = {}) => s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7,
      snapshot: { ...s.snapshot, markerItems, ...extra } });
    assert.equal(controls.hidden, false);
    sendItems([]);
    assert.equal(controls.hidden, true, "an empty TOC has no scroll controls");
    sendItems([{ key: "empty", type: "empty", message: "No Makers" }]);
    assert.equal(controls.hidden, true, "a placeholder is not a TOC row");
    const index = { generation: "scroll-test", revision: 1, phase: "complete", count: 1 };
    sendItems([], { conversationIndex: index });
    assert.ok(document.querySelector(".maker-list"));
    assert.equal(controls.hidden, true, "an empty virtual list does not reveal the group");
    sendItems(s.snapshot.markerItems, { conversationIndex: index });
    assert.equal(controls.hidden, false);
    sendItems(s.snapshot.markerItems);
    document.querySelector(".window-settings-button").click();
    assert.equal(controls.hidden, true);
    for (const page of ["preferences", "help", "feedback", "updates", "about"]) {
      document.querySelector(`[data-settings-destination="${page}"]`).click();
      assert.equal(controls.hidden, true, page);
      document.querySelector(".window-settings-back").click();
      assert.equal(controls.hidden, true, "the settings menu also hides the group");
    }
    document.querySelector(".window-settings-back").click();
    assert.equal(controls.hidden, false);
    s.send({ type: "POLARIS_WINDOW_CHAPTERS", tabId: 7, routeKey: s.snapshot.routeKey, treeChapters: s.chapters });
    document.querySelector('[data-window-tab="chapters"]').click();
    assert.equal(controls.hidden, false, "Outline rows show the group");
    s.send({ type: "POLARIS_WINDOW_CHAPTERS", tabId: 7, routeKey: s.snapshot.routeKey, treeChapters: [] });
    assert.equal(controls.hidden, true, "an empty Outline hides the group");
    s.send({ type: "POLARIS_WINDOW_CHAPTERS", tabId: 7, routeKey: s.snapshot.routeKey, treeChapters: s.chapters });
    assert.equal(controls.hidden, false);
    const search = document.querySelector(".window-search input");
    search.value = "no-matching-chapter";
    search.dispatchEvent(new s.win.Event("input", { bubbles: true }));
    assert.equal(controls.hidden, true, "no matching Outline rows hides the group");
    document.querySelector(".chapter-tree-reader .empty-search button").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(controls.hidden, false, "clearing search inside the reader restores the group");
  } finally { s.dom.window.close(); }
});

test("floating scroll controls disable at each edge and jump within the sidepanel", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const { document } = s.win;
    Object.defineProperty(document.documentElement, "scrollHeight", { value: 1600 });
    Object.defineProperty(document.documentElement, "clientHeight", { value: 600 });
    s.win.dispatchEvent(new s.win.Event("resize"));
    const top = document.querySelector('[aria-label="回到顶部"]');
    const bottom = document.querySelector('[aria-label="回到底部"]');
    assert.equal(top.disabled, true);
    assert.equal(bottom.disabled, false);
    const requests = s.scrollRequests.length;
    top.click();
    assert.equal(s.scrollRequests.length, requests, "disabled buttons do not scroll");
    bottom.click();
    assert.deepEqual({ ...s.scrollRequests.at(-1) }, { top: 1000, behavior: "smooth" });
    s.win.dispatchEvent(new s.win.Event("scroll"));
    assert.equal(top.disabled, false);
    assert.equal(bottom.disabled, true);
    top.click();
    assert.deepEqual({ ...s.scrollRequests.at(-1) }, { top: 0, behavior: "smooth" });
    s.win.dispatchEvent(new s.win.Event("scroll"));
    assert.equal(top.disabled, true);
    assert.equal(bottom.disabled, false);
    s.win.scrollTo({ top: 500 });
    s.win.dispatchEvent(new s.win.Event("scroll"));
    assert.equal(top.disabled, false);
    assert.equal(bottom.disabled, false);
    s.win.scrollTo({ top: 999.5 });
    s.win.dispatchEvent(new s.win.Event("scroll"));
    assert.equal(bottom.disabled, true, "fractional scroll positions count as reaching the edge");
    assert.equal(s.commands.some(({ command }) => command?.startsWith("jump-")), false);
  } finally { s.dom.window.close(); }
});

test("scroll controls refresh after content and viewport changes without being replaced", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const { document } = s.win;
    let height = 600;
    Object.defineProperty(document.documentElement, "scrollHeight", { get: () => height });
    Object.defineProperty(document.documentElement, "clientHeight", { value: 600, configurable: true });
    s.win.dispatchEvent(new s.win.Event("resize"));
    const controls = document.querySelector(".window-scroll-controls");
    const top = controls.querySelector('[data-scroll-edge="top"]');
    const bottom = controls.querySelector('[data-scroll-edge="bottom"]');
    assert.equal(top.disabled, true);
    assert.equal(bottom.disabled, true, "a short page has no scroll targets");
    const observer = s.resizeObservers.find(({ target }) => target.id === "polaris-window");
    assert.ok(observer);
    height = 1200;
    observer.callback();
    assert.equal(bottom.disabled, false, "new content enables scrolling down");
    s.win.scrollTo({ top: 600 });
    s.win.dispatchEvent(new s.win.Event("scroll"));
    assert.equal(bottom.disabled, true);
    height = 1400;
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, theme: "dark" } });
    assert.equal(document.querySelector(".window-scroll-controls"), controls);
    assert.equal(bottom.disabled, false, "rendered content recalculates the edge");
    Object.defineProperty(document.documentElement, "clientHeight", { value: 800 });
    s.win.dispatchEvent(new s.win.Event("resize"));
    assert.equal(bottom.disabled, true, "a taller viewport reaches the new bottom");
    document.querySelector(".window-settings-button").click();
    assert.equal(document.querySelectorAll(".window-scroll-controls").length, 1);
  } finally { s.dom.window.close(); }
});

test("scroll controls use English labels and respect reduced motion", async () => {
  const s = await boot("sidepanel", { locale: "en", openChapters: false, reducedMotion: true });
  try {
    Object.defineProperty(s.win.document.documentElement, "scrollHeight", { value: 1600 });
    Object.defineProperty(s.win.document.documentElement, "clientHeight", { value: 600 });
    s.win.dispatchEvent(new s.win.Event("resize"));
    const top = s.win.document.querySelector('[aria-label="Back to top"]');
    const bottom = s.win.document.querySelector('[aria-label="Back to bottom"]');
    assert.equal(top.title, "Back to top");
    bottom.click();
    assert.deepEqual({ ...s.scrollRequests.at(-1) }, { top: 1000, behavior: "instant" });
  } finally { s.dom.window.close(); }
});

test("current Maker control scrolls and focuses the active row without navigating the source or toggling groups", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const { document } = s.win;
    const current = document.querySelector('[aria-label="定位当前 Maker"]');
    const row = document.querySelector('.maker-card.is-active');
    document.querySelector('.window-header').getBoundingClientRect = () => ({ bottom: 80 });
    row.getBoundingClientRect = () => ({ top: 720 });
    s.win.scrollTo({ top: 300 });
    const commandCount = s.commands.length;
    assert.equal(current.disabled, false);
    assert.equal(current.title, "定位当前 Maker");
    current.click();
    assert.deepEqual({ ...s.scrollRequests.at(-1) }, { top: 928, behavior: "smooth" });
    assert.equal(document.activeElement, row);
    assert.equal(s.commands.length, commandCount);
    document.querySelector('[data-window-tab="chapters"]').click();
    assert.equal(current.hidden, true, "Outline retains its existing edge controls");
    document.querySelector('[data-window-tab="navigation"]').click();
    assert.equal(current.hidden, false);
  } finally { s.dom.window.close(); }
});

test("current Maker control follows the latest active key and disables when no matching row exists", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const current = s.win.document.querySelector('[data-scroll-action="current"]');
    for (const activeMarkerKey of ["", "removed-marker"]) {
      s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, activeMarkerKey } });
      assert.equal(current.disabled, true);
      const requests = s.scrollRequests.length;
      current.click();
      assert.equal(s.scrollRequests.length, requests);
    }
    const markerItems = [...s.snapshot.markerItems, { key: "third-row", type: "ai", markerKey: "third", title: "third" }];
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, markerItems, activeMarkerKey: "third" } });
    assert.equal(current.disabled, false);
    current.click();
    assert.equal(s.win.document.activeElement.dataset.markerKey, "third");
  } finally { s.dom.window.close(); }
});

test("current Maker control uses an English label and instant movement with reduced motion", async () => {
  const s = await boot("sidepanel", { locale: "en", openChapters: false, reducedMotion: true });
  try {
    const current = s.win.document.querySelector('[aria-label="Locate current Maker"]');
    assert.equal(current.title, "Locate current Maker");
    current.click();
    assert.equal(s.scrollRequests.at(-1).behavior, "instant");
  } finally { s.dom.window.close(); }
});

test("current Maker control clears search and mounts an off-screen row in a 10,000-row TOC", async () => {
  const s = await boot("sidepanel", { openChapters: false, deliverChapters: false });
  try {
    const { document } = s.win;
    const markerItems = Array.from({ length: 10000 }, (_, i) => ({ key: `index:maker-${i}`, markerKey: `index:maker-${i}`, type: "ai", title: `Maker ${i}` }));
    const activeMarkerKey = markerItems[9500].markerKey;
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, markerItems, activeMarkerKey,
      conversationIndex: { generation: "locate-current", revision: 1, phase: "complete", count: 10000 } } });
    const list = document.querySelector('.maker-list');
    list.getBoundingClientRect = () => ({ top: -s.win.scrollY, width: 300 });
    assert.equal(list.querySelector('[data-marker-render-key="index:maker-9500"]'), null);
    const search = document.querySelector('.window-search input');
    search.value = "unrelated query";
    search.dispatchEvent(new s.win.Event("input", { bubbles: true }));
    assert.equal(document.querySelector('.window-scroll-controls').hidden, false, "current Maker remains reachable while search hides the TOC");
    const commandCount = s.commands.length;
    document.querySelector('[data-scroll-action="current"]').click();
    assert.equal(document.querySelector('.window-search input').value, "");
    assert.equal(document.activeElement.dataset.markerRenderKey, activeMarkerKey);
    assert.equal(document.activeElement.classList.contains("is-active"), true);
    assert.ok(s.win.scrollY > 500000);
    assert.ok(list.querySelectorAll('.maker-card').length < 100, "locating keeps the list virtualized");
    assert.equal(s.commands.length, commandCount, "locating only moves the sidepanel");
  } finally { s.dom.window.close(); }
});

test("complete indexing settings show the actual title and two exclusive mode cards", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const snapshot = { ...s.snapshot, conversationTitle: "我的真实会话标题", config: { chatgptHistoryMode: "complete" },
      conversationIndex: { generation: "run", revision: 1, phase: "loading", count: 123, total: null } };
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot });
    s.win.document.querySelector('.window-settings-button').click();
    s.win.document.querySelector('[data-settings-destination="preferences"]').click();
    assert.equal(s.win.document.querySelector('.index-current-title').textContent, "我的真实会话标题");
    assert.equal(s.win.document.querySelectorAll('.index-mode-card').length, 2);
    assert.match(s.win.document.querySelector('.index-mode-cards').textContent, /后续会话.*浏览器同步.*其他已登录浏览器/);
    assert.match(s.win.document.querySelector('.index-settings').textContent, /关闭页面或切换读取模式不会删除缓存/);
    assert.equal(s.win.document.querySelector('.index-progress').hasAttribute("value"), false);
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...snapshot, conversationTitle: "重命名后的标题", conversationIndex: { ...snapshot.conversationIndex, phase: "complete", total: 123 } } });
    assert.equal(s.win.document.querySelector('.index-current-title').textContent, "重命名后的标题");
    assert.match(s.win.document.querySelector('.index-current-status').textContent, /已读取全部/);
    s.win.document.querySelector('input[name="chatgpt-history-mode"][value="default"]').click();
    assert.ok(s.commands.some((command) => command.patch?.chatgptHistoryMode === "default"));
  } finally { s.dom.window.close(); }
});

test("Preferences clear cache uses the background cache operation and announces its result", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const original = s.win.chrome.runtime.sendMessage;
    s.win.chrome.runtime.sendMessage = async (message) => {
      if (message.type === "POLARIS_CONVERSATION_CACHE") { s.commands.push(message); return { ok: true }; }
      return original(message);
    };
    s.win.document.querySelector('.window-settings-button').click();
    s.win.document.querySelector('[data-settings-destination="preferences"]').click();
    const button = s.win.document.querySelector('[data-settings-focus="clear-conversation-cache"]');
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(s.commands.filter((command) => command.type === "POLARIS_CONVERSATION_CACHE" && command.operation === "clear").length, 1);
    assert.match(s.win.document.querySelector('.index-cache-status').textContent, /已清除/);
    assert.equal(button.disabled, false);
  } finally { s.dom.window.close(); }
});

test("indexed TOC and full-text results stay in TOC when native location is unavailable", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const original = s.win.chrome.runtime.sendMessage;
    s.win.chrome.runtime.sendMessage = async (message) => {
      if (message.command === "search-conversation") return { generation: "run", items: [{ key: "index:answer", markerKey: "index:answer", type: "result", role: "assistant", title: "正文", count: 1, parts: [{ text: "正文命中", match: true }] }], total: 1, hasMore: false };
      if (message.command === "jump-to-marker") { s.commands.push(message); return { ok: false, reason: "not-mounted" }; }
      return original(message);
    };
    const snapshot = { ...s.snapshot, config: { chatgptHistoryMode: "complete" },
      markerItems: Array.from({ length: 20000 }, (_, i) => ({ key: `index:${i}`, markerKey: `index:${i}`, type: "ai", title: `标题 ${i}` })),
      conversationIndex: { generation: "run", revision: 1, phase: "complete", count: 10000, total: 10000 } };
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot });
    assert.ok(s.win.document.querySelectorAll('.maker-list .maker-card').length <= 120);
    s.win.document.querySelector('.maker-card').click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(s.commands.filter((command) => command.command === "request-chapters").length, 0);
    assert.equal(s.win.document.querySelector(".window-search select"), null);
    const search = s.win.document.querySelector('.window-search input');
    assert.equal(search.placeholder, "搜索全部消息");
    search.value = "正文"; search.dispatchEvent(new s.win.Event("input"));
    await new Promise((resolve) => setTimeout(resolve, 450));
    s.win.document.querySelector('.index-search-result').click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(s.win.document.querySelector('.window-body').dataset.activeTab, "navigation");
    assert.equal(s.win.document.querySelector('.window-search input').value, "正文");
    assert.equal(s.commands.filter((command) => command.command === "request-chapters").length, 0);
    assert.ok(s.commands.some((command) => command.expectedRouteKey === snapshot.routeKey && command.generation === "run"));
  } finally { s.dom.window.close(); }
});

test("completed conversation Maker jumps stay silent while pending and successful, but still explain failures", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    let finishJump;
    const original = s.win.chrome.runtime.sendMessage;
    s.win.chrome.runtime.sendMessage = (message) => message.command === "jump-to-marker"
      ? new Promise((resolve) => { finishJump = resolve; }) : original(message);
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot,
      markerItems: [{ key: "index:a:0:0", markerKey: "index:a:0:0", type: "ai", title: "已加载的段落" }],
      conversationIndex: { generation: "one", revision: 1, phase: "complete", count: 1, native: { phase: "ready" } } } });
    s.win.document.querySelector('.maker-card').click();
    assert.equal(s.win.document.querySelector('.index-notice'), null);
    finishJump({ ok: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(s.win.document.querySelector('.index-notice'), null);

    s.win.document.querySelector('.maker-card').click();
    finishJump({ ok: false, reason: "navigation-cancelled" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(s.win.document.querySelector('.index-notice'), null, "manual interruption stays silent");

    s.win.document.querySelector('.maker-card').click();
    finishJump({ ok: false, reason: "anchor-not-found" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.match(s.win.document.querySelector('.index-notice').textContent, /已找到消息/);
    s.win.document.querySelector('.maker-card').click();
    assert.equal(s.win.document.querySelector('.index-notice'), null, "retrying a jump clears the previous failure notice");
    finishJump({ ok: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(s.win.document.querySelector('.index-notice'), null);
  } finally { s.dom.window.close(); }
});

test("a delayed native jump cannot open old indexed content after the conversation changes", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    let finishJump;
    const original = s.win.chrome.runtime.sendMessage;
    s.win.chrome.runtime.sendMessage = (message) => message.command === "jump-to-marker" ? new Promise((resolve) => { finishJump = resolve; }) : original(message);
    const snapshot = { ...s.snapshot, markerItems: [{ key: "index:a:0:0", markerKey: "index:a:0:0", type: "ai", title: "旧段落" }],
      conversationIndex: { generation: "one", revision: 1, phase: "complete", count: 1 } };
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot });
    s.win.document.querySelector('.maker-card').click();
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...snapshot, routeKey: "https://chatgpt.com/c/two", conversationIndex: { ...snapshot.conversationIndex, generation: "two" } } });
    finishJump({ ok: false, reason: "not-mounted" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(s.commands.filter((command) => command.readingRequestId).length, 0);
    assert.equal(s.win.document.querySelector('.window-body').dataset.activeTab, "navigation");
  } finally { s.dom.window.close(); }
});

test("sidepanel message integration opens active chapter and rejects old conversation results", async () => {
  const s = await boot();
  assert.equal(s.win.document.querySelector('.chapter-node-title[data-key="first"]').getAttribute("aria-expanded"), "false");
  assert.equal(s.win.document.querySelector('.chapter-node-title[data-key="second"]').getAttribute("aria-expanded"), "true");
  s.send({ type: "POLARIS_WINDOW_CHAPTERS", tabId: 8, routeKey: s.snapshot.routeKey, treeChapters: [], chapters: [] });
  assert.equal(s.win.document.querySelectorAll(".chapter-node-title").length, 2);
  assert.equal(s.win.document.querySelector(".chapter-selector"), null);
  const paragraph = s.win.document.querySelector(".chapter-tree-content p");
  const range = s.win.document.createRange(); range.selectNodeContents(paragraph);
  s.win.document.getSelection().addRange(range);
  s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, revision: 2 } });
  assert.equal(s.win.document.getSelection().toString(), "second body");
  s.dom.window.close();
});
test("sidepanel uses a normal content fade without starting browser view transitions", async () => {
  const s = await boot("sidepanel", { transitionApi: true });
  assert.equal(s.transitions.length, 0);
  assert.equal(s.win.document.querySelector("#polaris-window > .window-body")?.dataset.activeTab, "chapters");
  assert.ok(s.win.document.querySelector(".window-body.is-mode-transition"));
  s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, revision: 2 } });
  assert.equal(s.transitions.length, 0, "streaming state refreshes do not start a transition");
  [...s.win.document.querySelectorAll(".window-tab")].find((button) => button.textContent === "目录").click();
  assert.equal(s.transitions.length, 0, "mode switches do not use document.startViewTransition");
  assert.equal(s.win.document.querySelector("#polaris-window > .window-body")?.dataset.activeTab, "navigation");
  s.dom.window.close();
});
test("chapters mode waits for async chapter data before switching", async () => {
  const s = await boot("sidepanel", { transitionApi: true, deliverChapters: false });
  assert.equal(s.transitions.length, 0);
  assert.equal(s.win.document.querySelector(".navigation-panel") !== null, true);
  s.send({ type: "POLARIS_WINDOW_CHAPTERS", tabId: 7, routeKey: s.snapshot.routeKey, treeChapters: s.chapters, chapters: s.chapters });
  assert.equal(s.transitions.length, 0);
  assert.equal(s.win.document.querySelector(".chapter-tree-reader") !== null, true);
  s.dom.window.close();
});
test("ordinary mode fade completes even when sidepanel animation frames are throttled", async () => {
  const s = await boot("sidepanel", { transitionApi: true, stallAnimationFrames: true });
  assert.equal(s.transitions.length, 0, "ordinary tab changes do not start a View Transition update callback");
  assert.equal(s.win.document.querySelector("#polaris-window > .window-body")?.dataset.activeTab, "chapters");
  s.dom.window.close();
});

test("the settings home mounts the Pro card above its menu and reacts to entitlement changes", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const doc = s.win.document;
    doc.querySelector('.window-settings-button').click();
    await new Promise(resolve => s.win.requestAnimationFrame(resolve));
    const entry = doc.querySelector('.settings-pro-entry');
    const action = entry.querySelector('.settings-pro-cta');
    assert.equal(entry.parentElement.firstElementChild, entry);
    assert.equal(entry.nextElementSibling.classList.contains('settings-home-menu'), true);
    assert.equal(doc.querySelector('.settings-home-menu [data-settings-destination="license"]'), null);
    s.send({ type: 'POLARIS_BILLING_UPDATED', view: { available: true, tier: 'trial', fullAccess: true } });
    assert.equal(entry.querySelector('.settings-pro-status').hidden, false);
    action.focus(); action.click();
    assert.ok(doc.querySelector('.billing-page'));
    assert.equal(doc.querySelector('#polaris-window').hidden, true);
    doc.querySelector('.billing-header button').click();
    assert.equal(doc.activeElement, action);
    s.send({ type: 'POLARIS_BILLING_UPDATED', view: { available: true, tier: 'pro', fullAccess: true } });
    assert.equal(entry.hidden, false);
    assert.equal(action.textContent, '查看会员信息');
    action.click();
    assert.equal(doc.querySelector('.billing-title').textContent, '你的 Polaris Pro');
    assert.equal(doc.querySelector('.billing-dialog'), null);
    doc.querySelector('.billing-header button').click();
    await new Promise((resolve) => s.win.requestAnimationFrame(resolve));
    assert.equal(doc.activeElement, doc.querySelector('.settings-pro-cta'));
    doc.querySelector('[data-settings-destination="feedback"]').click();
    assert.equal(doc.querySelector('.settings-pro-entry'), null);
    doc.querySelector('.window-settings-back').click();
    assert.equal(doc.querySelector('.settings-pro-entry').hidden, false);
    assert.equal(doc.querySelector('.settings-pro-cta').textContent, '查看会员信息');
  } finally { s.dom.window.close(); }
});

test("settings menu opens six pages and returns through the menu to the original search and scroll", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const search = s.win.document.querySelector(".window-search input");
    search.value = "second";
    search.dispatchEvent(new s.win.Event("input"));
    search.focus();
    s.win.scrollTo({ top: 120 });
    s.win.document.querySelector(".window-settings-button").click();
    assert.deepEqual([...s.win.document.querySelectorAll(".settings-menu-row")].map((row) => row.textContent),
      ["偏好设置", "帮助与诊断", "反馈", "更新内容", "关于", "隐私政策"]);
    assert.equal(s.win.document.querySelectorAll(".settings-home-menu .settings-menu-icon").length, 6);
    s.win.document.querySelector('[data-settings-destination="help"]').click();
    assert.equal(s.win.document.querySelector("h1").textContent, "帮助与诊断");
    s.win.dispatchEvent(new s.win.KeyboardEvent("keydown", { key: "Escape" }));
    await new Promise((resolve) => s.win.requestAnimationFrame(resolve));
    assert.equal(s.win.document.querySelector("h1").textContent, "设置");
    assert.equal(s.win.document.activeElement.dataset.settingsDestination, "help");
    s.win.document.querySelector(".window-settings-back").click();
    await new Promise((resolve) => s.win.requestAnimationFrame(resolve));
    assert.equal(s.win.document.querySelector(".window-search input").value, "second");
    assert.equal(s.win.document.activeElement, s.win.document.querySelector(".window-search input"));
    assert.equal(s.win.scrollY, 120);
  } finally { s.dom.window.close(); }
});

test("settings returns focus to the selected Maker after leaving navigation", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const marker = s.win.document.querySelector('.maker-card[data-marker-render-key="ai-second"]');
    marker.focus();
    s.win.document.querySelector(".window-settings-button").dispatchEvent(new s.win.Event("pointerdown"));
    s.win.document.querySelector(".window-settings-button").click();
    s.win.document.querySelector(".window-settings-back").click();
    await new Promise((resolve) => s.win.requestAnimationFrame(resolve));
    assert.equal(s.win.document.activeElement.dataset.markerRenderKey, "ai-second");
  } finally { s.dom.window.close(); }
});

test("settings returns focus to the selected chapter control", async () => {
  const s = await boot();
  try {
    const chapter = s.win.document.querySelector('.chapter-node-title[data-key="second"]');
    chapter.focus();
    s.win.document.querySelector(".window-settings-button").dispatchEvent(new s.win.Event("pointerdown"));
    s.win.document.querySelector(".window-settings-button").click();
    s.win.document.querySelector(".window-settings-back").click();
    await new Promise((resolve) => s.win.requestAnimationFrame(resolve));
    assert.equal(s.win.document.activeElement.dataset.key, "second");
  } finally { s.dom.window.close(); }
});

test("preferences keep live controls, update the current platform, and retain at least one heading level", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const config = { maxVisibleUserGroups: 20, foldThreshold: 20, enabledLevelsByPlatform: { chatgpt: [1, 2, 3] } };
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, config } });
    s.win.document.querySelector(".window-settings-button").click();
    s.win.document.querySelector('[data-settings-destination="preferences"]').click();
    const range = s.win.document.querySelector('input[type="range"]');
    assert.equal(range.getAttribute("aria-label"), "显示最近几轮对话");
    range.focus();
    range.value = "37";
    range.dispatchEvent(new s.win.Event("input"));
    assert.deepEqual(s.commands.at(-1).patch, { maxVisibleUserGroups: 37 });
    s.win.scrollTo({ top: 230 });
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, config: { ...config, maxVisibleUserGroups: 31 }, revision: 2 } });
    assert.equal(s.win.document.querySelector('input[type="range"]'), range);
    assert.equal(range.value, "31");
    assert.equal(s.win.document.activeElement, range);
    assert.equal(s.win.scrollY, 230);
    const heading = (name) => [...s.win.document.querySelectorAll(".settings-check")].find((label) => label.textContent === name).querySelector("input");
    heading("H3").click();
    heading("H2").click();
    assert.deepEqual(s.commands.at(-1).patch, { enabledLevelsByPlatform: { chatgpt: [1] } });
    assert.equal(heading("H1").disabled, true);
    heading("H1").click();
    assert.equal(heading("H1").checked, true);
    [...s.win.document.querySelectorAll("button")].find((button) => button.textContent === "恢复默认").click();
    assert.equal(s.commands.at(-1).command, "reset-config");
    assert.equal([...s.win.document.querySelectorAll("button")].some((button) => button.textContent === "下载诊断"), false);
  } finally { s.dom.window.close(); }
});

test("manual update page survives conversation snapshots without opening the automatic dialog", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    await Promise.resolve();
    s.win.document.querySelector(".window-settings-button").click();
    s.win.document.querySelector('[data-settings-destination="updates"]').click();
    const page = s.win.document.querySelector('.settings-panel[data-settings-page="updates"]');
    assert.ok(page.textContent.includes("在层级列表中阅读章节"));
    assert.ok(page.querySelectorAll(".settings-update-note").length > 1);
    const allUpdates = page.querySelector(".settings-updates-all");
    assert.equal(allUpdates.textContent, "查看全部更新");
    assert.equal(allUpdates.href, "https://polaris-ai.work/v2/release-notes/");
    assert.equal(allUpdates.target, "_blank");
    assert.equal(s.win.document.querySelector("dialog[open]"), null);
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, revision: 2 } });
    assert.equal(s.win.document.querySelector('.settings-panel[data-settings-page="updates"]'), page);
    s.win.document.querySelector(".window-settings-back").click();
    await new Promise((resolve) => s.win.requestAnimationFrame(resolve));
    assert.equal(s.win.document.activeElement.dataset.settingsDestination, "updates");
  } finally { s.dom.window.close(); }
});

test("help explains manual attachments, sends existing diagnostic commands, and retains its reading position", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    s.win.document.querySelector(".window-settings-button").click();
    s.win.document.querySelector('[data-settings-destination="help"]').click();
    const page = s.win.document.querySelector('.settings-panel[data-settings-page="help"]');
    assert.equal(page.querySelectorAll("ol > li").length, 4);
    assert.equal(page.querySelectorAll(".settings-step-image").length, 4);
    assert.ok(page.textContent.includes("将下载的 JSON 文件添加为邮件附件"));
    assert.equal(page.textContent.includes("ChatGPT"), false);
    const button = (label) => [...page.querySelectorAll("button")].find((control) => control.textContent === label);
    button("发送诊断").click();
    assert.equal(s.commands.at(-1).command, "send-diagnostics");
    assert.equal(s.commands.at(-1).expectResult, true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(page.querySelector('[role="status"]').textContent.includes("手动附加 JSON"));
    assert.equal(button("发送诊断").classList.contains("settings-diagnostic-primary"), true);
    button("下载诊断").click();
    assert.equal(s.commands.at(-1).command, "download-diagnostics");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(page.querySelector('[role="status"]').textContent, "日志已下载。");
    s.win.chrome.runtime.sendMessage = async () => ({ ok: true, diagnosticStatus: "日志已下载，但无法打开系统邮件，请手动附加 JSON 文件。" });
    button("发送诊断").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(page.querySelector('[role="status"]').textContent.includes("无法打开系统邮件"));
    button("下载诊断").focus();
    s.win.scrollTo({ top: 310 });
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, revision: 2 } });
    assert.equal(s.win.document.querySelector('.settings-panel[data-settings-page="help"]'), page);
    assert.equal(s.win.document.activeElement, button("下载诊断"));
    assert.equal(s.win.scrollY, 310);
    s.win.document.querySelector(".window-settings-back").click();
    s.win.document.querySelector('[data-settings-destination="help"]').click();
    assert.equal(s.win.scrollY, 310);
  } finally { s.dom.window.close(); }
});

test("English about and feedback show packaged platform icons, the actual version, and explicit external destinations", async () => {
  const s = await boot("sidepanel", { locale: "en", openChapters: false });
  try {
    s.win.document.querySelector(".window-settings-button").click();
    assert.deepEqual([...s.win.document.querySelectorAll(".settings-menu-row")].map((row) => row.textContent),
      ["Preferences", "Help and diagnostics", "Feedback", "What's New", "About", "Privacy Policy"]);
    const privacy = s.win.document.querySelector('.settings-home-menu [data-settings-focus="privacy"]');
    assert.equal(privacy.href, "https://jeffery-ho.github.io/Polaris-AI-Chat-Navigator/privacy-policy.html");
    assert.equal(privacy.target, "_blank");
    s.win.document.querySelector('[data-settings-destination="about"]').click();
    assert.equal(s.win.document.querySelector(".settings-app-icon").width, 40);
    assert.equal(s.win.document.querySelector(".settings-app-version").textContent, "0.66.0");
    assert.equal(s.win.document.querySelectorAll(".settings-platform").length, 11);
    const platforms = [...s.win.document.querySelectorAll(".settings-platform")];
    assert.ok(platforms.some((item) => item.textContent === "DeepSeek" && item.querySelector("img").src.endsWith("platform-deepseek.ico")));
    assert.equal(s.win.document.querySelector(".settings-about-headline").textContent, "Find your way through long AI conversations");
    assert.equal(s.win.document.querySelector(".settings-about-story").textContent.includes("Jeffery"), true);
    assert.equal(s.win.document.querySelector('[data-settings-focus="privacy"]'), null);
    s.win.document.querySelector(".window-settings-back").click();
    s.win.document.querySelector('[data-settings-destination="feedback"]').click();
    const links = [...s.win.document.querySelectorAll(".settings-panel a")];
    assert.deepEqual(links.map((link) => link.href), ["https://github.com/Jeffery-Ho/Polaris-AI-Chat-Navigator/issues", "mailto:jefferyho.build@gmail.com", "https://x.com/JefferyHo_", "https://xhslink.com/m/3wXO9kRBrLO", "https://discord.gg/cdrM7Xqmzh"]);
    assert.ok(links.every((link) => link.target === "_blank" && link.rel.includes("noopener")));
    assert.deepEqual(links.slice(0, 2).map((link) => link.textContent), ["Submit an issue on GitHub", "Email the developer"]);
    assert.ok(links.slice(2).every((link) => link.getAttribute("aria-label") && link.title && !link.textContent));
    assert.equal(s.win.document.querySelectorAll(".settings-social-icon").length, 3);
  } finally { s.dom.window.close(); }
});

test("ChatGPT pick-a-chat guidance lives in the sidepanel in both languages and content tabs", async () => {
  for (const locale of ["zh", "en"]) {
    const s = await boot("sidepanel", { locale, openChapters: false, deliverChapters: false });
    const doc = s.win.document;
    const home = { ...s.snapshot, routeKey: "https://chatgpt.com/", hasConversation: false, markerItems: [],
      config: { chatgptHistoryMode: "complete" }, conversationAwaiting: true };
    try {
      s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: home });
      const guide = doc.querySelector(".window-body .conversation-awaiting");
      assert.ok(guide);
      assert.equal(guide.getAttribute("role"), "status");
      assert.equal(guide.querySelector(".empty-title").textContent, locale === "zh" ? "选择一个会话开始读取" : "Pick a chat to start reading");
      assert.match(guide.querySelector(".empty-copy").textContent, locale === "zh" ? /ChatGPT 左侧边栏/ : /ChatGPT sidebar/);
      assert.equal(doc.querySelector(".conversation-skeleton"), null, "waiting for a selection must not look like active loading");
      [...doc.querySelectorAll(".window-tab")].find((button) => button.textContent === (locale === "zh" ? "大纲" : "Outline")).click();
      assert.ok(doc.querySelector(".window-body .conversation-awaiting"));

      for (const routeKey of ["https://chatgpt.com/settings/billing", "https://chatgpt.com/settings/account"]) {
        s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...home, routeKey, conversationAwaiting: false } });
        assert.equal(doc.querySelector(".conversation-awaiting"), null, routeKey);
      }
      s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...home, conversationAwaiting: false, config: { chatgptHistoryMode: "default" } } });
      assert.equal(doc.querySelector(".conversation-awaiting"), null, "Follow ChatGPT mode keeps its existing empty state");
      s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: home });
      assert.ok(doc.querySelector(".conversation-awaiting"));
      s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, hasConversation: false, conversationAwaiting: false, conversationLoading: true } });
      assert.equal(doc.querySelector(".conversation-awaiting"), null);
      assert.ok(doc.querySelector(".conversation-skeleton.is-reading"));
      [...doc.querySelectorAll(".window-tab")].find((button) => button.textContent === (locale === "zh" ? "目录" : "Table of Contents")).click();
      s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: s.snapshot });
      assert.equal(doc.querySelector(".conversation-awaiting"), null);
      assert.equal(doc.querySelector(".maker-title").textContent, "second");
    } finally { s.dom.window.close(); }
  }
});

test("full-conversation status stays above the skeleton in both tabs and disappears when disabled or ready", async () => {
  for (const locale of ["zh", "en"]) for (const platform of ["chatgpt", "gemini"]) {
    const s = await boot("sidepanel", { locale, openChapters: false, deliverChapters: false });
    try {
      const doc = s.win.document;
      const snapshot = { ...s.snapshot, platform, config: { chatgptHistoryMode: "complete" }, conversationLoading: true,
        conversationIndex: { generation: "read-one", title: "A long conversation title / 一个较长的会话标题", count: 0, phase: "loading", native: { phase: "loading" } } };
      const publish = (extra = {}) => s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...snapshot, ...extra } });
      publish();
      const card = doc.querySelector(".conversation-read-status");
      assert.ok(card);
      assert.equal(doc.querySelector(".window-body").firstElementChild, card);
      assert.ok(card.nextElementSibling.querySelector(".conversation-skeleton"));
      assert.equal(doc.querySelector(".conversation-skeleton-status").hidden, true, "do not repeat the reading announcement");
      assert.equal(card.querySelector(".conversation-read-count").textContent, "", "unknown counts stay blank");
      assert.equal(card.querySelector(".conversation-read-actions").hidden, true);
      publish({ conversationIndex: { ...snapshot.conversationIndex, count: 21 } });
      assert.equal(doc.querySelector(".conversation-read-status"), card, "progress updates preserve the status node");
      assert.equal(card.querySelector(".conversation-read-count").textContent, "21");
      [...doc.querySelectorAll(".window-tab")].find(button => button.textContent === (locale === "zh" ? "大纲" : "Outline")).click();
      assert.equal(doc.querySelector(".window-body").firstElementChild, card);
      assert.ok(doc.querySelector(".conversation-skeleton"), "Outline also waits for native preparation");
      publish({ conversationIndex: { ...snapshot.conversationIndex, count: 21, phase: "complete", native: { phase: "preparing" } } });
      assert.equal(card.querySelector(".read").dataset.state, "done");
      assert.equal(card.querySelector(".prepare").dataset.state, "active");
      publish({ config: { chatgptHistoryMode: "default" } });
      assert.equal(doc.querySelector(".conversation-read-status"), null, "disabled mode suppresses even a stale progress snapshot");
      assert.equal(doc.querySelector(".conversation-skeleton-status").hidden, false);
      publish({ conversationLoading: false, conversationIndex: { ...snapshot.conversationIndex, count: 21, phase: "complete", native: { phase: "ready" } } });
      assert.equal(doc.querySelector(".conversation-read-status"), null);
      assert.equal(doc.querySelector(".conversation-skeleton"), null);
      publish({ hasConversation: false, conversationAwaiting: true, conversationLoading: false, conversationIndex: null });
      assert.equal(doc.querySelector(".conversation-read-status"), null);
    } finally { s.dom.window.close(); }
  }
});

test("sidepanel reading recovery targets its conversation and preferences opens the reading setting", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const doc = s.win.document;
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot,
      config: { chatgptHistoryMode: "complete" }, conversationLoading: true,
      conversationIndex: { generation: "failed-read", count: 21, phase: "partial", native: { phase: "error" } } } });
    const card = doc.querySelector(".conversation-read-status");
    assert.equal(card.querySelector(".read").dataset.state, "error");
    assert.equal(card.querySelector(".conversation-read-actions").hidden, false);
    const buttons = card.querySelectorAll(".conversation-read-actions button");
    buttons[0].click(); buttons[1].click();
    for (const command of ["retry-conversation-index", "read-loaded-conversation"]) {
      const sent = s.commands.findLast(message => message.command === command);
      assert.equal(sent.expectedTabId, 7); assert.equal(sent.expectedRouteKey, s.snapshot.routeKey);
      assert.equal(sent.generation, "failed-read");
    }
    card.querySelector(".conversation-read-preferences").click();
    assert.ok(doc.querySelector(".index-mode-cards"));
    assert.equal(doc.querySelector(".conversation-read-status"), null);
  } finally { s.dom.window.close(); }
});

test("supported conversation skeleton survives retries and yields to real Makers", async () => {
  const s = await boot("sidepanel", { locale: "en", openChapters: false });
  try {
    const waiting = { ...s.snapshot, hasConversation: false, markerItems: [] };
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: waiting });
    const skeleton = s.win.document.querySelector(".conversation-skeleton");
    assert.ok(skeleton);
    assert.equal(skeleton.querySelector('[role="status"]').textContent, "Reading conversation…");
    assert.equal(skeleton.querySelector(".conversation-skeleton-list").getAttribute("aria-hidden"), "true");
    assert.equal(s.win.document.querySelector(".platform-links"), null);
    assert.equal(s.win.document.querySelector(".empty-title"), null);

    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...waiting, loading: true, platform: "default", revision: 2 } });
    assert.equal(s.win.document.querySelector(".conversation-skeleton"), skeleton);

    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: s.snapshot });
    assert.equal(s.win.document.querySelector(".conversation-skeleton"), null);
    assert.equal(s.win.document.querySelector(".maker-title").textContent, "second");

    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, markerItems: [] } });
    assert.equal(s.win.document.querySelector(".conversation-skeleton"), null);
    assert.equal(s.win.document.querySelector(".empty-copy").textContent, "No Makers in this conversation yet.");
  } finally { s.dom.window.close(); }
});

test("chapters reuse the conversation empty state until a real conversation has no chapters", async () => {
  const s = await boot("sidepanel", { locale: "en", openChapters: false, deliverChapters: false });
  try {
    const waiting = { ...s.snapshot, hasConversation: false, markerItems: [] };
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: waiting });
    const navigationStatus = s.win.document.querySelector(".conversation-skeleton-status").textContent;
    [...s.win.document.querySelectorAll(".window-tab")].find((button) => button.textContent === "Outline").click();
    const skeleton = s.win.document.querySelector(".conversation-skeleton");
    assert.ok(skeleton);
    assert.equal(skeleton.querySelectorAll(".conversation-skeleton-row").length, 5);
    assert.equal(skeleton.querySelector(".conversation-skeleton-status").textContent, navigationStatus);
    assert.equal(s.win.document.body.textContent.includes("No chapters in this conversation"), false);

    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...waiting, loading: true, revision: 2 } });
    assert.equal(s.win.document.querySelector(".conversation-skeleton"), skeleton);

    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, revision: 3 } });
    s.send({ type: "POLARIS_WINDOW_CHAPTERS", tabId: 7, routeKey: s.snapshot.routeKey, treeChapters: [], chapters: [] });
    assert.equal(s.win.document.querySelector(".conversation-skeleton"), null);
    assert.ok(s.win.document.body.textContent.includes("No chapters in this conversation"));
  } finally { s.dom.window.close(); }
});

test("supported platform without a conversation uses a static localized skeleton", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, supportedRoute: false, hasConversation: false, markerItems: [] } });
    const skeleton = s.win.document.querySelector(".conversation-skeleton");
    assert.ok(skeleton);
    assert.equal(skeleton.querySelector('[role="status"]').textContent, "等待会话…");
    assert.equal(skeleton.classList.contains("is-reading"), false);
    assert.equal(s.win.document.querySelector(".platform-links"), null);

    for (const routeKey of ["https://chatgpt.com/", "https://claude.ai/new", "https://gemini.google.com/app"]) {
      s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, routeKey, hasConversation: false, markerItems: [] } });
      const home = s.win.document.querySelector(".conversation-skeleton");
      assert.ok(home, routeKey);
      assert.equal(home.querySelector('[role="status"]').textContent, "等待会话…", routeKey);
      assert.equal(home.classList.contains("is-reading"), false, routeKey);
    }
  } finally { s.dom.window.close(); }
});

test("unsupported pages keep platform guidance instead of an indefinite reading skeleton", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const empty = { ...s.snapshot, supportedRoute: true, loading: true, hasConversation: false, platform: "default", markerItems: [] };
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: empty });
    assert.ok(s.win.document.querySelector(".conversation-skeleton.is-reading"));

    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 8, snapshot: { ...empty, supportedRoute: false, loading: false } });
    assert.equal(s.win.document.querySelector(".conversation-skeleton"), null);
    const links = [...s.win.document.querySelectorAll(".empty-state .platform-link")];
    assert.equal(links.length, 11);
    assert.ok(links.every((link) => !link.target && link.href.startsWith("https://")));
    assert.equal(links.find((link) => link.dataset.platform === "claude").href, "https://claude.ai/");
    assert.equal(s.win.document.querySelector(".empty-title").textContent, "打开支持的 AI 对话");
  } finally { s.dom.window.close(); }
});

test("实际切换 AI 平台后，空状态标记最近使用的平台且不会被不支持的页面覆盖", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 9, snapshot: { ...s.snapshot, platform: "claude", routeKey: "https://claude.ai/chat/two" } });
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 10, snapshot: { ...s.snapshot, platform: "default", supportedRoute: false, hasConversation: false, markerItems: [] } });
    await Promise.resolve();
    const badges = s.win.document.querySelectorAll(".empty-state .platform-link-badge:not([hidden])");
    assert.equal(badges.length, 1);
    assert.equal(badges[0].closest(".platform-link").dataset.platform, "claude");
    assert.equal(badges[0].closest(".platform-link").title, "Claude · 上次使用");
    assert.equal(badges[0].textContent, "上次使用");
  } finally { s.dom.window.close(); }
});

test("maker search keeps the full list and locates the exact result without toggling it", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const items = [
      { key: "user-first", type: "user", groupKey: "first", title: "创作者风格" },
      { key: "ai-middle", type: "ai", markerKey: "middle", title: "其他内容" },
      { key: "ai-last", type: "ai", markerKey: "last", title: "创作者风格" }
    ];
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, markerItems: items } });
    const cards = [...s.win.document.querySelectorAll(".maker-card")];
    const search = s.win.document.querySelector(".window-search input");
    search.value = "创作者";
    search.dispatchEvent(new s.win.Event("input"));
    assert.deepEqual([...s.win.document.querySelectorAll(".maker-card")], cards);
    const results = s.win.document.querySelectorAll(".window-search-result");
    assert.equal(results.length, 2);
    cards[2].getBoundingClientRect = () => ({ top: 800 });
    const originalRect = s.win.HTMLElement.prototype.getBoundingClientRect;
    s.win.HTMLElement.prototype.getBoundingClientRect = function () {
      return this.matches(".window-header") ? { bottom: 160 } : originalRect.call(this);
    };
    const commandCount = s.commands.length;
    results[1].click();
    assert.equal(s.win.document.querySelector(".window-search input").value, "");
    assert.equal(s.win.document.querySelector(".window-search-results"), null);
    assert.equal(s.win.document.activeElement, cards[2]);
    assert.equal(s.win.scrollY, 628, "target lands 12px below the sticky header");
    assert.equal(s.scrollRequests.at(-1).behavior, "smooth");
    assert.equal(s.commands.length, commandCount);
  } finally { s.dom.window.close(); }
});

test("maker search supports empty results, keyboard selection and escape", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const searchFor = (query) => {
      const input = s.win.document.querySelector(".window-search input");
      input.value = query;
      input.dispatchEvent(new s.win.Event("input"));
      return s.win.document.querySelector(".window-search input");
    };
    let input = searchFor("不存在");
    assert.ok(s.win.document.querySelector(".window-search-results .empty-search"));
    assert.equal(s.win.document.querySelectorAll(".maker-card").length, 1);
    input.dispatchEvent(new s.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(s.win.document.querySelector(".window-search-results"), null);
    input = searchFor("second");
    input.dispatchEvent(new s.win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    assert.ok(s.win.document.activeElement.matches(".window-search-result"));
    s.win.document.activeElement.click();
    assert.ok(s.win.document.activeElement.matches(".maker-card"));
  } finally { s.dom.window.close(); }
});

test("search result survives a snapshot between pointer down and click", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const input = s.win.document.querySelector(".window-search input");
    input.value = "second";
    input.dispatchEvent(new s.win.Event("input"));
    const result = s.win.document.querySelector(".window-search-result");
    result.dispatchEvent(new s.win.MouseEvent("mousedown", { bubbles: true }));
    result.focus();
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, revision: 2 } });
    assert.equal(result.isConnected, true, "refresh must not remove the pressed result");
    result.click();
    assert.equal(s.win.document.querySelector(".window-search-results"), null);
    assert.ok(s.win.document.activeElement.matches('.maker-card[data-search-located="true"]'));
  } finally { s.dom.window.close(); }
});


test("search location respects reduced motion", async () => {
  const s = await boot("sidepanel", { openChapters: false, reducedMotion: true });
  try {
    const input = s.win.document.querySelector(".window-search input");
    input.value = "second";
    input.dispatchEvent(new s.win.Event("input"));
    s.win.document.querySelector(".window-search-result").click();
    assert.equal(s.scrollRequests.at(-1).behavior, "instant");
    assert.ok(s.win.document.activeElement.matches('.maker-card[data-search-located="true"]'));
  } finally { s.dom.window.close(); }
});

test("first launch shows onboarding instead of the release notice and help reopens it", async () => {
  const s = await boot("sidepanel", { openChapters: false, onboardingSeen: false });
  try {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const doc = s.win.document;
    const dialog = doc.querySelector(".onboarding-dialog[open]");
    assert.ok(dialog);
    assert.equal(doc.querySelector(".release-notice-dialog"), null);
    assert.equal(dialog.querySelector(".onboarding-title").textContent, "支持 11 个 AI 平台");
    dialog.querySelector(".onboarding-close").click();
    assert.equal(doc.querySelector(".onboarding-dialog"), null);
    assert.deepEqual(s.writes.at(-1), { "polaris-onboarding-version": 1, "polaris-release-notice-version": "0.66.0" });

    doc.querySelector(".window-settings-button").click();
    doc.querySelector('[data-settings-destination="help"]').click();
    const reopen = doc.querySelector('[data-settings-focus="onboarding"]');
    assert.equal(reopen.textContent, "查看引导");
    reopen.click();
    assert.ok(doc.querySelector(".onboarding-dialog[open]"));
    doc.querySelector(".onboarding-skip").click();
  } finally { s.dom.window.close(); }
});

test("indexed Makers wait for the loading cover and appear when it finishes", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const snapshot = { ...s.snapshot, config: { chatgptHistoryMode: "complete" }, conversationLoading: true,
      conversationIndex: { generation: "run", revision: 1, phase: "loading", count: 40, total: null } };
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot });
    assert.ok(s.win.document.querySelector(".conversation-skeleton.is-reading"));
    assert.equal(s.win.document.querySelector(".index-list-status"), null);
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...snapshot, conversationLoading: false,
      conversationIndex: { ...snapshot.conversationIndex, phase: "complete", total: 40 } } });
    assert.equal(s.win.document.querySelector(".conversation-skeleton"), null);
    assert.match(s.win.document.querySelector(".index-list-status").textContent, /已读取全部/);
  } finally { s.dom.window.close(); }
});

test("a chat that could not be read asks for a page refresh in the sidepanel", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, config: { chatgptHistoryMode: "complete" }, conversationStalled: true,
      conversationIndex: { generation: "run", revision: 1, phase: "error", error: "unsupported-format", count: 0, total: null } } });
    const skeleton = s.win.document.querySelector(".conversation-skeleton");
    assert.equal(skeleton.classList.contains("is-reading"), false);
    assert.match(skeleton.querySelector(".conversation-skeleton-status").textContent, /请刷新页面/);
  } finally { s.dom.window.close(); }
});

test("waiting or elapsed stall flags do not offer refresh until an actual read failure arrives", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const snapshot = { ...s.snapshot, config: { chatgptHistoryMode: "complete" }, conversationLoading: true, conversationStalled: true,
      conversationIndex: { generation: "run", phase: "loading", count: 0, native: { phase: "preparing" } } };
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot });
    assert.ok(s.win.document.querySelector(".conversation-skeleton.is-reading"));
    assert.match(s.win.document.querySelector(".conversation-skeleton-status").textContent, /正在读取/);
    assert.equal(s.win.document.querySelector(".conversation-read-reload"), null);
    assert.equal(s.win.document.querySelector(".conversation-read-default"), null);
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...snapshot, conversationLoading: false, conversationStalled: false,
      conversationIndex: { ...snapshot.conversationIndex, phase: "error", error: "http-503" } } });
    assert.ok(s.win.document.querySelector(".conversation-read-reload"));
    assert.match(s.win.document.querySelector(".conversation-skeleton-status").textContent, /请刷新页面/);
  } finally { s.dom.window.close(); }
});

test("the full-read failure action reloads only its source conversation and prevents duplicate clicks", async () => {
  for (const locale of ["zh", "en"]) for (const theme of ["light", "dark"]) {
    const s = await boot("sidepanel", { locale, openChapters: false });
    try {
      s.win.matchMedia = () => ({ matches: theme === "dark" });
      const snapshot = { ...s.snapshot, config: { chatgptHistoryMode: "complete" }, conversationStalled: true,
        conversationIndex: { generation: "run", phase: "error", error: "network-error", count: 0 } };
      s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot });
      const action = s.win.document.querySelector(".conversation-read-reload");
      assert.ok(action, `${locale}/${theme}: the failure has an action`);
      assert.equal(action.textContent, locale === "zh" ? "刷新页面" : "Refresh page");
      assert.equal(s.win.document.documentElement.dataset.theme, theme);
      action.click(); action.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const commands = s.commands.filter((command) => command.command === "reload-conversation");
      assert.equal(commands.length, 1);
      assert.equal(commands[0].expectedTabId, 7);
      assert.equal(commands[0].expectedRouteKey, snapshot.routeKey);
      assert.equal(action.disabled, true);
      s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...snapshot, conversationStalled: false, conversationLoading: true,
        conversationIndex: { ...snapshot.conversationIndex, phase: "loading", error: "" } } });
      assert.equal(s.win.document.querySelector(".conversation-read-reload"), null, "normal reading needs no refresh action");
      s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...snapshot, config: { chatgptHistoryMode: "default" } } });
      assert.equal(s.win.document.querySelector(".conversation-read-reload"), null, "turning complete mode off removes the action");
    } finally { s.dom.window.close(); }
  }
});

test("using the default list after a read failure turns off full reading and restores DOM Makers", async () => {
  for (const locale of ["zh", "en"]) for (const platform of ["chatgpt", "gemini"]) {
    const s = await boot("sidepanel", { locale, openChapters: false });
    try {
      const snapshot = { ...s.snapshot, platform,
        routeKey: platform === "gemini" ? "https://gemini.google.com/app/one" : s.snapshot.routeKey,
        config: { chatgptHistoryMode: "complete" }, conversationStalled: true,
        conversationIndex: { generation: "run", phase: "error", error: "network-error", count: 0 } };
      s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot });
      const action = s.win.document.querySelector(".conversation-read-default");
      assert.ok(action, `${locale}/${platform}: the failure has a fallback`);
      assert.equal(action.textContent, locale === "zh" ? "使用默认列表" : "Use default list");
      assert.equal(action.previousElementSibling, s.win.document.querySelector(".conversation-read-reload"));
      s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot });
      assert.equal(s.win.document.querySelectorAll(".conversation-read-default").length, 1);
      action.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const commands = s.commands.filter((command) => command.command === "update-config");
      assert.equal(commands.length, 1);
      assert.deepEqual(commands[0].patch, { chatgptHistoryMode: "default" });
      assert.equal(s.commands.some((command) => command.command === "reload-conversation"), false);
      s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...snapshot,
        config: { chatgptHistoryMode: "default" }, conversationStalled: false, conversationIndex: null } });
      assert.equal(s.win.document.querySelector(".conversation-read-fallback-actions"), null);
      assert.equal(s.win.document.querySelector(".conversation-skeleton"), null);
      assert.match(s.win.document.querySelector(".maker-list").textContent, /second/);
    } finally { s.dom.window.close(); }
  }
});

test("a rejected refresh is retryable without changing the full-read preference", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const original = s.win.chrome.runtime.sendMessage;
    s.win.chrome.runtime.sendMessage = async (message) => message.command === "reload-conversation" ? { ok: false } : original(message);
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, config: { chatgptHistoryMode: "complete" }, conversationStalled: true,
      conversationIndex: { generation: "run", phase: "error", error: "network-error", count: 0 } } });
    const action = s.win.document.querySelector(".conversation-read-reload");
    assert.ok(action);
    action.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(action.disabled, false);
    assert.match(s.win.document.querySelector(".conversation-skeleton-status").textContent, /刷新失败/);
    assert.equal(s.commands.some((command) => command.command === "update-config"), false);
  } finally { s.dom.window.close(); }
});


test("billing pages restore reading and settings scroll, keep pending orders out of checkout, and support Escape", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const doc = s.win.document;
    const search = doc.querySelector(".window-search input"); search.focus();
    s.win.scrollTo({ top: 180 });
    doc.querySelector('.window-settings-button').click();
    await new Promise(resolve => s.win.requestAnimationFrame(resolve));
    s.win.scrollTo({ top: 80 });
    const trigger = doc.querySelector('.settings-pro-cta'); trigger.focus(); trigger.click();
    assert.equal(s.win.scrollY, 0);
    assert.equal(doc.querySelector('#polaris-window').inert, true);
    s.send({ type: 'POLARIS_BILLING_UPDATED', view: { available:true, tier:'trial', hasPurchase:true, purchaseStatus:'pending', price:null } });
    assert.match(doc.querySelector('.billing-page').textContent, /继续付款/);
    assert.equal(s.commands.some(command => command.action === 'checkout'), false);
    doc.querySelector('.billing-header button').click();
    assert.equal(s.win.scrollY, 80);
    assert.equal(doc.activeElement, trigger);
    assert.equal(doc.querySelector('#polaris-window').inert, false);
    doc.querySelector('.window-settings-back').click();
    await new Promise(resolve => s.win.requestAnimationFrame(resolve));
    assert.equal(s.win.scrollY, 180);
    assert.equal(doc.activeElement, doc.querySelector('.window-search input'));
    doc.querySelector('.window-settings-button').click();
    doc.querySelector('.settings-pro-cta').click();
    s.win.dispatchEvent(new s.win.KeyboardEvent('keydown', {key:'Escape'}));
    s.win.dispatchEvent(new s.win.KeyboardEvent('keydown', {key:'Escape'}));
    assert.equal(doc.querySelector('.billing-page'), null);
  } finally { s.dom.window.close(); }
});

test("recognition guidance is a Maker row that follows reply and expansion state", async () => {
  const s = await boot("sidepanel", { locale: "en", openChapters: false, deliverChapters: false });
  try {
    const user = { key: 'user-only', type: 'user', title: 'Question', groupKey: 'user-only', isExpanded: true };
    const publish = (extra = {}) => s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7,
      snapshot: { ...s.snapshot, markerItems: [user], recognitionHintGroups: ['user-only'], ...extra } });
    publish();
    const hint = s.win.document.querySelector('.maker-list .maker-card-recognition');
    assert.ok(hint);
    assert.match(hint.textContent, /Content recognition/);
    assert.ok(!hint.textContent.includes("TOC"));
    publish({ recognitionHintGroups: [] });
    assert.equal(s.win.document.querySelector('.maker-card-recognition'), null);
    publish({ markerItems: [{ ...user, isExpanded: false }] });
    assert.equal(s.win.document.querySelector('.maker-card-recognition'), null);
    publish();
    s.win.document.querySelector('.maker-card-recognition').click();
    assert.ok(s.win.document.querySelector('[data-settings-page="preferences"]'));
  } finally { s.dom.window.close(); }
});

test("global conversation copy lives in the content area and works while focused on a chapter", async () => {
  const s = await boot('sidepanel', { locale: 'en' });
  try {
    const copied = [];
    Object.defineProperty(s.win.navigator, 'clipboard', { value: { writeText: async value => copied.push(value) } });
    const original = s.win.chrome.runtime.sendMessage;
    s.win.chrome.runtime.sendMessage = async message => message.command === 'get-conversation-export'
      ? { ok: true, scope: 'complete', title: 'Entire chat', messages: [{ role: 'user', markdown: 'Original question', text: 'Original question' }, { role: 'assistant', markdown: 'First body\n\nSecond body', text: 'First body\n\nSecond body' }] }
      : original(message);
    s.win.document.querySelector('.chapter-node-dot[data-key="second"]').click();
    assert.ok(!s.win.document.querySelector('[role="menu"]').textContent.includes('Copy full text'));
    [...s.win.document.querySelectorAll('[role="menuitem"]')].find(button => button.textContent === 'Focus this chapter').click();
    assert.equal(s.win.document.querySelectorAll('.chapter-node-title').length, 1);
    s.win.document.querySelector('[data-window-tab="navigation"]').click();
    assert.equal(s.win.document.querySelector('.conversation-actions'), null);
    s.win.document.querySelector('[data-window-tab="chapters"]').click();
    const globalCopy = s.win.document.querySelector('.window-body > .conversation-actions .conversation-copy-button');
    assert.ok(globalCopy); assert.equal(s.win.document.querySelector('.window-tabs .conversation-copy-button'), null);
    globalCopy.click(); await new Promise(resolve => setTimeout(resolve, 0));
    assert.match(copied[0], /Original question[\s\S]*First body[\s\S]*Second body/);
    assert.ok(s.win.document.querySelector('.conversation-export-dialog[open]'));
    s.send({ type: 'POLARIS_WINDOW_STATE', tabId: 7, snapshot: { ...s.snapshot, routeKey: 'https://chatgpt.com/c/two' } });
    assert.equal(s.win.document.querySelector('.conversation-export-dialog'), null);
    s.send({ type: 'POLARIS_WINDOW_STATE', tabId: 7, snapshot: { ...s.snapshot, conversationIndex: { phase: 'loading', generation: 'new' } } });
    assert.equal(s.win.document.querySelector('.conversation-copy-button').disabled, true);
  } finally { s.dom.window.close(); }
});

test("支持网站的顶部平台图标可操作，刷新保留菜单，未选平台提供免费更换入口", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    const doc = s.win.document;
    s.send({ type: "POLARIS_BILLING_UPDATED", view: { available: true, tier: "free", fullAccess: false, platforms: ["chatgpt", "kimi"], needsPlatformChoice: false } });
    const trigger = doc.querySelector(".window-platform"); assert.equal(trigger.tagName, "BUTTON"); trigger.click();
    assert.equal(doc.querySelectorAll(".window-platform-menu .platform-menu-platform").length, 11);
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, platform: "kimi" } });
    assert.ok(doc.querySelector(".window-platform-menu")); assert.equal(doc.querySelector(".window-platform").getAttribute("aria-expanded"), "true");
    doc.querySelector('.window-platform-menu [data-platform="gemini"]').click();
    assert.equal(doc.querySelector(".window-platform-menu"), null); assert.equal(doc.querySelector(".billing-page").dataset.screen, "platform-access");
    assert.equal(s.commands.some(command => command.action === "checkout" || command.action === "platforms"), false);
    doc.querySelector(".billing-header button").click();
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, platform: "gemini" } });
    assert.match(doc.querySelector(".billing-settings h2").textContent, /Gemini/);
    doc.querySelector(".billing-settings button").click(); assert.equal(doc.querySelector(".billing-page").dataset.screen, "replace-platform");
    doc.querySelector(".billing-link").click();
    doc.querySelector(".window-platform").click(); assert.ok(doc.querySelector(".window-platform-menu"));
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, platform: "", supportedRoute: false } });
    assert.equal(doc.querySelector(".window-platform"), null); assert.equal(doc.querySelector(".window-platform-menu"), null);
    assert.ok(doc.querySelector(".window-settings-button"));
  } finally { s.dom.window.close(); }
});

test("非支持页面隐藏平台占位按钮，回到 AI 网站主页或会话后恢复真实图标", async () => {
  for (const locale of ["zh", "en"]) {
    const s = await boot("sidepanel", { locale, openChapters: false, deliverChapters: false });
    try {
      const doc = s.win.document;
      for (const platform of ["default", "", undefined, "unknown"]) {
        s.send({ type: "POLARIS_WINDOW_STATE", tabId: 8, snapshot: { ...s.snapshot, platform, routeKey: "https://example.com/", supportedRoute: false, hasConversation: false, markerItems: [] } });
        assert.equal(doc.querySelector(".window-platform"), null);
        assert.ok(doc.querySelector(".window-settings-button"));
      }
      for (const supportedRoute of [false, true]) {
        s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, supportedRoute, hasConversation: supportedRoute } });
        const button = doc.querySelector(".window-platform");
        assert.ok(button.querySelector('img[src$="platform-chatgpt.png"]'));
        assert.equal(button.querySelector(".window-platform-label"), null);
        button.click(); assert.ok(doc.querySelector(".window-platform-menu")); button.click();
      }
    } finally { s.dom.window.close(); }
  }
});
