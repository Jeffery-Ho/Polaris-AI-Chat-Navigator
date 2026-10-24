import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { createChatGptNativeNavigation } from "../public/src/chatgpt-native-navigation.js";

const source = (await readFile(new URL("../public/src/chatgpt-index-bridge.js", import.meta.url), "utf8")).replace(/^import .*\n/, "");
const message = (id) => ({ id, author: { role: "user" }, content: { content_type: "text", parts: [id] } });
const page = (ids, previous, next, cursor = ids[0]) => ({ conversation_id: "one", title: "测试标题", messages: ids.map(message), page_info: { start_cursor: cursor, has_previous_page: previous, has_next_page: next } });
async function boot(handler) {
  const dom = new JSDOM("<html><head></head><body></body></html>", { url: "https://chatgpt.com/c/one", runScripts: "outside-only" });
  const win = dom.window; const calls = []; const events = [];
  Object.assign(win, { Headers, Request, AbortController, createChatGptNativeNavigation });
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
