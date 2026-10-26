import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { JSDOM } from "jsdom";
import { createChatGptNativeNavigation } from "../public/src/chatgpt-native-navigation.js";

const source = (await readFile(new URL("../public/src/chatgpt-index-bridge.js", import.meta.url), "utf8")).replace(/^import .*\n/, "");
const message = (id) => ({ id, author: { role: "user" }, content: { content_type: "text", parts: [id] } });
const page = (ids, previous, next, cursor = ids[0]) => ({ conversation_id: "one", title: "测试标题", messages: ids.map(message), page_info: { start_cursor: cursor, has_previous_page: previous, has_next_page: next } });
async function boot(handler, navigationFactory = createChatGptNativeNavigation) {
  const dom = new JSDOM("<html><head></head><body></body></html>", { url: "https://chatgpt.com/c/one", runScripts: "outside-only" });
  const win = dom.window; const calls = []; const events = [];
  Object.assign(win, { Headers, Request, AbortController, createChatGptNativeNavigation: navigationFactory });
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
async function settled(s) {
  for (let i = 0; i < 50 && !s.events.some((item) => ["complete", "error"].includes(item.event)); i++) await new Promise((resolve) => setTimeout(resolve, 2));
}

test("native preparation supplies the full branch on every open without an extra history traversal", async () => {
  let preparations = 0;
  const s = await boot(() => { throw new Error("Polaris must not request history when the native snapshot is complete"); }, () => ({
    invalidate() {},
    async prepare() { preparations++; return { ok: true, payload: page(["old", "latest"], false, false) }; }
  }));
  try {
    for (let open = 0; open < 2; open++) {
      s.events.length = 0; s.command("start"); await settled(s);
      assert.equal(s.events.at(-1).event, "complete");
      assert.equal(s.events.at(-1).source, "native");
      assert.equal(s.events.at(-1).historicalRequests, 0);
      assert.equal(s.events.find((event) => event.event === "page").reconcile, true);
      assert.equal(s.events.find((event) => event.event === "native-state" && event.phase === "ready").phase, "ready");
      s.command("stop");
    }
    assert.equal(preparations, 2);
    assert.deepEqual(s.calls.map((call) => call.url), ["/api/auth/session", "/api/auth/session"]);
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
