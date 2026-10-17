import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

async function boot(windowType = "sidepanel", { locale = "zh", transitionApi = false, openChapters = true, deliverChapters = true, stallAnimationFrames = false } = {}) {
  const dom = new JSDOM(`<html data-window-type="${windowType}"><body><div id="polaris-window"></div></body></html>`, { url: "https://extension.test/sidepanel.html", runScripts: "outside-only", pretendToBeVisual: true });
  const win = dom.window;
  win.matchMedia = () => ({ matches: false, addEventListener() {} });
  let scrollY = 0;
  Object.defineProperty(win, "scrollY", { get: () => scrollY });
  win.scrollTo = ({ top = 0 }) => { scrollY = top; };
  win.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  win.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new win.Event("close")); };
  if (stallAnimationFrames) win.requestAnimationFrame = () => 1;
  win.setInterval = () => 0;
  Object.defineProperty(win.navigator, "language", { value: locale === "zh" ? "zh-CN" : "en" });
  win.eval((await readFile(new URL("../src/i18n.js", import.meta.url), "utf8")).replace("export function createI18n", "function createI18n"));
  const listeners = []; const commands = [];
  win.chrome = { storage: { local: { get: async () => ({ "polaris-release-notice-version": "0.66.0" }), set: async () => {} } } };
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
  if (openChapters) [...win.document.querySelectorAll(".window-tab")].find((button) => button.textContent === (locale === "zh" ? "章节" : "Chapters")).click();
  if (deliverChapters) send({ type: "POLARIS_WINDOW_CHAPTERS", tabId: 7, routeKey: snapshot.routeKey, treeChapters: chapters, chapters });
  return { dom, win, send, commands, snapshot, chapters, transitions };
}
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
  [...s.win.document.querySelectorAll(".window-tab")].find((button) => button.textContent === "导航").click();
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
    assert.equal(range.getAttribute("aria-label"), "用户分组上限");
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
    assert.equal(s.win.document.querySelector(".platform-stack"), null);
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
    [...s.win.document.querySelectorAll(".window-tab")].find((button) => button.textContent === "Chapters").click();
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
    assert.equal(s.win.document.querySelector(".platform-stack"), null);

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
    assert.ok(s.win.document.querySelector(".platform-stack"));
    assert.equal(s.win.document.querySelector(".empty-title").textContent, "打开支持的 AI 对话");
  } finally { s.dom.window.close(); }
});
