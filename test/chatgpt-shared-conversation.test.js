import test from "node:test";
import assert from "node:assert/strict";
import { readSharedConversationHtml, readSharedConversationResponse, loadSharedConversation } from "../public/src/chatgpt-shared-conversation.js";
import { createConversationIndex, conversationPage } from "../src/conversation-index.js";
import { sharedData, sharedHtml, sharedImagePayload, sharedReloadData } from "./fixtures/chatgpt-images.js";

test("the live HTTP 202 reload response reads the share API with the page's existing session", async () => {
  const calls = []; const signal = new AbortController().signal;
  const result = await loadSharedConversation("share-one", { signal, request: async (url, init) => {
    calls.push({ url, init });
    if (url.startsWith("/share/share-one.data?")) return new Response(sharedReloadData, { status: 202, headers: { "content-type": "text/x-script" } });
    if (url === "/api/auth/session") return Response.json({ accessToken: "test-only-session" });
    if (url === "/backend-api/share/share-one") return Response.json(sharedImagePayload());
    throw new Error(`Unexpected request: ${url}`);
  } });
  assert.equal(result.historicalRequests, 3);
  assert.deepEqual(calls.slice(1).map((call) => call.url), ["/api/auth/session", "/backend-api/share/share-one"]);
  assert.ok(calls.every((call) => call.init.signal === signal && call.init.credentials === "include"));
  assert.equal(new Headers(calls[2].init.headers).get("authorization"), "Bearer test-only-session");
  assert.equal(calls[0].init.headers, undefined);
  const index = createConversationIndex(); await index.ingest(result.payload); index.finish();
  assert.equal(index.status().count, 2);
  assert.equal(index.getOutline().items.filter((item) => item.image).length, 1);
  assert.doesNotMatch(JSON.stringify(index.exportSnapshot()), /test-only-session/);
});

test("share API access, identity and branch failures stop without another fallback", async () => {
  const broken = sharedImagePayload(); broken.current_node = "missing";
  for (const [session, api, reason, requests] of [
    [new Response("Denied", { status: 403 }), null, "http-403", 2],
    [Response.json({}), null, "http-401", 2],
    [Response.json({ accessToken: "test-only" }), new Response("Denied", { status: 401 }), "http-401", 3],
    [Response.json({ accessToken: "test-only" }), Response.json({ ...sharedImagePayload(), conversation_id: "other" }), "wrong-conversation", 3],
    [Response.json({ accessToken: "test-only" }), Response.json(broken), "incomplete-chain", 3]
  ]) {
    const calls = [];
    await assert.rejects(loadSharedConversation("share-one", { request: async (url) => {
      calls.push(url);
      if (calls.length === 1) return new Response(sharedReloadData, { status: 202 });
      return calls.length === 2 ? session : api;
    } }), (error) => error.message === reason && error.stage === (requests === 2 ? "shared-session" : "shared-api"));
    assert.equal(calls.length, requests);
  }
});

test("cancelling during session loading never starts the share API request", async () => {
  const pending = new AbortController(); const calls = [];
  await assert.rejects(loadSharedConversation("share-one", { signal: pending.signal, request: async (url) => {
    calls.push(url);
    if (calls.length === 1) return new Response(sharedReloadData, { status: 202 });
    pending.abort(); return Response.json({ accessToken: "test-only" });
  } }), { name: "AbortError" });
  assert.equal(calls.length, 2);
});

test("the shared route's raw data response decodes without an HTML or script wrapper", async () => {
  const snapshot = readSharedConversationResponse(sharedData(sharedImagePayload()), "share-one");
  const index = createConversationIndex(); await index.ingest(snapshot); index.finish();
  assert.equal(index.status().count, 2);
  assert.equal(index.getOutline().items.filter((item) => item.image).length, 1);
});

test("the separate share reader requests only its server loader route and validates the response", async () => {
  const calls = []; const signal = new AbortController().signal;
  const result = await loadSharedConversation("share-one", { signal, request: async (url, init) => {
    calls.push({ url, init }); return new Response(sharedData(sharedImagePayload()), { headers: { "content-type": "text/x-script" } });
  } });
  assert.equal(calls.length, 1); assert.equal(result.historicalRequests, 1);
  const url = new URL(calls[0].url, "https://chatgpt.com");
  assert.equal(url.pathname, "/share/share-one.data");
  assert.equal(url.searchParams.get("_routes"), "routes/share.$shareId.($action)");
  assert.equal(calls[0].init.signal, signal); assert.equal(calls[0].init.credentials, "include");
  assert.ok(result.payload.mapping.picture);
});

test("share loader compatibility falls back once to HTML while access and identity failures stop", async () => {
  for (const first of [new Response("Not found", { status: 404 }), new Response("Application shell")]) {
    const calls = [];
    const result = await loadSharedConversation("share-one", { request: async (url) => {
      calls.push(url); return calls.length === 1 ? first : new Response(sharedHtml(sharedImagePayload()));
    } });
    assert.equal(result.historicalRequests, 2); assert.equal(calls[1], "/share/share-one");
  }
  for (const response of [new Response("Denied", { status: 403 }), new Response(sharedData({ ...sharedImagePayload(), conversation_id: "other" }))]) {
    let calls = 0;
    await assert.rejects(loadSharedConversation("share-one", { request: async () => { calls++; return response; } }), /http-403|wrong-conversation/);
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(loadSharedConversation("../other", { request: async () => { calls++; } }), /wrong-conversation/);
  assert.equal(calls, 0);
});

test("server share loader data restores the active branch including unmounted image messages", async () => {
  const snapshot = readSharedConversationHtml(sharedHtml(sharedImagePayload()), "share-one");
  assert.deepEqual(conversationPage(snapshot).messages.map((message) => message.id), ["u", "picture"]);
  const index = createConversationIndex(); await index.ingest(snapshot); index.finish();
  assert.equal(index.status().count, 2); assert.equal(index.image("picture:image:0").src, "sediment://file_one");
  assert.equal(index.image("alternate:image:0"), null);
  assert.equal(snapshot.mapping.root.parent, null);
});

test("share decoding is data only and rejects missing data, ambiguous parents and broken chains", () => {
  assert.throws(() => readSharedConversationHtml('<script>throw new Error("never execute")</script>', "one"), /unsupported-format/);
  const payload = sharedImagePayload(); payload.mapping.alternate.children = ["picture"];
  assert.throws(() => readSharedConversationHtml(sharedHtml(payload), "share-one"), /incomplete-chain/);
  payload.mapping.alternate.children = []; payload.current_node = "missing";
  assert.throws(() => conversationPage(readSharedConversationHtml(sharedHtml(payload), "share-one")), /incomplete-chain/);
});

test("share snapshots must match the requested conversation rather than accepting an earlier route's stream", () => {
  const other = sharedImagePayload(); other.conversation_id = "another-share"; other.title = "Another share";
  assert.throws(() => readSharedConversationHtml(sharedHtml(other), "share-one"), /wrong-conversation/);
  const snapshot = readSharedConversationHtml(sharedHtml(other) + sharedHtml(sharedImagePayload()), "share-one");
  assert.equal(snapshot.title, "Shared image test");
  const missing = sharedImagePayload(); delete missing.conversation_id;
  assert.throws(() => readSharedConversationHtml(sharedHtml(missing), "share-one"), /wrong-conversation/);
});
