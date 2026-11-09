import { createIndexReadCooldown } from "../public/src/index-read-cooldown.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { JSDOM } from "jsdom";
import { createChatGptNativeNavigation } from "../public/src/chatgpt-native-navigation.js";
import { createChatGptIndexController } from "../src/chatgpt-index-controller.js";
import { conversationReadingState } from "../src/conversation-reading-state.js";
import { publicImageMessage } from "../public/src/chatgpt-image-data.js";
import { imagePage, imageMessage, imagePart, sharedData, sharedHtml, sharedImagePayload, sharedReloadData } from "./fixtures/chatgpt-images.js";
import { readSharedConversationHtml, loadSharedConversation } from "../public/src/chatgpt-shared-conversation.js";

const source = (await readFile(new URL("../public/src/chatgpt-index-bridge.js", import.meta.url), "utf8")).replace(/^import .*\n/gm, "");
const message = (id) => ({ id, author: { role: "user" }, content: { content_type: "text", parts: [id] } });
const page = (ids, previous, next, cursor = ids[0]) => ({ conversation_id: "one", title: "测试标题", messages: ids.map(message), page_info: { start_cursor: cursor, has_previous_page: previous, has_next_page: next } });
async function boot(handler, navigationFactory = createChatGptNativeNavigation) {
  const dom = new JSDOM("<html><head></head><body></body></html>", { url: "https://chatgpt.com/c/one", runScripts: "outside-only" });
  const win = dom.window; const calls = []; const events = [];
  Object.assign(win, { createIndexReadCooldown, Headers, Request, AbortController, publicImageMessage, readSharedConversationHtml, loadSharedConversation, createChatGptNativeNavigation: navigationFactory });
  const original = async (url, init) => {
    calls.push({ url: String(url), init });
    if (url === "/api/auth/session") return Response.json({ user: { id: "test-user" }, accessToken: "test-only" });
    return handler(String(url), init, calls);
  };
  win.fetch = original; win.postMessage = (event) => events.push(event);
  win.eval(source);
  const command = (command, extra = {}) => win.dispatchEvent(new win.MessageEvent("message", { source: win, origin: win.location.origin,
    data: { type: "polaris-conversation-index-command", command, requestId: "run", conversationId: "one", ...extra } }));
  const finish = () => { win.dispatchEvent(new win.Event("polaris-conversation-index-dispose")); dom.window.close(); };
  return { win, calls, events, command, original, finish };
}
async function settled(s, turns = 50) {
  for (let i = 0; i < turns && !s.events.some((item) => ["complete", "error"].includes(item.event)); i++) await new Promise((resolve) => setTimeout(resolve, 2));
}

