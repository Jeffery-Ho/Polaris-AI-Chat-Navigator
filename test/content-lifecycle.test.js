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

async function bootPackagedContent({ delayConfig = false, pageUrl = "https://chatgpt.com/c/wxt-test" } = {}) {
  const errors = [];
  const { VirtualConsole } = await import("jsdom");
  const console = new VirtualConsole();
  console.on("jsdomError", (error) => errors.push(error.message));
  console.on("error", (error) => errors.push(String(error)));
  const dom = new JSDOM('<html><body><main><div data-message-author-role="user">Test prompt</div><div data-message-author-role="assistant"><div class="markdown"><h2>Test heading</h2><p>Test body</p></div></div></main></body></html>', {
    url: pageUrl, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: console
  });
  const win = dom.window;
  win.CSS = { escape: (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`) };
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

test("complete mode leaves ChatGPT settings pages free of the pick-a-chat notice", async () => {
  for (const pageUrl of ["https://chatgpt.com/settings", "https://chatgpt.com/settings/billing", "https://chatgpt.com/settings/account?tab=profile", "https://chat.openai.com/settings/billing/"]) {
    const s = await bootPackagedContent({ pageUrl });
    try {
      await s.inject();
      for (const listener of s.runtime.listeners) listener({ type: "POLARIS_WINDOW_COMMAND", command: "update-config", patch: { chatgptHistoryMode: "complete" } }, {}, () => {});
      await s.flush();
      assert.equal(s.win.document.getElementById("polaris-conversation-notice"), null, pageUrl);
      assert.equal(s.win.document.getElementById("polaris-conversation-cover"), null, pageUrl);
      assert.equal(s.win.document.querySelector("main").hasAttribute("inert"), false, pageUrl);
      assert.equal(s.messages.findLast((item) => item.type === "POLARIS_CONTENT_STATE")?.snapshot.conversationAwaiting, false, pageUrl);
      assert.deepEqual(s.errors, []);
    } finally { s.invalidate(); s.dom.window.close(); }
  }
});

test("home guidance is published only to the sidepanel and settings or chats clear its state", async () => {
  const s = await bootPackagedContent({ pageUrl: "https://chatgpt.com/" });
  const routeTo = async (path) => {
    s.win.history.pushState({}, "", path);
    s.win.dispatchEvent(new s.win.Event("polaris-for-web-route-change"));
    await s.flush();
  };
  try {
    await s.inject();
    for (const listener of s.runtime.listeners) listener({ type: "POLARIS_WINDOW_COMMAND", command: "update-config", patch: { chatgptHistoryMode: "complete" } }, {}, () => {});
    await s.flush();
    assert.equal(s.win.document.getElementById("polaris-conversation-notice"), null);
    const awaiting = () => s.messages.findLast((item) => item.type === "POLARIS_CONTENT_STATE")?.snapshot.conversationAwaiting;
    assert.equal(awaiting(), true);
    await routeTo("/settings/billing");
    assert.equal(s.win.document.getElementById("polaris-conversation-notice"), null);
    assert.equal(awaiting(), false);
    await routeTo("/");
    assert.equal(s.win.document.getElementById("polaris-conversation-notice"), null);
    assert.equal(awaiting(), true);
    await routeTo("/c/wxt-test");
    assert.equal(s.win.document.getElementById("polaris-conversation-notice"), null);
    assert.ok(s.win.document.getElementById("polaris-conversation-cover"), "existing native messages confirm the conversation before the API returns");
    assert.equal(s.messages.findLast((item) => item.type === "POLARIS_CONTENT_STATE")?.snapshot.conversationLoading, true, "background reading and sidepanel loading continue without the card");
    assert.equal(awaiting(), false);
    await routeTo("/settings/account");
    assert.equal(s.win.document.getElementById("polaris-conversation-notice"), null);
    assert.equal(s.win.document.getElementById("polaris-conversation-cover"), null);
    assert.equal(s.win.document.querySelector("main").hasAttribute("inert"), false);
    assert.equal(awaiting(), false);
    await routeTo("/c/wxt-test");
    assert.ok(s.win.document.getElementById("polaris-conversation-cover"));
    assert.equal(s.messages.findLast((item) => item.type === "POLARIS_CONTENT_STATE")?.snapshot.conversationLoading, true);
    assert.deepEqual(s.errors, []);
  } finally { s.invalidate(); s.dom.window.close(); }
});

test("packaged reading progress appears while native message elements are still mounting", async () => {
  const s = await bootPackagedContent();
  const commands = [];
  s.win.postMessage = (data) => commands.push(data);
  s.win.document.querySelector('main').replaceChildren();
  try {
    await s.inject();
    for (const listener of s.runtime.listeners) listener({ type: 'POLARIS_WINDOW_COMMAND', command: 'update-config', patch: { chatgptHistoryMode: 'complete' } }, {}, () => {});
    await s.flush();
    const bridge = s.win.document.querySelector('script[data-polaris-conversation-bridge]');
    assert.ok(bridge);
    bridge.dispatchEvent(new s.win.Event('load'));
    const requestId = commands.findLast(message => message.command === 'start')?.requestId;
    assert.ok(requestId);
    const send = async (event, fields = {}) => {
      s.win.dispatchEvent(new s.win.MessageEvent('message', { source: s.win, origin: s.win.location.origin, data: {
        type: 'polaris-conversation-index-result', conversationId: 'wxt-test', requestId, runId: 1, event, ...fields
      } }));
      await s.flush(); await s.flush();
    };
    await send('page', { payload: { title: 'Read before native rendering', messages: [
      { id: 'first', author: { role: 'assistant' }, content: { content_type: 'text', parts: ['## First message\nActual conversation content'] } }
    ], page_info: { has_previous_page: false, has_next_page: false } } });
    const snapshot = s.messages.findLast(message => message.type === 'POLARIS_CONTENT_STATE')?.snapshot;
    assert.equal(snapshot?.conversationIndex?.count, 1, 'conversation data has arrived');
    assert.ok(s.win.document.getElementById('polaris-conversation-cover'), 'read messages must show progress before native message nodes exist');
    await send('complete');
    assert.ok(s.win.document.getElementById('polaris-conversation-cover'), 'native preparation must remain visible after API completion');
    await send('native-state', { phase: 'ready' });
    assert.equal(s.win.document.getElementById('polaris-conversation-cover'), null);
    assert.deepEqual(s.errors, []);
  } finally { s.invalidate(); s.dom.window.close(); }
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
    assert.equal(snapshot?.config.chatgptHistoryMode, "default");
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
      payload: { messages: [{ id: "server-answer", author: { role: "assistant" }, content: { content_type: "text", parts: ["| 市场 | 财富 |\n| --- | --- |\n| 日本 | 10 |\n\n表格后的解释。"] } }], page_info: { has_previous_page: false, has_next_page: false } }
    } }));
    await s.flush(); await s.flush();
    const markerKey = "index:server-answer:0:0";
    const source = { generation: start.requestId, expectedRouteKey: s.win.location.href };
    command("request-chapters", source);
    const published = s.messages.findLast((item) => item.type === "POLARIS_WINDOW_CHAPTERS");
    assert.ok(published.treeChapters.some((node) => node.markerKey === "index:server-answer"));
    const body = command("get-index-chapter", { ...source, markerKey: "index:server-answer", expectResult: true });
    assert.equal(body.contents[0].ast.type, "table");
    assert.equal(command("get-conversation-export", { ...source, expectResult: true }).reason, "not-ready");
    s.win.dispatchEvent(new s.win.MessageEvent("message", { source: s.win, origin: s.win.location.origin, data: {
      type: "polaris-conversation-index-result", requestId: start.requestId, conversationId: start.conversationId, runId: 1, event: "complete"
    } }));
    await s.flush(); await s.flush();
    const exported = command("get-conversation-export", { ...source, expectResult: true });
    assert.equal(exported.ok, true);
    assert.equal(exported.scope, "complete");
    assert.match(exported.messages[0].markdown, /表格后的解释/);
    assert.equal(command("get-conversation-export", { ...source, generation: "stale", expectResult: true }).ok, false);
    assert.equal(s.win.document.querySelector('[data-message-id="server-answer"]'), null);
    const mounted = s.win.document.createElement("div");
    mounted.dataset.chatgptSearchMessageIds = "tool-id server-answer";
    mounted.innerHTML = '<div>Tool activity absent from the answer</div><div class="MarkdownRoot-first"><table><thead><tr><th>市场</th><th>财富</th></tr></thead><tbody><tr><td>日本</td><td>10</td></tr></tbody></table></div><div class="MarkdownRoot-last"><p>表格后的解释。</p></div>';
    mounted.getBoundingClientRect = () => ({ top: 120, bottom: 620, left: 100, right: 700, width: 600, height: 500 });
    mounted.querySelector("table").getBoundingClientRect = () => ({ top: 150, bottom: 250, left: 100, right: 700, width: 600, height: 100 });
    s.win.document.querySelector("main").append(mounted);
    const scrolls = [];
    s.win.HTMLElement.prototype.scrollIntoView = function () { scrolls.push(this); };
    command("jump-to-marker", { ...source, markerKey, expectResult: true });
    await s.flush();
    assert.equal(scrolls.at(-1), mounted.querySelector("table"));
    assert.equal(s.win.document.querySelector("[data-polaris-locate-flash]"), null, "wait for scroll settling before painting");
    await new Promise((resolve) => setTimeout(resolve, 220));
    const highlight = s.win.document.querySelector("[data-polaris-locate-flash]");
    assert.ok(highlight, "the sidepanel runtime command paints the mounted indexed reply");
    assert.equal(highlight.style.top, "112px");
    assert.equal(highlight.style.height, "516px", "includes the rest of the reply after the table");
    const replacement = mounted.cloneNode(true);
    replacement.getBoundingClientRect = () => ({ top: 220, bottom: 620, left: 100, right: 700, width: 600, height: 400 });
    mounted.replaceWith(replacement);
    await new Promise((resolve) => setTimeout(resolve, 220));
    assert.equal(highlight.style.top, "212px", "a remounted target resolves the whole reply again");
    assert.equal(highlight.style.height, "416px");
    assert.deepEqual(s.errors, []);
  } finally { s.invalidate(); s.dom.window.close(); }
});

for (const pageUrl of ["https://chatgpt.com/c/wxt-test", "https://chatgpt.com/share/share-one"]) {
  test(`full indexed TOC includes every user group without an earlier-groups summary: ${new URL(pageUrl).pathname}`, async () => {
    const s = await bootPackagedContent({ pageUrl });
    try {
      const posted = []; s.win.postMessage = (data) => posted.push(data);
      s.win.fetch = () => { throw new Error("Image labels must not request resources"); };
      await s.inject();
      const command = (name, fields = {}) => {
        for (const listener of s.runtime.listeners) listener({ type: "POLARIS_WINDOW_COMMAND", command: name, ...fields }, {}, () => {});
      };
      command("update-config", { patch: { chatgptHistoryMode: "complete", maxVisibleUserGroups: 1 } });
      s.win.document.querySelector('[data-polaris-conversation-bridge]').dispatchEvent(new s.win.Event("load"));
      const start = posted.findLast((item) => item.command === "start"); assert.ok(start);
      const send = async (event, fields = {}) => {
        s.win.dispatchEvent(new s.win.MessageEvent("message", { source: s.win, origin: s.win.location.origin, data: {
          type: "polaris-conversation-index-result", requestId: start.requestId, conversationId: start.conversationId, runId: 1, event, ...fields
        } }));
        await s.flush(); await s.flush();
      };
      const messages = Array.from({ length: 179 }, (_, i) => [
        { id: `u-${i}`, author: { role: "user" }, content: { content_type: "multimodal_text", parts: [
          { content_type: "image_asset_pointer", asset_pointer: `sediment://user_file_${i}` }, `Question ${i}`
        ] } },
        { id: `a-${i}`, author: { role: "assistant" }, content: { content_type: "multimodal_text", parts: [0, 1].map((n) => ({
          content_type: "image_asset_pointer", asset_pointer: `sediment://file_${i}_${n}`
        })) } }
      ]).flat();
      await send("page", { payload: { messages, page_info: { has_previous_page: false, has_next_page: false } }, replace: true });
      await send("native-state", { phase: "ready" }); await send("complete", { source: new URL(pageUrl).pathname.startsWith("/share/") ? "shared" : "native" });
      const snapshot = () => s.messages.findLast((message) => message.type === "POLARIS_CONTENT_STATE")?.snapshot;
      const items = snapshot().markerItems;
      assert.equal(snapshot().conversationIndex.phase, "complete");
      assert.equal(items.filter((item) => item.type === "user").length, 179);
      assert.equal(items.filter((item) => item.image).length, 358);
      assert.equal(items.some((item) => item.type === "earlier"), false);
      assert.match(items.find((item) => item.type === "user").title, /^\[Image\]/);
      assert.equal(items.some((item) => item.title.includes("[Attachment]")), false);
      assert.deepEqual(Array.from(items.filter((item) => item.type === "user"), (item) => item.groupKey), Array.from({ length: 179 }, (_, i) => `index:u-${i}`));
      command("toggle-user-group", { groupKey: "index:u-0" }); await s.flush();
      assert.equal(snapshot().markerItems.filter((item) => item.type === "user").length, 179);
      assert.equal(snapshot().markerItems.filter((item) => item.image).length, 356, "only the explicitly folded question hides its image labels");
      command("toggle-user-group", { groupKey: "index:u-0" }); await s.flush();
      assert.equal(snapshot().markerItems.filter((item) => item.image).length, 358);
      const generation = snapshot().conversationIndex.generation;
      const before = posted.length;
      Object.defineProperty(s.win.document, "visibilityState", { configurable: true, value: "hidden" });
      s.win.document.dispatchEvent(new s.win.Event("visibilitychange")); await s.flush();
      s.win.dispatchEvent(new s.win.PageTransitionEvent("pagehide", { persisted: true })); await s.flush();
      Object.defineProperty(s.win.document, "visibilityState", { configurable: true, value: "visible" });
      s.win.document.dispatchEvent(new s.win.Event("visibilitychange")); await s.flush();
      assert.equal(snapshot().conversationIndex.generation, generation);
      assert.equal(snapshot().conversationIndex.phase, "complete");
      assert.equal(posted.slice(before).some((item) => ["stop", "disarm", "start"].includes(item.command)), false);
      assert.deepEqual(s.errors, []);
    } finally { s.invalidate(); s.dom.window.close(); }
  });
}

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
