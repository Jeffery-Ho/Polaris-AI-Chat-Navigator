import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

async function boot(windowType = "sidepanel", { locale = "zh", transitionApi = false, openChapters = true, deliverChapters = true, stallAnimationFrames = false } = {}) {
  const dom = new JSDOM(`<html data-window-type="${windowType}"><body><div id="polaris-window"></div></body></html>`, { url: "https://extension.test/sidepanel.html", runScripts: "outside-only", pretendToBeVisual: true });
  const win = dom.window;
  win.matchMedia = () => ({ matches: false, addEventListener() {} });
  win.scrollTo = () => {};
  win.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  win.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new win.Event("close")); };
  if (stallAnimationFrames) win.requestAnimationFrame = () => 1;
  win.setInterval = () => 0;
  win.PolarisI18n = { locale, t: (key) => key };
  const listeners = []; const commands = [];
  win.chrome = { storage: { local: { get: async () => ({ "polaris-release-notice-version": "0.66.0" }), set: async () => {} } } };
  const transitions = [];
  if (transitionApi) win.document.startViewTransition = (update) => {
    const updateCallbackDone = Promise.resolve().then(update);
    const transition = { updateCallbackDone, finished: updateCallbackDone, skipTransition() {} };
    transitions.push(transition);
    return transition;
  };
  win.chrome = { ...win.chrome, runtime: { getURL: (path) => `https://extension.test/${path}`, onMessage: { addListener(listener) { listeners.push(listener); } }, sendMessage: async (message) => { commands.push(message); return { ok: true }; }, getManifest: () => ({ version: "0.66.0" }) } };
  let source = await readFile(new URL("../src/window.js", import.meta.url), "utf8");
  for (const match of source.matchAll(/import\s+\{([^}]+)\}\s+from\s+"([^"]+)";/g)) {
    const exports = await import(new URL(`../src/${match[2].replace(/^\.\//, "")}`, import.meta.url));
    for (const name of match[1].split(",").map((name) => name.trim()).filter(Boolean)) win[name] = exports[name];
  }
  source = source.replace(/import\s+\{[^}]+\}\s+from\s+"[^"]+";/g, "").replace(/import\s+"[^"]+";/g, "");
  win.eval(source);
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

test("设置页可打开说明，后续会话快照不重建弹窗", async () => {
  const s = await boot("sidepanel", { openChapters: false });
  try {
    await Promise.resolve();
    s.win.document.querySelector(".window-settings-button").click();
    s.win.document.querySelector(".settings-release-notes").click();
    const dialog = s.win.document.querySelector("dialog[open]");
    assert.ok(dialog);
    s.send({ type: "POLARIS_WINDOW_STATE", tabId: 7, snapshot: { ...s.snapshot, revision: 2 } });
    assert.equal(s.win.document.querySelector("dialog[open]"), dialog);
    dialog.querySelector(".release-notice-acknowledge").click();
    assert.equal(s.win.document.activeElement, s.win.document.querySelector(".settings-release-notes"));
  } finally { s.dom.window.close(); }
});
