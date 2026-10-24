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
  return { dom, win, send, commands, snapshot, chapters, transitions, scrollRequests, writes };
}
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
    assert.equal(s.win.document.querySelector('.index-progress').hasAttribute("value"), false);
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...snapshot, conversationTitle: "重命名后的标题", conversationIndex: { ...snapshot.conversationIndex, phase: "complete", total: 123 } } });
    assert.equal(s.win.document.querySelector('.index-current-title').textContent, "重命名后的标题");
    assert.match(s.win.document.querySelector('.index-current-status').textContent, /已读取全部/);
    s.win.document.querySelector('input[name="chatgpt-history-mode"][value="default"]').click();
    assert.ok(s.commands.some((command) => command.patch?.chatgptHistoryMode === "default"));
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
    const search = s.win.document.querySelector('.window-search input');
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

test("settings menu opens five pages and returns through the menu to the original search and scroll", async () => {
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
    assert.deepEqual(links.map((link) => link.href), ["https://github.com/Jeffery-Ho/Polaris-AI-Chat-Navigator/issues", "mailto:jefferyho.build@gmail.com", "https://x.com/JefferyHo_", "https://xhslink.com/m/3wXO9kRBrLO"]);
    assert.ok(links.every((link) => link.target === "_blank" && link.rel.includes("noopener")));
    assert.deepEqual(links.slice(0, 2).map((link) => link.textContent), ["Submit an issue on GitHub", "Email the developer"]);
    assert.ok(links.slice(2).every((link) => link.getAttribute("aria-label") && link.title && !link.textContent));
    assert.equal(s.win.document.querySelectorAll(".settings-social-icon").length, 2);
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
