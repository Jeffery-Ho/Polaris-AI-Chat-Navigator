import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createChatGptConversationCover } from "../src/chatgpt-conversation-cover.js";

function setup() {
  const dom = new JSDOM('<nav>会话</nav><main aria-busy="false"><textarea>未发送的草稿</textarea></main>', { url: "https://chatgpt.com/c/one" });
  let retries = 0;
  const cover = createChatGptConversationCover({ window: dom.window, locale: "zh", onRetry: () => retries++ });
  const update = (fields = {}) => cover.update({ generation: "one", title: "用户的会话标题", phase: "loading", count: 14, native: { phase: "loading" }, ...fields });
  return { dom, cover, update, root: () => dom.window.document.getElementById("polaris-conversation-cover"), retries: () => retries,
    finish() { cover.dispose(); dom.window.close(); } };
}

test("the cover uses real progress and stays until the native list is ready, preserving the draft and main state", () => {
  const s = setup(); const main = s.dom.window.document.querySelector("main");
  try {
    s.update();
    assert.equal(s.root().shadowRoot.querySelector('.number').textContent, "14");
    assert.equal(s.root().shadowRoot.querySelector('.title').textContent, "用户的会话标题");
    assert.equal(main.hasAttribute("inert"), true);
    s.update({ phase: "complete", native: { phase: "preparing" } });
    assert.ok(s.root(), "API completion must not hide a cover before host preparation completes");
    assert.match(s.root().shadowRoot.querySelector('.hint').textContent, /准备正文/);
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
    const shadow = s.root().shadowRoot;
    assert.equal(shadow.querySelector('.retry').hidden, false);
    shadow.querySelector('.retry').click(); assert.equal(s.retries(), 1);
    shadow.querySelector('.partial').click(); assert.equal(s.root(), null);
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
