import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import { createContentLifecycle } from "../src/content-lifecycle.js";
import { attachVirtualList, virtualConversationHtml, virtualConversationTurns } from "./fixtures/chatgpt-virtual-conversation.js";

test("disposal removes page and Chrome listeners and cancels pending work", async () => {
  const dom = new JSDOM("<html><body></body></html>", { pretendToBeVisual: true });
  const listeners = new Set();
  const event = { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) };
  let calls = 0;
  const lifecycle = createContentLifecycle(dom.window);
  lifecycle.listen(dom.window, "resize", () => calls++);
  lifecycle.listenChrome(event, () => calls++);
  lifecycle.setTimeout(() => calls++, 0);
  lifecycle.requestAnimationFrame(() => calls++);
  assert.equal(listeners.size, 1);
  lifecycle.dispose();
  lifecycle.dispose();
  dom.window.dispatchEvent(new dom.window.Event("resize"));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(listeners.size, 0);
  assert.equal(calls, 0);
  assert.equal(lifecycle.setTimeout(() => calls++, 0), 0);
  dom.window.close();
});

test("an invalid Chrome event cannot prevent remaining resource cleanup", () => {
  const dom = new JSDOM("<html><body></body></html>");
  let calls = 0;
  const lifecycle = createContentLifecycle(dom.window);
  lifecycle.listen(dom.window, "resize", () => calls++);
  lifecycle.listenChrome({ addListener() {}, removeListener() { throw new Error("Extension context invalidated"); } }, () => {});
  lifecycle.dispose();
  dom.window.dispatchEvent(new dom.window.Event("resize"));
  assert.equal(calls, 0);
  dom.window.close();
});

test("route bridge can be disposed and reloaded without wrapping history twice", async () => {
  const dom = new JSDOM("<html><body></body></html>", { url: "https://chatgpt.com/", runScripts: "outside-only" });
  const source = await readFile(new URL("../public/src/route-bridge.js", import.meta.url), "utf8");
  const original = dom.window.history.pushState;
  let calls = 0;
  dom.window.addEventListener("polaris-for-web-route-change", () => calls++);
  dom.window.eval(source);
  dom.window.eval(source);
  dom.window.history.pushState({}, "", "/c/one");
  assert.equal(calls, 1);
  dom.window.dispatchEvent(new dom.window.Event("polaris-for-web-route-dispose"));
  assert.equal(dom.window.history.pushState, original);
  dom.window.eval(source);
  dom.window.history.pushState({}, "", "/c/two");
  assert.equal(calls, 2);
  dom.window.close();
});

async function bootPackagedContent({ delayConfig = false, pageUrl = "https://chatgpt.com/c/wxt-test", html, savedConfig } = {}) {
  const errors = [];
  const { VirtualConsole } = await import("jsdom");
  const console = new VirtualConsole();
  console.on("jsdomError", (error) => errors.push(error.message));
  console.on("error", (error) => errors.push(String(error)));
  const dom = new JSDOM(html || '<html><body><main><div data-message-author-role="user">Test prompt</div><div data-message-author-role="assistant"><div class="markdown"><h2>Test heading</h2><p>Test body</p></div></div></main></body></html>', {
    url: pageUrl, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: console
  });
  const win = dom.window;
  win.CSS = { escape: (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`) };
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.HTMLElement.prototype.getBoundingClientRect = () => ({ top: 0, bottom: 100, left: 0, right: 600, height: 100, width: 600 });
  win.HTMLElement.prototype.scrollTo = () => {};
  win.scrollTo = () => {};
  const event = () => {
    const listeners = new Set();
    return { listeners, addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) };
  };
  const runtime = event();
  const storage = event();
  const messages = [];
  const configWrites = [];
  const pendingConfigReads = [];
  const get = (_keys, callback) => {
    const result = { "polaris.makerSnapshotCleanup.v1": true,
      ...(savedConfig ? { "gpt-paragraph-nav-config": savedConfig } : {}) };
    callback?.(result);
    return Promise.resolve(result);
  };
  const manifest = JSON.parse(await readFile(new URL("../dist/manifest.json", import.meta.url), "utf8"));
  const source = await readFile(new URL(`../dist/${manifest.content_scripts[0].js[0]}`, import.meta.url), "utf8");
  win.chrome = {
    runtime: {
      id: "wxttest", getURL: (path) => `chrome-extension://wxttest/${path}`, getManifest: () => manifest,
      onMessage: runtime, sendMessage: async (message) => { messages.push(message); return { ok: true }; }
    },
    storage: {
      local: { get, set: async () => {}, remove: async () => {} },
      sync: { get: delayConfig ? (_keys, callback) => pendingConfigReads.push(callback) : get, set: async (value) => { configWrites.push(value); } },
      onChanged: storage
    }
  };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const inject = async () => { await win.eval(source); await flush(); };
  const invalidate = () => win.document.dispatchEvent(new win.CustomEvent("wxttest:content:wxt:content-script-started", {
    detail: { contentScriptName: "content", messageId: "test-disposal" }
  }));
  return { dom, win, runtime, storage, messages, errors, configWrites, pendingConfigReads, flush, inject, invalidate };
}

