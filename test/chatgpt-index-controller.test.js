import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createChatGptIndexController } from "../src/chatgpt-index-controller.js";

function setup(html = "", { loadBridge = true } = {}) {
  const dom = new JSDOM(`<html><head><title>初始标题 - ChatGPT</title></head><body><main>${html}</main></body></html>`, { url: "https://chatgpt.com/c/one" });
  const win = dom.window; const commands = [];
  win.postMessage = (data) => commands.push(data);
  const controller = createChatGptIndexController({ window: win, bridgeUrl: "https://example.invalid/bridge.js", onChange() {} });
  controller.configure(true);
  if (loadBridge) win.document.querySelector('script').dispatchEvent(new win.Event("load"));
  const requestId = commands.at(-1)?.requestId || controller.snapshot().generation;
  const send = async (event, fields = {}) => { win.dispatchEvent(new win.MessageEvent("message", { source: win, origin: win.location.origin, data: {
    type: "polaris-conversation-index-result", conversationId: "one", requestId, runId: 1, event, ...fields
  } })); await new Promise((resolve) => setTimeout(resolve, 0)); };
  const payload = (text = "相同正文", id = "a") => ({ title: "接口真实标题", messages: [{ id, author: { role: "assistant" }, content: { content_type: "text", parts: [text] } }], page_info: { has_previous_page: false, has_next_page: false } });
  return { dom, win, controller, commands, requestId, send, payload, finish() { controller.dispose(); dom.window.close(); } };
}

test("late bridge load after disposal cannot access a cleared script or start a request", () => {
  const s = setup("", { loadBridge: false });
  const errors = [];
  s.win.addEventListener("error", (event) => { errors.push(event.error?.message || event.message); event.preventDefault(); });
  try {
    const bridge = s.win.document.querySelector("script");
    s.controller.dispose();
    bridge.dispatchEvent(new s.win.Event("load"));
    assert.deepEqual(errors, [], "a late load must not read dataset through a null script");
    assert.equal(s.commands.filter((command) => command.command === "start").length, 0);
    assert.equal(bridge.isConnected, false);
  } finally { s.finish(); }
});

test("late callbacks from a failed bridge cannot mark or remove its replacement", () => {
  const s = setup("", { loadBridge: false });
  try {
    const oldBridge = s.win.document.querySelector("script");
    oldBridge.dispatchEvent(new s.win.Event("error"));
    s.controller.retry();
    const replacement = s.win.document.querySelector("script");
    assert.notEqual(replacement, oldBridge);
    oldBridge.dispatchEvent(new s.win.Event("load"));
    assert.equal(replacement.dataset.ready, undefined);
    assert.equal(s.commands.filter((command) => command.command === "start").length, 0);
    oldBridge.dispatchEvent(new s.win.Event("error"));
    assert.equal(replacement.isConnected, true);
    replacement.dispatchEvent(new s.win.Event("load"));
    assert.equal(s.commands.filter((command) => command.command === "start").length, 1);
  } finally { s.finish(); }
});

test("real API title survives a stale page title, while rename updates the index", async () => {
  const s = setup();
  try {
    await s.send("page", { payload: s.payload(), replace: true }); await s.send("complete");
    assert.equal(s.controller.snapshot().title, "接口真实标题");
    s.win.document.title = "用户改过的标题 - ChatGPT";
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(s.controller.snapshot().title, "用户改过的标题");
  } finally { s.finish(); }
});

test("complete data starts native preparation and only its matching reply marks the conversation ready", async () => {
  const s = setup();
  try {
    await s.send("page", { payload: s.payload(), replace: true }); await s.send("complete");
    const request = s.commands.at(-1);
    assert.equal(request.command, "prepare");
    assert.equal(s.controller.snapshot().phase, "complete");
    assert.equal(s.controller.snapshot().native.phase, "preparing");
    await s.send("native-reveal", { navigationId: "stale", ok: true });
    assert.equal(s.controller.snapshot().native.phase, "preparing");
    await s.send("native-reveal", { navigationId: request.navigationId, ok: true });
    assert.equal(s.controller.snapshot().native.phase, "ready");
  } finally { s.finish(); }
});

test("DOM unmount does not remove indexed data and duplicate fallback targets never jump arbitrarily", async () => {
  const s = setup('<div data-message-author-role="assistant">相同正文</div><div data-message-author-role="assistant">相同正文</div>');
  try {
    await s.send("page", { payload: s.payload(), replace: true }); await s.send("complete");
    assert.equal(s.controller.resolveTarget("index:a", {}), null);
    s.win.document.querySelector("main").replaceChildren(); s.controller.syncMounted();
    assert.equal((await s.controller.search("正文")).total, 1);
    assert.equal(s.controller.resolveTarget("index:a", {}), null);
    const node = s.win.document.createElement("div"); node.setAttribute("data-message-id", "a"); node.textContent = "相同正文";
    s.win.document.querySelector("main").append(node);
    assert.equal(s.controller.resolveTarget("index:a", {}), node);
  } finally { s.finish(); }
});