test("a late shared loader response cannot publish images after its source changes", async () => {
  let release;
  const s = await boot(() => new Promise((resolve) => { release = resolve; }));
  try {
    s.win.history.replaceState({}, "", "/share/share-one"); s.command("start", { conversationId: "share-one" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    s.win.history.replaceState({}, "", "/share/another-share"); s.command("stop", { conversationId: "share-one" });
    release(new Response(sharedData(sharedImagePayload())));
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(s.events.some((event) => ["page", "complete"].includes(event.event)), false);
    assert.equal(s.calls.length, 1);
  } finally { s.finish(); }
});

test("shared chats read the full server snapshot without loading native history or scanning mounted messages", async () => {
  const s = await boot((url) => {
    if (url.startsWith("/share/share-one.data?")) return new Response(sharedData(sharedImagePayload()), { headers: { "content-type": "text/x-script" } });
    throw new Error(`Unexpected request: ${url}`);
  }, () => ({ invalidate() {}, async prepare() { throw new Error("Shared chats must not use the private conversation loader"); } }));
  try {
    s.win.history.replaceState({}, "", "/share/share-one");
    s.command("start", { conversationId: "share-one" }); await settled(s);
    assert.equal(s.events.at(-1).event, "complete"); assert.equal(s.events.at(-1).source, "shared");
    const data = s.events.find((event) => event.event === "page").payload;
    assert.equal(data.current_node, "picture"); assert.ok(data.mapping.picture.message.content.parts[0].asset_pointer);
    assert.equal(data.mapping.alternate, undefined);
    assert.equal(s.calls.length, 1); assert.ok(s.calls[0].url.startsWith("/share/share-one.data?"));
    assert.equal(s.calls.some((call) => call.url === "/api/auth/session"), false);
  } finally { s.finish(); }
});

test("the browser's reload-only route reaches the shared index and releases the sidepanel loading state", async () => {
  const s = await boot((url) => {
    if (url.startsWith("/share/share-one.data?")) return new Response(sharedReloadData, { status: 202 });
    if (url === "/backend-api/share/share-one") return Response.json(sharedImagePayload());
    throw new Error(`Unexpected request: ${url}`);
  }, () => ({ invalidate() {}, prepare() { throw new Error("Shared chats cannot use private history"); } }));
  s.win.history.replaceState({}, "", "/share/share-one");
  const controller = createChatGptIndexController({ window: s.win, bridgeUrl: "https://example.invalid/bridge.js", onChange() {} });
  s.win.postMessage = (data) => {
    if (data.type === "polaris-conversation-index-result") s.events.push(data);
    queueMicrotask(() => s.win.dispatchEvent(new s.win.MessageEvent("message", { source: s.win, origin: s.win.location.origin, data })));
  };
  try {
    controller.configure(true); s.win.document.querySelector('script[src]').dispatchEvent(new s.win.Event("load"));
    await settled(s); await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(controller.snapshot().phase, "complete"); assert.equal(controller.snapshot().count, 2);
    assert.equal(controller.snapshot().native.phase, "ready"); assert.equal(conversationReadingState(controller.snapshot()).loading, false);
    assert.equal(controller.outline().items.filter((item) => item.image).length, 1);
    assert.equal(s.calls.length, 3);
    assert.equal(s.calls.some((call) => /^\/backend-api\/conversations?\//.test(call.url)), false);
    assert.equal(s.win.document.querySelector("img"), null);
  } finally { controller.dispose(); await Promise.resolve(); s.finish(); }
});

test("a late authenticated share response cannot replace a different share's current branch", async () => {
  let release;
  const s = await boot((url) => url.includes(".data?") ? new Response(sharedReloadData, { status: 202 }) : new Promise((resolve) => { release = resolve; }));
  try {
    s.win.history.replaceState({}, "", "/share/share-one"); s.command("start", { conversationId: "share-one" });
    for (let i = 0; i < 20 && !release; i++) await new Promise((resolve) => setTimeout(resolve, 1));
    assert.equal(typeof release, "function");
    s.win.history.replaceState({}, "", "/share/another-share"); s.command("stop", { conversationId: "share-one" });
    release(Response.json(sharedImagePayload())); await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(s.events.some((event) => ["page", "complete"].includes(event.event)), false);
    assert.equal(s.calls.length, 3);
  } finally { s.finish(); }
});

test("an indexed share image asks the host to mount its message without fetching the image", async () => {
  const reveals = [];
  const s = await boot(() => new Response(sharedData(sharedImagePayload())), ({ window: win }) => ({
    invalidate() {}, async reveal(id, options) {
      reveals.push({ id, ...options });
      const main = win.document.querySelector("main");
      main.innerHTML = `<article data-chatgpt-search-message-ids="picture"><button>Generated image</button></article>`;
      return { ok: true };
    }
  }));
  s.win.history.replaceState({}, "", "/share/share-one"); s.win.document.body.innerHTML = "<main></main>";
  const controller = createChatGptIndexController({ window: s.win, bridgeUrl: "https://example.invalid/bridge.js", onChange() {} });
  s.win.postMessage = (data) => {
    if (data.type === "polaris-conversation-index-result") s.events.push(data);
    queueMicrotask(() => s.win.dispatchEvent(new s.win.MessageEvent("message", { source: s.win, origin: s.win.location.origin, data })));
  };
  try {
    controller.configure(true); s.win.document.querySelector('script[src]').dispatchEvent(new s.win.Event("load"));
    await settled(s); await new Promise((resolve) => setTimeout(resolve, 10));
    const image = controller.outline().items.find((item) => item.image);
    const result = await controller.ensureLocation(image.markerKey, {}, { instant: true });
    assert.ok(result.element);
    assert.equal(result.element, s.win.document.querySelector("main article"));
    assert.equal(reveals.length, 1); assert.equal(reveals[0].id, "share-one"); assert.equal(reveals[0].messageId, "picture");
    assert.equal(reveals[0].instant, true); assert.equal(s.calls.length, 1);
    assert.equal(s.win.document.querySelector("img"), null);
  } finally { controller.dispose(); await Promise.resolve(); s.finish(); }
});

test("shared image navigation cancels an earlier reveal and stops on a source switch", async () => {
  const signals = [];
  const s = await boot(() => new Response(sharedData(sharedImagePayload())), () => ({
    invalidate() {}, reveal(_id, { signal }) {
      signals.push(signal);
      return new Promise((resolve) => signal.addEventListener("abort", () => resolve({ ok: false, reason: "source-changed" }), { once: true }));
    }
  }));
  try {
    s.win.history.replaceState({}, "", "/share/share-one"); s.command("start", { conversationId: "share-one" }); await settled(s);
    s.command("reveal", { conversationId: "share-one", navigationId: "first", messageId: "picture" });
    s.command("reveal", { conversationId: "share-one", navigationId: "second", messageId: "another" });
    assert.equal(signals[0].aborted, true); assert.equal(signals[1].aborted, false);
    s.command("cancel-reveal", { conversationId: "share-one", navigationId: "first" });
    assert.equal(signals[1].aborted, false);
    s.command("cancel-reveal", { conversationId: "share-one", navigationId: "second" });
    assert.equal(signals[1].aborted, true);
    s.command("reveal", { conversationId: "share-one", navigationId: "third", messageId: "picture" });
    s.win.history.replaceState({}, "", "/share/another-share"); s.command("stop", { conversationId: "share-one" });
    assert.equal(signals[2].aborted, true);
  } finally { s.finish(); }
});

test("an unreadable share refetch falls back to the matching server snapshot already received by the page", async () => {
  const s = await boot(() => new Response("<html><body>Client application shell</body></html>"));
  s.win.history.replaceState({}, "", "/share/share-one");
  s.win.document.body.innerHTML = sharedHtml(sharedImagePayload());
  const controller = createChatGptIndexController({ window: s.win, bridgeUrl: "https://example.invalid/bridge.js", onChange() {
  } });
  s.win.postMessage = (data) => {
    if (data.type === "polaris-conversation-index-result") s.events.push(data);
    queueMicrotask(() => s.win.dispatchEvent(new s.win.MessageEvent("message", { source: s.win, origin: s.win.location.origin, data })));
  };
  try {
    controller.configure(true);
    s.win.document.querySelector('script[src]').dispatchEvent(new s.win.Event("load"));
    await settled(s); await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(controller.snapshot().phase, "complete");
    assert.equal(controller.snapshot().native.phase, "ready");
    assert.equal(controller.snapshot().count, 2);
    assert.equal(controller.outline().items.filter((item) => item.image).length, 1);
    assert.equal(conversationReadingState(controller.snapshot()).loading, false);
    assert.equal(s.win.document.querySelector('[data-message-author-role], img'), null, "server reading must not require mounted replies or download images");
    assert.equal(s.calls.length, 2); assert.equal(s.calls[1].url, "/share/share-one");
  } finally { controller.dispose(); await Promise.resolve(); s.finish(); }
});

test("a share fallback never reads a server snapshot belonging to a different route", async () => {
  const s = await boot(() => new Response("<html>Client application shell</html>"), () => ({ invalidate() {} }));
  try {
    const other = sharedImagePayload(); other.conversation_id = "another-share";
    s.win.document.body.innerHTML = sharedHtml(other);
    s.win.history.replaceState({}, "", "/share/share-one");
    s.command("start", { conversationId: "share-one" }); await settled(s);
    assert.equal(s.events.at(-1).event, "error");
    assert.equal(s.events.some((event) => ["page", "complete"].includes(event.event)), false);
  } finally { s.finish(); }
});

test("visible image metadata crosses the bridge while obsolete download commands do nothing", async () => {
  const payload = imagePage([imageMessage("picture", { content: { content_type: "multimodal_text", parts: [imagePart("one", { metadata: { prompt: "private" }, download_url: "temporary" }), "private tool text"] } }),
    imageMessage("hidden", { metadata: { is_visually_hidden_from_conversation: true } })]);
  const s = await boot(() => { throw new Error("No image endpoints should be requested"); }, () => ({ invalidate() {}, async prepare() { return { ok: true, payload }; } }));
  try {
    s.command("start"); await settled(s);
    const exposed = s.events.find((event) => event.event === "page").payload;
    assert.equal(exposed.messages.length, 1); assert.equal(exposed.messages[0].author.role, "assistant");
    assert.doesNotMatch(JSON.stringify(exposed), /private|temporary/);
    const before = s.calls.length;
    s.command("resolve-index-image", { imageRequestId: "old-client", source: "sediment://file_one", scope: "" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(s.calls.length, before); assert.equal(s.events.some((event) => event.event === "index-image"), false);
  } finally { s.finish(); }
});

test("late native conversation reads do not reopen completed reading progress", async () => {
  let preparations = 0;
  let payload = page(["a", "b"], false, false);
  const s = await boot(() => Response.json(payload), () => ({
    invalidate() {}, async prepare() { preparations++; return { ok: true, payload }; }
  }));
  s.win.document.body.innerHTML = "<main></main>";
  let reopened = 0; let initiallyReady = false; let wasShowing = false;
  const controller = createChatGptIndexController({ window: s.win, bridgeUrl: "https://example.invalid/bridge.js", onChange() {
    if (initiallyReady && conversationReadingState(controller.snapshot()).loading && !wasShowing) reopened++;
    wasShowing = conversationReadingState(controller.snapshot()).loading;
  } });
  s.win.postMessage = (data) => {
    if (data.type === "polaris-conversation-index-result") s.events.push(data);
    queueMicrotask(() => s.win.dispatchEvent(new s.win.MessageEvent("message", { source: s.win, origin: s.win.location.origin, data })));
  };
  try {
    controller.configure(true);
    s.win.document.querySelector("script").dispatchEvent(new s.win.Event("load"));
    await settled(s); await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(controller.snapshot().phase, "complete");
    assert.equal(conversationReadingState(controller.snapshot()).loading, false);
    initiallyReady = true;
    for (let read = 0; read < 3; read++) {
      await s.win.fetch("/backend-api/conversations/one?num_turns=50");
      await new Promise((resolve) => setTimeout(resolve, 650));
    }
    assert.equal(reopened, 0, "already readable content must not be covered again by native GET responses");
    assert.equal(preparations, 1, "opening the conversation must prepare the native list only once");
    assert.equal(s.events.filter((event) => event.event === "page").length, 1, "identical refetches must not rebuild the index");
    payload = page(["replacement"], false, false);
    await s.win.fetch("/backend-api/conversations/one?num_turns=50");
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(controller.snapshot().count, 1, "a changed full snapshot removes the previous branch");
    assert.equal((await controller.search("replacement")).total, 1);
    payload.messages[0].content.parts = ["Edited content"];
    await s.win.fetch("/backend-api/conversations/one?num_turns=50");
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal((await controller.search("Edited content")).total, 1);
    assert.equal((await controller.search("replacement")).total, 0);
    assert.equal(reopened, 0, "changed complete snapshots must commit without reopening the cover");
    assert.equal(preparations, 1);
  } finally { controller.dispose(); await Promise.resolve(); s.finish(); }
});

test("returning to a completed conversation reuses the full branch without repeating native preparation", async () => {
  let preparations = 0;
  const s = await boot(() => { throw new Error("Polaris must not request history when the native snapshot is complete"); }, () => ({
    invalidate() {},
    async prepare() { preparations++; return { ok: true, payload: page(["old", "latest"], false, false) }; }
  }));
  try {
    for (let open = 0; open < 2; open++) {
      s.win.history.replaceState({}, "", "/c/one");
      s.events.length = 0; s.command("start"); await settled(s);
      assert.equal(s.events.at(-1).event, "complete");
      assert.equal(s.events.at(-1).source, "native");
      assert.equal(s.events.at(-1).historicalRequests, 0);
      assert.equal(s.events.find((event) => event.event === "page").reconcile, true);
      assert.equal(s.events.find((event) => event.event === "native-state" && event.phase === "ready").phase, "ready");
      s.command("stop");
      s.win.history.replaceState({}, "", "/c/other");
    }
    assert.equal(preparations, 1);
    assert.deepEqual(s.calls.map((call) => call.url), ["/api/auth/session"]);
  } finally { s.finish(); }
});

test("partial native responses and completed edits still request a fresh complete snapshot", async () => {
  let preparations = 0;
  const s = await boot(() => Response.json(page(["latest"], true, false)), () => ({
    invalidate() {}, async prepare() { preparations++; return { ok: true, payload: page(["old", "latest"], false, false) }; }
  }));
  try {
    s.command("start"); await settled(s);
    for (const [url, method] of [["/backend-api/conversations/one", "GET"], ["/backend-api/conversations/one", "PATCH"], ["/backend-api/conversation", "POST"]]) {
      const before = preparations;
      await s.win.fetch(url, { method });
      await new Promise((resolve) => setTimeout(resolve, 650));
      assert.equal(preparations, before + 1, `${method} must still reconcile changes from a fresh full snapshot`);
      assert.equal(s.events.at(-1).event, "complete");
      assert.equal(s.events.filter((event) => event.event === "page").at(-1).payload.messages.length, 2, "a partial response must not truncate history");
    }
  } finally { s.finish(); }
});

test("a workspace change rechecks identity before publishing even an identical complete response", async () => {
  let account = "first-workspace"; let preparations = 0;
  const payload = page(["a"], false, false);
  const s = await boot(() => Response.json(payload), ({ window: win }) => ({
    invalidate() {}, async prepare() {
      preparations++;
      await win.fetch("/backend-api/conversations/one/messages", { headers: { "chatgpt-account-id": account } });
      return { ok: true, payload };
    }
  }));
  Object.defineProperty(s.win.crypto, "subtle", { value: webcrypto.subtle });
  s.win.TextEncoder = TextEncoder;
  try {
    s.command("start"); await settled(s);
    const previous = s.events.find((event) => event.event === "page").scope;
    assert.match(previous, /^[a-f0-9]{64}$/);
    account = "second-workspace";
    await s.win.fetch("/backend-api/conversations/one", { headers: { "chatgpt-account-id": account } });
    await new Promise((resolve) => setTimeout(resolve, 650));
    assert.equal(preparations, 2);
    const next = s.events.filter((event) => event.event === "page").at(-1).scope;
    assert.match(next, /^[a-f0-9]{64}$/); assert.notEqual(next, previous);
    assert.equal(s.events.at(-1).event, "complete");
  } finally { s.finish(); }
});

test("an incompatible native snapshot falls back to the existing cursor reader", async () => {
  const s = await boot((url) => Response.json(url.includes("before=") ? page(["old"], false, true) : page(["latest"], true, false)), () => ({
    invalidate() {}, async prepare() { return { ok: true, payload: { id: "one", changed_host_shape: true } }; }
  }));
  try {
    s.command("start"); await settled(s);
    assert.equal(s.events.at(-1).source, "fallback");
    assert.equal(s.events.at(-1).historicalRequests, 1);
    assert.equal(s.events.filter((event) => event.event === "page").length, 2);
  } finally { s.finish(); }
});

test("workspace headers arriving after session authentication still confirm a hashed cache identity", async () => {
  const s = await boot(() => Response.json(page(["public"], false, false)), ({ window: win }) => ({
    invalidate() {},
    async prepare() {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await win.fetch("/backend-api/conversations/one/messages?before=latest", { headers: { "chatgpt-account-id": "fixture-workspace" } });
      return { ok: true, payload: page(["public"], false, false) };
    }
  }));
  Object.defineProperty(s.win.crypto, "subtle", { value: webcrypto.subtle });
  s.win.TextEncoder = TextEncoder;
  try {
    s.command("start"); await settled(s);
    assert.equal(s.events.at(-1).event, "complete");
    assert.match(s.events.find((event) => event.event === "page").scope, /^[a-f0-9]{64}$/);
    const serialized = JSON.stringify(s.events);
    assert.equal(serialized.includes("fixture-workspace"), false);
    assert.equal(serialized.includes("test-user"), false);
    assert.equal(serialized.includes("test-only"), false);
  } finally { s.finish(); }
});

test("disabling cancels a native preparation that never settles without leaving its timeout alive", async () => {
  let signal;
  const s = await boot(() => { throw new Error("no history fetch"); }, () => ({ invalidate() {},
    prepare(_id, options) { signal = options.signal; return new Promise(() => {}); }
  }));
  try {
    s.command("start"); await new Promise((resolve) => setTimeout(resolve, 5)); s.command("stop");
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(signal.aborted, true);
    assert.equal(s.events.some((event) => event.event === "complete" || event.event === "page"), false);
  } finally { s.finish(); }
});

test("page bridge is dormant until enabled, walks every cursor and restores fetch", async () => {
  const s = await boot((url) => Response.json(url.includes("before=") ? page(["a", "b"], false, true) : page(["c", "d"], true, false)));
  try {
    assert.equal(s.calls.length, 0); assert.equal(s.win.fetch, s.original);
    s.command("start"); await settled(s);
    assert.deepEqual(s.events.filter((item) => item.event === "page").map((item) => item.payload.messages[0].id), ["c", "a"]);
    assert.equal(s.events.at(-1).event, "complete");
    assert.ok(s.calls.some((call) => call.url.includes("before=c")));
    assert.ok(s.calls.some((call) => call.url.startsWith("/backend-api/conversations/one/messages?") && call.url.includes("before=c")));
    assert.ok(!JSON.stringify(s.events).includes("test-only"));
    s.command("stop"); assert.equal(s.win.fetch, s.original);
  } finally { s.finish(); }
});

test("repeated cursors stop as partial instead of issuing unbounded requests", async () => {
  const s = await boot(() => Response.json(page(["a"], true, false, "same")));
  try {
    s.command("start"); await settled(s);
    assert.equal(s.events.at(-1).event, "error"); assert.equal(s.events.at(-1).reason, "repeated-cursor");
    assert.equal(s.calls.length, 3);
  } finally { s.finish(); }
});

test("unsupported endpoint falls back to legacy, while authorization failures do not probe more endpoints", async () => {
  const s = await boot((url) => url.includes("/conversations/") ? new Response("", { status: 404 }) : Response.json({ conversation_id: "one", current_node: "root", mapping: { root: { parent: null } } }));
  try { s.command("start"); await settled(s); assert.equal(s.events.at(-1).event, "complete"); assert.equal(s.calls.length, 3); }
  finally { s.finish(); }
  const denied = await boot(() => new Response("", { status: 403 }));
  try { denied.command("start"); await settled(denied); assert.equal(denied.calls.length, 2); assert.equal(denied.events.at(-1).reason, "http-403"); }
  finally { denied.finish(); }
});

test("disabling during a request discards late results", async () => {
  let resolve;
  const s = await boot(() => new Promise((done) => { resolve = done; }));
  try {
    s.command("start"); await new Promise((done) => setTimeout(done, 5));
    s.command("stop"); resolve(Response.json(page(["a"], false, false)));
    await new Promise((done) => setTimeout(done, 5));
    assert.ok(!s.events.some((item) => item.event === "complete" || item.event === "page"));
  } finally { s.finish(); }
});

test("native reveal commands require the active conversation session and return explicit compatibility errors", async () => {
  const s = await boot(() => Response.json(page(["a"], false, false)));
  try {
    s.command("start"); await settled(s);
    s.command("reveal", { navigationId: "old", requestId: "wrong-session" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(s.events.filter((event) => event.event === "native-reveal").length, 0);
    s.command("reveal", { navigationId: "current" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const result = s.events.find((event) => event.event === "native-reveal");
    assert.equal(result.navigationId, "current"); assert.equal(result.reason, "native-list-unavailable");
  } finally { s.finish(); }
});

test("a matching cancel command aborts native scrolling without cancelling preparation or another jump", async () => {
  const signals = [];
  const s = await boot(() => Response.json(page(["a"], false, false)), () => ({
    reveal(_id, { signal }) { signals.push(signal); return new Promise((resolve) => signal.addEventListener("abort", () => resolve({ ok: false, reason: "source-changed" }), { once: true })); }
  }));
  try {
    s.command("start"); await settled(s);
    s.command("prepare", { navigationId: "preparation" });
    s.command("reveal", { navigationId: "first", messageId: "a" });
    s.command("reveal", { navigationId: "second", messageId: "b" });
    assert.equal(signals[1].aborted, true);
    s.command("cancel-reveal", { navigationId: "first" });
    s.command("cancel-reveal", { navigationId: "second", requestId: "wrong-session" });
    assert.equal(signals[2].aborted, false);
    s.command("cancel-reveal", { navigationId: "second" });
    assert.equal(signals[2].aborted, true);
    assert.equal(signals[0].aborted, false, "cover preparation is independent of Maker navigation");
  } finally { s.finish(); }
});

test("an armed bridge reuses ChatGPT's own load of a clicked chat, so no refresh is needed", async () => {
  const s = await boot(() => Response.json(page(["a", "b"], false, false)));
  try {
    s.win.history.replaceState({}, "", "/");
    s.command("arm", { conversationId: "" });
    assert.notEqual(s.win.fetch, s.original, "armed before any chat is open");
    await s.win.fetch("/backend-api/conversation/one", { headers: { authorization: "Bearer native" } });
    s.win.history.pushState({}, "", "/c/one");
    const before = s.calls.length;
    s.command("start"); await settled(s);
    assert.equal(s.calls.length, before, "the native response is reused without another request");
    assert.deepEqual(s.events.filter((item) => item.event === "page").map((item) => item.payload.messages.length), [2]);
    assert.equal(s.events.at(-1).event, "complete");
    s.command("stop"); assert.notEqual(s.win.fetch, s.original, "stop between chats keeps the bridge armed");
    s.command("disarm"); assert.equal(s.win.fetch, s.original);
  } finally { s.finish(); }
});

test("an armed bridge falls back to its own request with the captured native headers", async () => {
  const s = await boot((url) => Response.json(url.includes("/conversations/one") ? page(["a"], false, false) : page(["x"], true, false)));
  try {
    s.win.history.replaceState({}, "", "/");
    s.command("arm", { conversationId: "" });
    await s.win.fetch("/backend-api/conversations/other?num_turns=50", { headers: { "chatgpt-account-id": "workspace" } });
    s.win.history.pushState({}, "", "/c/one");
    s.command("start"); await settled(s);
    assert.equal(s.events.at(-1).event, "complete");
    const own = s.calls.find((call) => call.url.startsWith("/backend-api/conversations/one?"));
    assert.equal(own.init.headers.get("chatgpt-account-id"), "workspace");
  } finally { s.finish(); }
});


test("returning to a completed share reuses labels without rereading the server", async () => {
  const s = await boot(() => new Response(sharedData(sharedImagePayload())));
  try {
    s.command("arm");
    s.win.history.replaceState({}, "", "/share/share-one");
    s.command("start", { conversationId: "share-one" }); await settled(s);
    assert.equal(s.events.at(-1).event, "complete");
    const requests = s.calls.length;
    s.command("stop"); s.win.history.replaceState({}, "", "/");
    s.win.history.replaceState({}, "", "/share/share-one"); s.events.length = 0;
    s.command("start", { conversationId: "share-one", requestId: "return" }); await settled(s);
    assert.equal(s.events.at(-1).event, "complete");
    assert.equal(s.calls.length, requests);
    assert.equal(s.events.find((event) => event.event === "page").requestId, "return");
    s.command("retry", { conversationId: "share-one", requestId: "return" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(s.calls.length > requests, "explicit retry requests a fresh snapshot");
  } finally { s.finish(); }
});

test("ChatGPT cooldown survives restart and defers native-triggered refresh until the deadline", async () => {
  let historyCalls = 0;
  const s = await boot((_url, init) => {
    if (init?.method === "PATCH") return Response.json({});
    return ++historyCalls === 1 ? new Response("", { status: 503, headers: { "Retry-After": "1.1" } }) : Response.json(page(["ready"], false, false));
  }, () => ({ invalidate() {} }));
  try {
    s.command("arm"); s.command("start"); await settled(s);
    const until = s.events.find(event => event.event === "error").retryAt;
    s.command("stop"); s.command("start"); await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(historyCalls, 1);
    await s.win.fetch("/backend-api/conversation/one", { method: "PATCH" });
    await new Promise(resolve => setTimeout(resolve, 750));
    assert.equal(historyCalls, 1);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, until - Date.now()) + 80));
    assert.equal(historyCalls, 2); assert.equal(s.events.at(-1).event, "complete");
  } finally { s.finish(); }
});

test("native prefetch projects the active branch before it is reused and expires after a minute", async () => {
  const payload = sharedImagePayload(); payload.conversation_id = "one";
  payload.mapping.root.parent = null; payload.mapping.u.parent = "root";
  payload.mapping.picture.parent = "u"; payload.mapping.alternate.parent = "u";
  let projected = 0; let preparations = 0;
  const s = await boot(() => Response.json(payload), () => ({ invalidate() {}, async prepare() {
    preparations++; return { ok: true, payload: page(["fresh"], false, false) };
  } }));
  const realNow = s.win.Date.now;
  try {
    s.win.publicImageMessage = value => { projected++; return publicImageMessage(value); };
    s.win.history.replaceState({}, "", "/"); s.command("arm");
    await s.win.fetch("/backend-api/conversation/one");
    for (let i = 0; i < 20 && !projected; i++) await new Promise(resolve => setTimeout(resolve, 2));
    assert.ok(projected > 0, "projection must happen at capture, before start");
    s.win.history.replaceState({}, "", "/c/one"); s.command("start"); await settled(s);
    assert.equal(preparations, 0);
    const first = s.events.find(event => event.event === "page").payload;
    assert.equal(first.mapping.alternate, undefined);
    s.command("stop"); s.events.length = 0;
    s.win.Date.now = () => realNow() + 61000;
    s.command("start"); await settled(s);
    assert.equal(preparations, 1);
    assert.equal(s.events.find(event => event.event === "page").payload.messages[0].id, "fresh");
  } finally { s.win.Date.now = realNow; s.finish(); }
});

test("an account change invalidates an in-flight prefetch instead of publishing its old messages", async () => {
  let release;
  const s = await boot(url => url.includes("/one") ? new Promise(resolve => { release = resolve; }) : Response.json({}), () => ({
    invalidate() {}, async prepare() { return { ok: true, payload: page(["new-account"], false, false) }; }
  }));
  try {
    s.win.history.replaceState({}, "", "/"); s.command("arm");
    const old = s.win.fetch("/backend-api/conversation/one", { headers: { "chatgpt-account-id": "old" } });
    s.win.history.replaceState({}, "", "/c/one"); s.command("start");
    await s.win.fetch("/backend-api/conversation/other", { headers: { "chatgpt-account-id": "new" } });
    release(Response.json(page(["old-secret"], false, false))); await old; await settled(s);
    assert.equal(s.events.at(-1).event, "complete");
    assert.doesNotMatch(JSON.stringify(s.events), /old-secret/);
    assert.equal(s.events.find(event => event.event === "page").payload.messages[0].id, "new-account");
  } finally { s.finish(); }
});