test("packaged long mode publishes readable batches without scrolling the website", async () => {
  const html = `<html><body><main>${Array.from({ length: 7 }, (_, i) =>
    `<article data-message-author-role="user" data-message-id="m${i}"><p>Loaded message ${i}</p></article>`).join("")}</main></body></html>`;
  const s = await bootPackagedContent({ savedConfig: { historyMode: "loaded" }, html });
  try {
    let clock = 0;
    s.win.performance.now = () => clock += 10;
    s.win.structuredClone = structuredClone;
    const scrolls = [];
    s.win.scrollTo = (...args) => scrolls.push(args);
    s.win.HTMLElement.prototype.scrollTo = (...args) => scrolls.push(args);
    s.win.HTMLElement.prototype.scrollIntoView = (...args) => scrolls.push(args);
    const main = s.win.document.querySelector("main"); main.scrollTop = 600;
    await s.inject();
    await new Promise(resolve => setTimeout(resolve, 160));
    const snapshots = s.messages.filter(message => message.type === "POLARIS_CONTENT_STATE").map(message => message.snapshot);
    const partial = snapshots.find(snapshot => snapshot.conversationLoading && snapshot.conversationIndex.count > 0 && snapshot.conversationIndex.count < 7);
    assert.ok(partial, "the packaged content must expose actual indexed messages while the remaining batch is processing");
    assert.ok(partial.markerItems.length > 0);
    assert.equal(partial.markerItems[0].title, "Loaded message 0");
    assert.equal(snapshots.at(-1).conversationIndex.count, 7);
    assert.equal(snapshots.at(-1).conversationLoading, false);
    assert.equal(main.scrollTop, 600);
    assert.deepEqual(scrolls, []);
    assert.deepEqual(s.errors, []);
  } finally { s.invalidate(); s.win.close(); }
});

test("refreshing in long mode waits for asynchronously mounted messages before reporting initial progress", async () => {
  const s = await bootPackagedContent({ savedConfig: { historyMode: "loaded" }, pageUrl: "https://chatgpt.com/share/refresh-progress", html: "<html><body><main></main></body></html>" });
  try {
    s.win.structuredClone = structuredClone;
    await s.inject();
    await new Promise(resolve => setTimeout(resolve, 160));
    const empty = s.messages.findLast(message => message.type === "POLARIS_CONTENT_STATE")?.snapshot;
    assert.equal(empty.config.historyMode, "loaded");
    assert.equal(empty.conversationIndex.count, 0);
    s.messages.length = 0;
    s.win.document.querySelector("main").innerHTML = Array.from({ length: 7 }, (_, i) =>
      `<article data-message-author-role="${i % 2 ? "assistant" : "user"}" data-message-id="m${i}"><div class="markdown"><p>Loaded message ${i}</p></div></article>`).join("");
    await new Promise(resolve => setTimeout(resolve, 160));
    const snapshots = s.messages.filter(message => message.type === "POLARIS_CONTENT_STATE").map(message => message.snapshot);
    assert.ok(snapshots.some(snapshot => snapshot.conversationLoading && snapshot.conversationIndex.progress?.total === 7),
      "the empty page shell must not consume the first real indexing progress after refresh");
    assert.equal(snapshots.at(-1).conversationIndex.count, 7);
    assert.equal(snapshots.at(-1).conversationLoading, false);
    assert.deepEqual(s.errors, []);
  } finally { s.invalidate(); s.win.close(); }
});

test("enabling long mode delivers initial progress before a small loaded batch completes", async () => {
  const html = `<html><body><main>${Array.from({ length: 7 }, (_, i) =>
    `<article data-message-author-role="${i % 2 ? "assistant" : "user"}" data-message-id="m${i}"><div class="markdown"><p>Loaded message ${i}</p></div></article>`).join("")}</main></body></html>`;
  const s = await bootPackagedContent({ savedConfig: { historyMode: "default" }, pageUrl: "https://chatgpt.com/share/progress-repro", html });
  try {
    s.win.structuredClone = structuredClone;
    await s.inject();
    await new Promise(resolve => setTimeout(resolve, 160));
    s.messages.length = 0;
    for (const listener of s.runtime.listeners) listener({ type: "POLARIS_WINDOW_COMMAND", command: "update-config", patch: { historyMode: "loaded" } }, {}, () => {});
    await new Promise(resolve => setTimeout(resolve, 160));
    const snapshots = s.messages.filter(message => message.type === "POLARIS_CONTENT_STATE").map(message => message.snapshot);
    assert.ok(snapshots.some(snapshot => snapshot.config.historyMode === "loaded" && snapshot.conversationLoading),
      "the sidepanel must receive loading even when all seven messages finish within one task");
    assert.equal(snapshots.at(-1).conversationLoading, false);
    assert.equal(snapshots.at(-1).conversationIndex.count, 7);
    assert.equal(snapshots.at(-1).conversationIndex.phase, "complete");
    s.messages.length = 0;
    s.win.document.querySelector(".markdown p").textContent = "Updated loaded message";
    await new Promise(resolve => setTimeout(resolve, 160));
    const updates = s.messages.filter(message => message.type === "POLARIS_CONTENT_STATE");
    assert.ok(updates.length);
    assert.ok(updates.every(message => !message.snapshot.conversationLoading), "later mutations must not show the initial cover again");
    assert.deepEqual(s.errors, []);
  } finally { s.invalidate(); s.win.close(); }
});