test("an indexed table locates its already mounted table rather than comparing its title to individual cells", async () => {
  const s = setup('<div data-message-id="a"><div class="markdown"><table><thead><tr><th>市场</th><th>财富</th></tr></thead><tbody><tr><td>日本</td><td>10</td></tr></tbody></table></div></div>');
  try {
    await s.send("page", { payload: s.payload("| 市场 | 财富 |\n| --- | --- |\n| 日本 | 10 |"), replace: true });
    await s.send("complete");
    const table = s.controller.outline({}).items.find((item) => item.title === "市场 | 财富");
    assert.ok(table);
    assert.equal(s.controller.resolveTarget(table.markerKey, {}), s.win.document.querySelector("table"));
  } finally { s.finish(); }
});

test("a mounted message without an exposed id matches visible paragraphs and table content", async () => {
  const s = setup('<div class="markdown"><h2>报告</h2><p>前言</p><table><thead><tr><th>市场</th><th>财富</th></tr></thead><tbody><tr><td>日本</td><td>10</td></tr></tbody></table><button>Copy</button><span aria-hidden="true">Hidden control</span></div>');
  try {
    await s.send("page", { payload: s.payload("## 报告\n\n前言\n\n| 市场 | 财富 |\n| --- | --- |\n| 日本 | 10 |"), replace: true });
    await s.send("complete");
    assert.equal(s.controller.resolveTarget("index:a", {}), s.win.document.querySelector(".markdown"));
    const heading = s.controller.outline({}).items.find((item) => item.title === "报告");
    assert.equal(s.controller.resolveTarget(heading.markerKey, {}), s.win.document.querySelector("h2"));
  } finally { s.finish(); }
});

test("location results distinguish a missing message from a missing section inside a mounted message", async () => {
  const s = setup();
  try {
    await s.send("page", { payload: s.payload("## 标题\n\n正文"), replace: true });
    await s.send("complete");
    const key = s.controller.outline({}).items.find((item) => item.title === "标题").markerKey;
    assert.equal(s.controller.resolveLocation(key, {}).reason, "not-mounted");
    s.win.document.querySelector("main").innerHTML = '<div data-message-id="a"><p>正文</p></div>';
    assert.equal(s.controller.resolveLocation(key, {}).reason, "anchor-not-found");
  } finally { s.finish(); }
});

test("indexed source location waits for native hydration and resolves inside the ChatGPT message", async () => {
  const s = setup();
  try {
    await s.send("page", { payload: s.payload("## 标题\n\n正文"), replace: true }); await s.send("complete");
    const marker = s.controller.outline({}).items[0];
    const pending = s.controller.ensureLocation(marker.markerKey, {});
    const request = s.commands.at(-1);
    assert.equal(request.command, "reveal");
    assert.equal(request.messageId, "a");
    await s.send("native-reveal", { navigationId: request.navigationId, ok: true });
    s.win.document.querySelector("main").innerHTML = '<article data-message-id="a"><div class="markdown"><h2>标题</h2><p>正文</p></div></article>';
    const result = await pending;
    assert.equal(result.element, s.win.document.querySelector("main h2"));
    assert.equal(s.win.document.querySelectorAll('[data-polaris-message]').length, 0);
    assert.equal(s.win.location.href, "https://chatgpt.com/c/one");
  } finally { s.finish(); }
});

test("native navigation errors and late replies do not move a changed conversation", async () => {
  const s = setup();
  try {
    await s.send("page", { payload: s.payload(), replace: true }); await s.send("complete");
    const first = s.controller.ensureLocation("index:a", {});
    await s.send("native-reveal", { navigationId: s.commands.at(-1).navigationId, ok: false, reason: "native-list-unavailable" });
    assert.equal((await first).reason, "native-list-unavailable");
    const old = s.controller.ensureLocation("index:a", {});
    const navigationId = s.commands.at(-1).navigationId;
    s.win.history.pushState({}, "", "/c/two"); s.controller.configure(true);
    assert.equal((await old).reason, "source-changed");
    await s.send("native-reveal", { navigationId, ok: true });
    assert.equal(s.controller.snapshot().count, 0);
  } finally { s.finish(); }
});

test("broken chains cannot be marked complete and old route responses cannot overwrite a new conversation", async () => {
  const s = setup();
  try {
    await s.send("page", { payload: { current_node: "missing", mapping: {} }, replace: true }); await s.send("complete");
    assert.equal(s.controller.snapshot().phase, "error");
    s.win.history.pushState({}, "", "/c/two"); s.controller.configure(true);
    await s.send("page", { payload: s.payload(), replace: true });
    assert.equal(s.controller.snapshot().count, 0);
    s.controller.configure(false); assert.equal(s.controller.snapshot(), null);
  } finally { s.finish(); }
});
