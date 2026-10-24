import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import { createContentLifecycle } from "../src/content-lifecycle.js";

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

async function bootPackagedContent({ delayConfig = false } = {}) {
  const errors = [];
  const { VirtualConsole } = await import("jsdom");
  const console = new VirtualConsole();
  console.on("jsdomError", (error) => errors.push(error.message));
  console.on("error", (error) => errors.push(String(error)));
  const dom = new JSDOM('<html><body><main><div data-message-author-role="user">Test prompt</div><div data-message-author-role="assistant"><div class="markdown"><h2>Test heading</h2><p>Test body</p></div></div></main></body></html>', {
    url: "https://chatgpt.com/c/wxt-test", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: console
  });
  const win = dom.window;
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  win.ResizeObserver = class { observe() {} disconnect() {} };
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
  const pendingConfigReads = [];
  const get = (_keys, callback) => {
    const result = { "polaris.makerSnapshotCleanup.v1": true };
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
      sync: { get: delayConfig ? (_keys, callback) => pendingConfigReads.push(callback) : get, set: async () => {} },
      onChanged: storage
    }
  };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const inject = async () => { await win.eval(source); await flush(); };
  const invalidate = () => win.document.dispatchEvent(new win.CustomEvent("wxttest:content:wxt:content-script-started", {
    detail: { contentScriptName: "content", messageId: "test-disposal" }
  }));
  return { dom, win, runtime, storage, messages, errors, pendingConfigReads, flush, inject, invalidate };
}

test("packaged content keeps indexed body data available without native history mounted", async () => {
  const s = await bootPackagedContent();
  try {
    const posted = [];
    s.win.postMessage = (data) => posted.push(data);
    await s.inject();
    const command = (name, fields = {}) => {
      let response;
      for (const listener of s.runtime.listeners) listener({ type: "POLARIS_WINDOW_COMMAND", command: name, ...fields }, {}, (value) => { response = value; });
      return response;
    };
    command("update-config", { patch: { chatgptHistoryMode: "complete" } });
    command("request-state");
    s.win.document.querySelector('[data-polaris-conversation-bridge]').dispatchEvent(new s.win.Event("load"));
    const start = posted.find((item) => item.command === "start");
    assert.ok(start);
    s.win.dispatchEvent(new s.win.MessageEvent("message", { source: s.win, origin: s.win.location.origin, data: {
      type: "polaris-conversation-index-result", requestId: start.requestId, conversationId: start.conversationId, runId: 1, event: "page",
      payload: { messages: [{ id: "server-answer", author: { role: "assistant" }, content: { content_type: "text", parts: ["| 市场 | 财富 |\n| --- | --- |\n| 日本 | 10 |"] } }], page_info: { has_previous_page: false, has_next_page: false } }
    } }));
    await s.flush(); await s.flush();
    const markerKey = "index:server-answer:0:0";
    const source = { generation: start.requestId, expectedRouteKey: s.win.location.href };
    command("request-chapters", source);
    const published = s.messages.findLast((item) => item.type === "POLARIS_WINDOW_CHAPTERS");
    assert.ok(published.treeChapters.some((node) => node.markerKey === "index:server-answer"));
    const body = command("get-index-chapter", { ...source, markerKey: "index:server-answer", expectResult: true });
    assert.equal(body.contents[0].ast.type, "table");
    assert.equal(s.win.document.querySelector('[data-message-id="server-answer"]'), null);
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