for (const historyMode of ["default", "loaded", "complete", "legacy-key"]) {
  test(`packaged content stays passive across startup, updates, commands and route changes (${historyMode})`, async () => {
    const s = await bootPackagedContent({ savedConfig: historyMode === "legacy-key" ? { chatgptHistoryMode: "complete" }
      : { historyMode, ...(historyMode === "loaded" ? { backfillConsent: "granted" } : {}) }, html: '<html><body><main style="overflow-y:auto"><article data-message-author-role="assistant" data-message-id="old"><div class="markdown"><h2>Original heading</h2></div></article></main><button id="earlier">Load earlier</button></body></html>' });
    try {
      s.win.structuredClone = structuredClone;
      const main = s.win.document.querySelector("main");
      Object.defineProperties(main, { scrollHeight: { value: 3000 }, clientHeight: { value: 500 } });
      main.scrollTop = 1800;
      const scrolls = []; const loads = []; const requests = [];
      const masked = [];
      main.scrollTo = (options) => {
        masked.push(main.style.opacity === "0" && Boolean(s.win.document.querySelector("[data-polaris-backfill]")));
        scrolls.push(options);
      };
      s.win.scrollTo = (options) => scrolls.push(options);
      s.win.HTMLElement.prototype.scrollIntoView = (options) => scrolls.push(options);
      s.win.document.querySelector("#earlier").addEventListener("click", () => loads.push(true));
      const originalFetch = s.win.fetch = (...args) => { requests.push(args); throw new Error("No conversation requests are allowed"); };
      const originalOpen = s.win.XMLHttpRequest.prototype.open = (...args) => requests.push(args);
      await s.inject();
      await new Promise((resolve) => setTimeout(resolve, 160));
      const latest = () => s.messages.findLast((message) => message.type === "POLARIS_CONTENT_STATE")?.snapshot;
      const first = latest();
      assert.equal(first.config.historyMode, ["complete", "legacy-key"].includes(historyMode) ? "loaded" : historyMode);
      assert.equal(first.conversationIndex.count, 1);
      const oldKey = first.markerItems.find((item) => item.title === "Original heading").markerKey;
      if (historyMode === "complete") assert.ok(s.configWrites.some((write) => write["gpt-paragraph-nav-config"]?.historyMode === "loaded"));
      const command = (values) => new Promise((resolve) => {
        for (const listener of s.runtime.listeners) listener({ type: "POLARIS_WINDOW_COMMAND", expectResult: true, ...values }, {}, resolve);
      });
      for (const listener of s.runtime.listeners) listener({ type: "POLARIS_WINDOW_REQUEST_STATE" }, {}, () => {});
      s.win.document.dispatchEvent(new s.win.Event("visibilitychange"));
      main.innerHTML = '<article data-message-author-role="assistant" data-message-id="new"><div class="markdown"><h2>Current heading</h2></div></article>';
      await new Promise((resolve) => setTimeout(resolve, 160));
      await command({ command: "retry-conversation-index" });
      const search = await command({ command: "search-conversation", query: "Original heading" });
      assert.equal(search.total, historyMode === "default" ? 0 : 1);
      const exported = await command({ command: "get-conversation-export" });
      assert.equal(exported.scope, "loaded");
      assert.equal(exported.messages.length, historyMode === "default" ? 1 : 2);
      const target = await command({ command: "jump-to-marker", markerKey: oldKey });
      assert.equal(target.ok, false);
      assert.equal(target.reason, historyMode === "default" ? "target-missing" : "not-mounted");
      const retained = await command({ command: "read-retained-message", markerKey: oldKey });
      assert.equal(retained.ok, historyMode !== "default");
      if (retained.ok) assert.ok(retained.chapter.contents.some(part => part.text === "Original heading"));
      const staleReset = await command({ command: "rebuild-conversation-index", generation: "old-generation" });
      assert.equal(staleReset.reason, "source-changed");
      assert.equal((await command({ command: "get-conversation-export" })).messages.length, historyMode === "default" ? 1 : 2);
      const rebuilt = await command({ command: "rebuild-conversation-index", generation: first.conversationIndex.generation });
      assert.equal(rebuilt.ok, true);
      assert.equal((await command({ command: "get-conversation-export" })).messages.length, 1);
      assert.equal((await command({ command: "read-retained-message", markerKey: oldKey })).ok, false);
      s.win.history.pushState({}, "", "/c/another");
      s.win.dispatchEvent(new s.win.Event("polaris-for-web-route-change"));
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.equal(latest().conversationIndex.count, 0, "the previous chat must stay cleared while the new page is still loading");
      main.innerHTML = '<article data-message-author-role="assistant" data-message-id="another"><div class="markdown"><h2>Next chat</h2></div></article>';
      for (let i = 0; i < 50 && latest()?.conversationIndex?.count !== 1; i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(latest().conversationIndex.count, 1);
      // The new chat runs its own masked backfill; let it settle.
      for (let i = 0; i < 150 && s.win.document.querySelector("[data-polaris-backfill]"); i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      // Long mode may scroll the website's own list, but only while it is
      // hidden beneath the backfill mask; Follow the page never scrolls it.
      // Without the user's backfill consent the website list is never scrolled.
      if (historyMode !== "loaded") assert.deepEqual(scrolls, []);
      else assert.ok(masked.length && masked.every(Boolean), "backfill must never scroll the visible list");
      assert.deepEqual(loads, []); assert.deepEqual(requests, []);
      assert.equal(main.scrollTop, 1800);
      assert.equal(main.style.opacity, "");
      assert.equal(s.win.document.querySelector("[data-polaris-backfill]"), null);
      assert.equal(s.win.fetch, originalFetch);
      assert.equal(s.win.XMLHttpRequest.prototype.open, originalOpen);
      assert.deepEqual(s.errors, []);
    } finally { s.invalidate(); s.win.close(); }
  });
}

test("packaged Kimi builds a structured index with files, images and final-answer Makers", async () => {
  const html = `<html><body><div class="chat-content-list">
    <div data-archer-id="u1" class="chat-content-item-user"><div class="segment segment-user">
      <div class="file-card-info"><div>历史记录</div><div class="file-card-info-detail"><span class="file-ext">MD</span><span class="file-size">56 KB</span></div></div>
      <div class="user-content__text">请确认记录</div><img src="https://cdn.test/upload.png" alt="上传图片"><div>Edit Copy Share</div>
    </div></div>
    <div data-archer-id="a1" class="chat-content-item-assistant"><div class="segment segment-assistant">
      <div class="thinking-container"><div class="markdown"><div class="paragraph"><strong>思考标题</strong></div></div></div>
      <div class="markdown-container"><div class="markdown"><div class="paragraph">回复前言</div><div class="paragraph"><strong>第一轮</strong></div><p>回答内容</p><img src="https://cdn.test/reply.png" alt="回复图片"></div></div>
    </div></div></div></body></html>`;
  const s = await bootPackagedContent({ pageUrl: "https://www.kimi.com/chat/one", html });
  try {
    s.win.structuredClone = structuredClone;
    await s.inject();
    for (let i = 0; i < 8; i++) await s.flush();
    const state = s.messages.findLast((message) => message.type === "POLARIS_CONTENT_STATE")?.snapshot;
    assert.equal(state.conversationIndex?.source, "dom");
    assert.equal(state.conversationIndex?.count, 2);
    assert.equal(state.conversationIndex?.coverage, "loaded");
    const user = state.markerItems.find((item) => item.type === "user");
    assert.equal(user.imageCount, 1);
    assert.equal(user.attachments[0].name, "历史记录");
    assert.doesNotMatch(user.title, /Edit|Copy|Share|56 KB/);
    assert.ok(state.markerItems.some((item) => item.title === "第一轮"));
    assert.ok(state.markerItems.some((item) => item.image));
    assert.ok(state.markerItems.every((item) => item.title !== "思考标题"));
    for (const listener of s.runtime.listeners) listener({ type: "POLARIS_WINDOW_COMMAND", command: "request-chapters" }, {}, () => {});
    const chapters = s.messages.findLast((message) => message.type === "POLARIS_WINDOW_CHAPTERS").treeChapters;
    assert.ok(chapters.every((node) => node.title !== "Full text"));
    assert.deepEqual(s.errors, []);
  } finally { s.invalidate(); s.dom.window.close(); }
});

for (const fixture of [
  { platform: "Claude", pageUrl: "https://claude.ai/chat/one", wrap: (card) => `<div data-cds="UserMessage"><h2 class="sr-only">You said</h2>${card}<div data-testid="user-message">请确认最后三轮对话</div><div role="toolbar"><span>2 hours ago</span><button>Copy</button></div></div>`, card: (name) => `<div data-cds="MessageAttachmentsFile" data-testid="file-thumbnail"><div data-cds="Card"><span data-cds="CardLink" role="button" title="${name}"><span class="sr-only">${name}</span></span><div><span title="${name}"><bdi>${name}</bdi></span><span data-cds="Badge"><span><bdi>MD</bdi></span></span></div></div></div>` },
  { platform: "Qwen", pageUrl: "https://www.qianwen.com/chat/one", wrap: (card) => `<div class="message-select-wrapper-question">${card}<div>请确认最后三轮对话</div></div>`, metadata: "56KB" },
  { platform: "DeepSeek", pageUrl: "https://chat.deepseek.com/a/chat/s/one", wrap: (card) => `<div class="ds-virtual-list-visible-items"><div data-virtual-list-item-key="0"><div class="ds-message">${card}<div class="ds-collapsible-text">请确认最后三轮对话</div></div></div></div>`, metadata: "MD 56.34KB" },
  { platform: "Doubao", pageUrl: "https://www.doubao.com/chat/one", wrap: (card) => `<div class="bg-g-send-msg-bubble-bg">${card}<div>请确认最后三轮对话</div></div>`, metadata: "Markdown" },
  { platform: "Grok", pageUrl: "https://grok.com/c/one", wrap: (card) => `<div data-testid="user-message"><h2 class="sr-only">You said</h2>${card}<p>请确认最后三轮对话</p></div>`, metadata: "" }
]) {
  test(`packaged ${fixture.platform} publishes clean attachment tags separately from the prompt`, async () => {
    const name = "分析高净值市场 (1).md";
    const card = fixture.card ? fixture.card(name) : fixture.metadata
      ? `<div><svg></svg><div><div>${name}</div><div>${fixture.metadata}</div></div></div>`
      : `<button><svg></svg><span>${name}</span></button>`;
    const s = await bootPackagedContent({ pageUrl: fixture.pageUrl, html: `<html><body>${fixture.wrap(card)}</body></html>` });
    try {
      s.win.structuredClone = structuredClone;
      await s.inject();
      for (let i = 0; i < 8; i++) await s.flush();
      const state = s.messages.findLast((message) => message.type === "POLARIS_CONTENT_STATE")?.snapshot;
      const user = state?.markerItems.find((item) => item.type === "user");
      assert.equal(user?.title, "请确认最后三轮对话");
      assert.deepEqual(Array.from(user.attachments, (file) => file.name), [name]);
      assert.deepEqual(s.errors, []);
    } finally { s.invalidate(); s.dom.window.close(); }
  });
}

test("settings pages stay free of the pick-a-chat notice", async () => {
  for (const pageUrl of ["https://chatgpt.com/settings", "https://chatgpt.com/settings/billing", "https://chatgpt.com/settings/account?tab=profile", "https://chat.openai.com/settings/billing/"]) {
    const s = await bootPackagedContent({ pageUrl });
    try {
      await s.inject();
      await s.flush();
      assert.equal(s.win.document.getElementById("polaris-conversation-notice"), null, pageUrl);
      assert.equal(s.win.document.getElementById("polaris-conversation-cover"), null, pageUrl);
      assert.equal(s.win.document.querySelector("main").hasAttribute("inert"), false, pageUrl);
      assert.equal(s.messages.findLast((item) => item.type === "POLARIS_CONTENT_STATE")?.snapshot.conversationAwaiting, false, pageUrl);
      assert.deepEqual(s.errors, []);
    } finally { s.invalidate(); s.dom.window.close(); }
  }
});

test("Gemini can replace its body while asynchronous content initialization is pending", async () => {
  const s = await bootPackagedContent({ delayConfig: true, pageUrl: "https://gemini.google.com/" });
  const observed = []; const Observer = s.win.MutationObserver;
  s.win.MutationObserver = class extends Observer {
    observe(target, options) { if (options.attributeFilter?.includes("src")) observed.push(target); return super.observe(target, options); }
  };
  try {
    await s.inject(); assert.equal(s.pendingConfigReads.length, 1);
    s.win.document.body.remove();
    s.pendingConfigReads[0]({}); await s.flush(); await s.flush();
    const body = s.win.document.createElement("body"); s.win.document.documentElement.append(body);
    await s.flush();
    assert.equal(s.runtime.listeners.size, 1); assert.deepEqual(s.errors, []);
    assert.ok(observed.some((target) => target.contains(body)), "the replacement body must stay inside the observed tree");
  } finally { s.invalidate(); s.dom.window.close(); }
});

test("a shared chat in Follow ChatGPT mode includes visible AI image labels alongside its text directory", async () => {
  const s = await bootPackagedContent({ pageUrl: "https://chatgpt.com/share/share-one" });
  try {
    s.win.document.querySelector('main [data-message-author-role="assistant"]').innerHTML = '<div class="markdown"><h2>Text heading</h2></div><img alt="Generated image 1" src="https://images.example.com/generated.png">';
    await s.inject();
    for (let i = 0; i < 30 && !s.messages.some((message) => message.type === "POLARIS_CONTENT_STATE"); i++) await s.flush();
    const snapshot = s.messages.findLast((message) => message.type === "POLARIS_CONTENT_STATE")?.snapshot;
    assert.ok(snapshot?.markerItems.some((item) => item.title === "Text heading"));
    assert.equal(snapshot?.markerItems.filter((item) => item.image).length, 1);
  } finally { s.invalidate(); s.dom.window.close(); }
});

test("image-only shared turns keep multiple labels without exposing user attachments or image URLs", async () => {
  const s = await bootPackagedContent({ pageUrl: "https://chatgpt.com/share/share-one" });
  try {
    s.win.document.querySelector("main").innerHTML = `<div data-testid="conversation-turn-0" data-turn="user"><h5 class="sr-only">You said:</h5><div class="group/user-message">Image question</div><img src="data:image/png;base64,cGl4ZWw="></div>
      <div data-testid="conversation-turn-1" data-turn="assistant"><h5 class="sr-only">ChatGPT said:</h5><img alt="First" src="https://images.example.com/one.png"><img alt="Second" src="https://images.example.com/two.png"><img hidden src="https://images.example.com/hidden.png"><span class="avatar"><img src="https://images.example.com/avatar.png"></span></div>`;
    await s.inject();
    for (let i = 0; i < 30 && !s.messages.some((message) => message.type === "POLARIS_CONTENT_STATE"); i++) await s.flush();
    const snapshot = s.messages.findLast((message) => message.type === "POLARIS_CONTENT_STATE")?.snapshot;
    const labels = snapshot.markerItems.filter((item) => item.image);
    assert.equal(labels.length, 2); assert.equal(new Set(labels.map((item) => item.markerKey)).size, 2);
    assert.doesNotMatch(JSON.stringify(labels), /images.example.com|hidden|avatar/);
  } finally { s.invalidate(); s.dom.window.close(); }
});

for (const theme of ["light", "dark"]) {
  for (const markup of ["legacy", "modern"]) {
    test(`on-page Maker jumps tint the whole ${markup} reply after scrolling (${theme})`, async () => {
      const s = await bootPackagedContent();
      try {
        const scrolls = [];
        s.win.HTMLElement.prototype.scrollIntoView = function (options) { scrolls.push({ element: this, ...options }); };
        const reply = s.win.document.querySelector('[data-message-author-role="assistant"]');
        reply.insertAdjacentHTML("beforeend", '<div class="markdown"><p>Another segment of this reply</p></div>');
        reply.insertAdjacentHTML("afterend", '<div data-message-author-role="user">Next question</div><div data-message-author-role="assistant"><div class="markdown"><p>Next reply</p></div></div>');
        if (markup === "modern") {
          reply.removeAttribute("data-message-author-role");
          reply.setAttribute("data-chatgpt-search-message-ids", "reply-id");
          for (const [index, segment] of [...reply.children].entries()) {
            segment.className = `MarkdownRoot-segment${index}`;
            segment.setAttribute("data-content-search-unit-key", `part-${index}:assistant`);
          }
        }
        reply.getBoundingClientRect = () => ({ top: 120, bottom: 620, left: 100, right: 700, width: 600, height: 500 });
        reply.querySelector("h2").getBoundingClientRect = () => ({ top: 150, bottom: 180, left: 100, right: 700, width: 600, height: 30 });
        await s.inject();
        const root = s.win.document.getElementById("gpt-paragraph-nav");
        root.dataset.pageTheme = theme;
        const marker = root.querySelector('.gpt-paragraph-nav__list [data-marker-item-type="ai"]');
        assert.ok(marker, "the packaged content renders a clickable Maker");
        marker.click();
        assert.equal(scrolls.at(-1).element, s.win.document.querySelector("main h2"));
        assert.equal(scrolls.at(-1).behavior, "smooth");
        const overlay = () => s.win.document.querySelector("[data-polaris-locate-flash]");
        assert.equal(overlay(), null, "no tint during the jump");
        await new Promise((resolve) => setTimeout(resolve, 220));
        assert.ok(overlay(), "the Maker target receives the shared highlight");
        assert.equal(overlay().style.top, "112px");
        assert.equal(overlay().style.left, "92px");
        assert.equal(overlay().style.width, "616px");
        assert.equal(overlay().style.height, "516px", "covers all reply segments, excluding adjacent turns");
        assert.equal(overlay().style.background, theme === "dark" ? "rgba(230, 154, 120, 0.12)" : "rgba(184, 92, 58, 0.08)");
        const previous = overlay();
        marker.click();
        assert.equal(previous.isConnected, false, "a repeated jump replaces the previous frame");
        assert.equal(overlay(), null);
        await new Promise((resolve) => setTimeout(resolve, 220));
        assert.ok(overlay());
        s.invalidate();
        await new Promise((resolve) => setTimeout(resolve, 160));
        assert.equal(overlay(), null, "disposing the content cancels the pending highlight");
        assert.deepEqual(s.errors, []);
      } finally { s.invalidate(); s.dom.window.close(); }
    });
  }
}

test("a long reply is tinted below the fixed header and inside the actual conversation scrollport", async () => {
  const s = await bootPackagedContent();
  try {
    s.win.HTMLElement.prototype.scrollIntoView = () => {};
    const main = s.win.document.querySelector("main");
    main.style.overflowY = "auto";
    Object.defineProperty(main, "scrollHeight", { value: 2000 });
    Object.defineProperty(main, "clientHeight", { value: 700 });
    main.getBoundingClientRect = () => ({ top: 0, bottom: 700, left: 0, right: 800, width: 800, height: 700 });
    const header = s.win.document.createElement("header");
    header.dataset.testid = "conversation-header";
    header.getBoundingClientRect = () => ({ top: 0, bottom: 96, left: 0, right: 800, width: 800, height: 96 });
    main.prepend(header);
    const reply = main.querySelector('[data-message-author-role="assistant"]');
    reply.getBoundingClientRect = () => ({ top: -300, bottom: 2000, left: 100, right: 700, width: 600, height: 2300 });
    reply.querySelector("h2").getBoundingClientRect = () => ({ top: 110, bottom: 140, left: 100, right: 700, width: 600, height: 30 });
    const scrolls = [];
    main.scrollTo = (options) => scrolls.push(options);
    await s.inject();
    s.win.document.querySelector('#gpt-paragraph-nav .gpt-paragraph-nav__list [data-marker-item-type="ai"]').click();
    assert.equal(scrolls.at(-1).top, 2, "the heading is aligned below the header with a 12px gap");
    assert.equal(s.win.document.querySelector("[data-polaris-locate-flash]"), null);
    await new Promise((resolve) => setTimeout(resolve, 220));
    const highlight = s.win.document.querySelector("[data-polaris-locate-flash]");
    assert.equal(highlight.style.top, "108px");
    assert.equal(highlight.style.height, "592px");
    assert.deepEqual(s.errors, []);
  } finally { s.invalidate(); s.dom.window.close(); }
});

test("production WXT entrypoint reloads with one UI and one set of Chrome listeners", async () => {
  const s = await bootPackagedContent();
  try {
    await s.inject();
    assert.equal(s.runtime.listeners.size, 1);
    assert.equal(s.storage.listeners.size, 1);
    assert.equal(s.win.document.querySelectorAll("#gpt-paragraph-nav").length, 1);
    assert.equal(s.win.PolarisI18n, undefined);
    await s.inject();
    assert.equal(s.runtime.listeners.size, 1);
    assert.equal(s.storage.listeners.size, 1);
    assert.equal(s.win.document.querySelectorAll("#gpt-paragraph-nav").length, 1);
    s.invalidate();
    const messages = s.messages.length;
    s.win.dispatchEvent(new s.win.Event("resize"));
    s.win.document.querySelector("h2").textContent = "Changed after disposal";
    await s.flush();
    assert.equal(s.runtime.listeners.size, 0);
    assert.equal(s.storage.listeners.size, 0);
    assert.equal(s.win.document.querySelector("#gpt-paragraph-nav"), null);
    assert.equal(s.win.document.querySelector("script[data-polaris-route-bridge]"), null);
    assert.equal(s.win.__POLARIS_CONTENT_SCRIPT_ACTIVE__, undefined);
    assert.equal(s.messages.length, messages);
    await s.inject();
    assert.equal(s.runtime.listeners.size, 1);
    assert.equal(s.win.document.querySelectorAll("#gpt-paragraph-nav").length, 1);
    assert.deepEqual(s.errors, []);
  } finally {
    s.invalidate();
    s.dom.window.close();
  }
});

test("invalidation while storage is pending cannot revive an old content instance", async () => {
  const s = await bootPackagedContent({ delayConfig: true });
  try {
    await s.inject();
    assert.equal(s.pendingConfigReads.length, 1);
    s.invalidate();
    s.pendingConfigReads[0]({});
    await s.flush();
    assert.equal(s.runtime.listeners.size, 0);
    assert.equal(s.storage.listeners.size, 0);
    assert.equal(s.win.document.querySelector("#gpt-paragraph-nav"), null);
    await s.inject();
    s.pendingConfigReads[1]({});
    await s.flush();
    assert.equal(s.runtime.listeners.size, 1);
    assert.equal(s.storage.listeners.size, 1);
    assert.equal(s.win.document.querySelectorAll("#gpt-paragraph-nav").length, 1);
    assert.deepEqual(s.errors, []);
  } finally {
    s.invalidate();
    s.dom.window.close();
  }
});

test("an image preview requested before invalidation cannot overwrite a new instance", async () => {
  const s = await bootPackagedContent();
  try {
    await s.inject();
    for (const listener of s.runtime.listeners) {
      listener({ type: "POLARIS_WINDOW_COMMAND", command: "request-image-preview" }, {}, () => {});
    }
    s.invalidate();
    await s.flush();
    assert.equal(s.messages.some((message) => message.type === "POLARIS_WINDOW_IMAGE"), false);
    await s.inject();
    for (const listener of s.runtime.listeners) {
      listener({ type: "POLARIS_WINDOW_COMMAND", command: "request-image-preview" }, {}, () => {});
    }
    await s.flush();
    assert.equal(s.messages.filter((message) => message.type === "POLARIS_WINDOW_IMAGE").length, 1);
    assert.deepEqual(s.errors, []);
  } finally {
    s.invalidate();
    s.dom.window.close();
  }
});

test("clipboard completion from an old instance cannot add a toast to a new overlay", async () => {
  const s = await bootPackagedContent();
  try {
    let resolveCopy;
    Object.defineProperty(s.win.navigator, "clipboard", { value: {
      writeText: () => new Promise((resolve) => { resolveCopy = resolve; })
    } });
    const openChapters = () => s.win.document.querySelector('[data-control-tab="chapters"]').click();
    await s.inject();
    openChapters();
    s.win.document.querySelector('[data-explosion-action="copy-full-text"]').click();
    assert.equal(typeof resolveCopy, "function");
    await s.inject();
    openChapters();
    resolveCopy();
    await s.flush();
    assert.equal(s.win.document.querySelectorAll(".gpt-paragraph-nav__copy-toast").length, 0);
    assert.deepEqual(s.errors, []);
  } finally {
    s.invalidate();
    s.dom.window.close();
  }
});

async function bootVirtualChat(pageUrl, savedConfig) {
  const s = await bootPackagedContent({ pageUrl, html: virtualConversationHtml(), savedConfig });
  s.win.structuredClone = structuredClone;
  const requests = [];
  s.win.fetch = (...args) => { requests.push(args); throw new Error("No conversation requests are allowed"); };
  s.win.XMLHttpRequest.prototype.open = (...args) => requests.push(args);
  const list = attachVirtualList(s.win, { turns: virtualConversationTurns() });
  return { ...s, list, requests };
}

test("packaged backfill renders a virtualized, image-heavy ChatGPT chat beneath a mask and restores the reader", async () => {
  const s = await bootVirtualChat("https://chatgpt.com/c/virtual-images", { historyMode: "loaded", backfillConsent: "granted" });
  try {
    const start = s.list.top();
    assert.ok(s.list.mounted() < 20, "the fixture starts with only the newest turns mounted");
    await s.inject();
    const latest = () => s.messages.findLast((message) => message.type === "POLARIS_CONTENT_STATE")?.snapshot;
    for (let i = 0; i < 300 && latest()?.conversationIndex?.backfill?.phase !== "done"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    const snapshot = latest();
    assert.equal(snapshot.conversationIndex.backfill?.phase, "done");
    // 40 questions and 40 answers, including image-only generation turns.
    assert.equal(snapshot.conversationIndex.count, 80, "remounted turns must not be indexed twice");
    const titles = snapshot.markerItems.map((item) => item.title);
    assert.ok(titles.includes("第 1 章 方案") && titles.includes("第 39 章 方案"), "both the oldest and newest answers are indexed");
    assert.equal(snapshot.conversationIndex.coverage, "loaded", "reaching both ends is not proof of complete history");
    assert.ok(s.list.scrolls.length > 10);
    assert.ok(s.list.scrolls.some((entry) => entry.top === 0), "older turns are rendered up to the top");
    assert.ok(s.list.scrolls.every((entry) => entry.masked), "the list is only ever moved beneath the mask");
    assert.equal(s.list.top(), start, "the reader's position is restored");
    assert.equal(s.list.scroller.style.opacity, "");
    assert.equal(s.win.document.querySelector("[data-polaris-backfill]"), null);
    assert.deepEqual(s.requests, []);
    assert.deepEqual(s.errors, []);
  } finally { s.invalidate(); s.win.close(); }
});

test("shared chats and undecided consent never backfill", async () => {
  for (const [url, config] of [
    ["https://chatgpt.com/share/virtual-images", { historyMode: "loaded", backfillConsent: "granted" }],
    ["https://chatgpt.com/c/virtual-images", { historyMode: "loaded" }],
    ["https://chatgpt.com/c/virtual-images", { historyMode: "loaded", backfillConsent: "declined" }]
  ]) {
    const s = await bootVirtualChat(url, config);
    try {
      await s.inject();
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.deepEqual(s.list.scrolls, [], `${url} ${config.backfillConsent || "undecided"}`);
      assert.equal(s.win.document.querySelector("[data-polaris-backfill]"), null);
      assert.ok(s.messages.findLast((message) => message.type === "POLARIS_CONTENT_STATE")?.snapshot.conversationIndex.count > 0);
    } finally { s.invalidate(); s.win.close(); }
  }
});
