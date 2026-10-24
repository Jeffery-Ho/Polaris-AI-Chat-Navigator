import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createChatGptConversationCover, stepStates } from "../src/chatgpt-conversation-cover.js";

function setup() {
  const dom = new JSDOM('<nav>会话</nav><main aria-busy="false"><textarea>未发送的草稿</textarea></main>', { url: "https://chatgpt.com/c/one" });
  let retries = 0;
  const cover = createChatGptConversationCover({ window: dom.window, locale: "zh", onRetry: () => retries++ });
  const update = (fields = {}) => cover.update({ generation: "one", title: "用户的会话标题", phase: "loading", count: 14, native: { phase: "loading" }, ...fields });
  const shadow = () => dom.window.document.getElementById("polaris-conversation-cover").shadowRoot;
  const step = (name) => shadow().querySelector(`.step.${name}`).dataset.state;
  return { dom, cover, update, shadow, step, root: () => dom.window.document.getElementById("polaris-conversation-cover"), retries: () => retries,
    finish() { cover.dispose(); dom.window.close(); } };
}

test("step states map data reading and native preparation separately", () => {
  assert.deepEqual(stepStates({ phase: "loading", native: { phase: "loading" } }), { read: "active", prepare: "pending" });
  assert.deepEqual(stepStates({ phase: "complete", native: { phase: "loading" } }), { read: "done", prepare: "active" });
  assert.deepEqual(stepStates({ phase: "complete", native: { phase: "preparing" } }), { read: "done", prepare: "active" });
  assert.deepEqual(stepStates({ phase: "complete", native: { phase: "error" } }), { read: "done", prepare: "error" });
  assert.deepEqual(stepStates({ phase: "partial", native: { phase: "loading" } }), { read: "error", prepare: "pending" });
  assert.deepEqual(stepStates({ phase: "error" }), { read: "error", prepare: "pending" });
});

test("the cover shows two real progress steps and stays until the native list is ready, preserving the draft and main state", () => {
  const s = setup(); const main = s.dom.window.document.querySelector("main");
  try {
    s.update();
    assert.equal(s.shadow().querySelector(".number").textContent, "14");
    assert.equal(s.shadow().querySelector(".title").textContent, "用户的会话标题");
    assert.equal(s.step("read"), "active"); assert.equal(s.step("prepare"), "pending");
    assert.ok(s.shadow().querySelector(".step.read svg"));
    assert.equal(s.shadow().querySelector(".retry").hidden, true);
    assert.equal(main.hasAttribute("inert"), true);
    s.update({ phase: "complete", native: { phase: "preparing" } });
    assert.ok(s.root(), "API completion must not hide a cover before host preparation completes");
    assert.equal(s.step("read"), "done"); assert.equal(s.step("prepare"), "active");
    s.update({ phase: "complete", native: { phase: "ready" } });
    assert.equal(s.root(), null);
    assert.equal(main.hasAttribute("inert"), false);
    assert.equal(main.getAttribute("aria-busy"), "false");
    assert.equal(main.querySelector("textarea").value, "未发送的草稿");
  } finally { s.finish(); }
});

test("partial reading dismisses only this conversation, and error recovery offers a real retry", () => {
  const s = setup();
  try {
    s.update({ phase: "complete", native: { phase: "error" } });
    const shadow = s.shadow();
    assert.equal(s.step("prepare"), "error");
    assert.match(shadow.querySelector(".status").textContent, /还没准备好/);
    assert.equal(shadow.querySelector(".retry").hidden, false);
    shadow.querySelector(".retry").click(); assert.equal(s.retries(), 1);
    shadow.querySelector(".partial").click(); assert.equal(s.root(), null);
    s.update({ count: 20 }); assert.equal(s.root(), null);
    s.update({ generation: "two" }); assert.ok(s.root());
    s.cover.update(null); assert.equal(s.root(), null);
  } finally { s.finish(); }
});

test("disposing a loading cover restores pre-existing inert state without removing host content", () => {
  const s = setup(); const main = s.dom.window.document.querySelector("main");
  try {
    main.setAttribute("inert", ""); main.removeAttribute("aria-busy");
    s.update(); s.cover.dispose();
    assert.equal(main.hasAttribute("inert"), true);
    assert.equal(main.hasAttribute("aria-busy"), false);
    assert.equal(main.querySelector("textarea").value, "未发送的草稿");
  } finally { s.finish(); }
});

test("without a conversation a dismissible notice leaves main usable and yields to the reading cover", () => {
  const s = setup(); const doc = s.dom.window.document; const main = doc.querySelector("main");
  const notice = () => doc.getElementById("polaris-conversation-notice");
  try {
    s.cover.awaitConversation("dark");
    assert.ok(notice()); assert.equal(notice().dataset.theme, "dark");
    assert.equal(s.root(), null);
    assert.equal(main.hasAttribute("inert"), false);
    assert.match(notice().shadowRoot.querySelector("strong").textContent, /选择一个会话开始读取/);
    s.update();
    assert.equal(notice(), null); assert.ok(s.root());
    s.cover.awaitConversation();
    assert.equal(s.root(), null); assert.equal(main.hasAttribute("inert"), false); assert.ok(notice());
    notice().shadowRoot.querySelector(".dismiss").click();
    assert.equal(notice(), null);
    s.cover.awaitConversation(); assert.equal(notice(), null, "a dismissed notice stays hidden on this page");
  } finally { s.finish(); }
});

test("the cover keeps a plain Polaris background without decorative shapes", () => {
  const s = setup();
  try {
    s.update();
    assert.equal(s.shadow().querySelector(".backdrop"), null);
    assert.equal(s.shadow().querySelectorAll("svg").length, 2, "only the two step icons are drawn");
  } finally { s.finish(); }
});

test("the no-conversation notice points to the chat list, or to opening the sidebar when it is collapsed", () => {
  const s = setup(); const doc = s.dom.window.document;
  const body = () => doc.getElementById("polaris-conversation-notice").shadowRoot.querySelector(".body").textContent;
  try {
    s.cover.awaitConversation();
    assert.ok(doc.getElementById("polaris-conversation-notice").shadowRoot.querySelector(".arrow svg"));
    assert.match(body(), /先展开左侧边栏/);
    doc.querySelector("nav").getBoundingClientRect = () => ({ width: 260, left: 0, top: 0, right: 260, bottom: 800, height: 800 });
    s.cover.awaitConversation();
    assert.match(body(), /点击左侧列表中的任意会话/);
  } finally { s.finish(); }
});
