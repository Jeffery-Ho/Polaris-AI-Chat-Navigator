import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createDOMConversationSource } from "../src/dom-conversation-source.js";
import { createDOMIndexController } from "../src/dom-index-controller.js";
import { chapterTreeText } from "../src/sidepanel-chapter-state.js";

const kimiFixture = `<div class="chat-content-list">
  <div class="chat-content-item chat-content-item-user" data-archer-id="u1" data-conversation-turn-id="u1">
    <div class="segment segment-user"><div class="segment-container">
      <div class="file-card-info"><div>历史记录</div><div class="file-card-info-detail"><span class="file-ext">MD</span><span class="file-size">56.34 KB</span></div></div>
      <div class="segment-content"><div class="user-content"><span class="user-content__text">确认最后三轮对话</span></div></div>
      <div class="segment-user-actions"><span>Edit</span><span>Copy</span><span>Share</span></div>
    </div></div>
  </div>
  <div class="chat-content-item chat-content-item-assistant" data-archer-id="a1">
    <div class="segment segment-assistant"><div class="segment-container"><div class="segment-content">
      <div class="thinking-container"><div class="markdown"><div class="paragraph"><strong>思考标题</strong></div></div></div>
      <div class="markdown-container"><div class="markdown"><div class="paragraph">已确认。</div><div class="paragraph"><strong>第一轮</strong></div><ul><li><div class="paragraph"><strong>你问</strong>：原始问题</div></li></ul><div class="paragraph"><strong>第二轮</strong></div></div></div>
    </div></div></div>
  </div>
</div>`;

function sourceFor(platform, html = kimiFixture) {
  const dom = new JSDOM(html, { url: `https://${platform === "kimi" ? "www.kimi.com" : `${platform}.test`}/chat/one` });
  const read = createDOMConversationSource({ window: dom.window, platform, readContainers: () => ({
    userContainers: [...dom.window.document.querySelectorAll(".segment-user")],
    assistantContainers: [...dom.window.document.querySelectorAll(".segment-assistant .markdown")].filter((node) => !node.closest(".thinking-container"))
  }) });
  return { dom, read };
}

const anonymousPair = '<div class="segment-user"><p>继续</p></div><div class="segment-assistant"><div class="markdown"><h2>继续说明</h2><p>正文</p></div></div>';

test("mutation reads reuse unaffected message bodies and refresh a streaming reply", () => {
  const { dom, read } = sourceFor("grok", `<div class="chat-list">${anonymousPair}</div>`);
  const observer = new dom.window.MutationObserver(() => {});
  observer.observe(dom.window.document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  try {
    const first = read();
    dom.window.document.querySelector(".markdown p").textContent = "增量正文";
    const next = read({ mutations: observer.takeRecords() });
    assert.equal(next.messages[0].blocks, first.messages[0].blocks);
    assert.equal(next.messages[0].version, first.messages[0].version);
    assert.notEqual(next.messages[1].blocks, first.messages[1].blocks);
    assert.equal(next.messages[1].blocks[1].children[0].value, "增量正文");
    dom.window.document.title = "新标题";
    const unchanged = read({ mutations: observer.takeRecords() });
    assert.equal(unchanged.messages[1].blocks, next.messages[1].blocks);
    const fresh = read({ force: true });
    assert.notEqual(fresh.messages[0].blocks, first.messages[0].blocks);
  } finally { observer.disconnect(); dom.window.close(); }
});

test("batched updates normalize one changed reply and discard pending work on disposal", async () => {
  const html = `<div class="chat-list">${Array.from({ length: 100 }, (_, i) => `<div class="segment-assistant"><div class="markdown"><p>Reply ${i}</p></div></div>`).join("")}</div>`;
  const { dom, read } = sourceFor("grok", html);
  let reads = 0;
  const readMessages = options => { reads++; return read(options); };
  const controller = createDOMIndexController({ window: dom.window, platform: "grok", readMessages });
  const observer = new dom.window.MutationObserver(() => {});
  observer.observe(dom.window.document.body, { subtree: true, childList: true, characterData: true });
  const clone = globalThis.structuredClone; let clones = 0;
  try {
    controller.configure(true, { retainLoaded: true }); await controller.syncMounted();
    globalThis.structuredClone = value => { clones++; return clone(value); };
    const before = reads;
    const paragraphs = dom.window.document.querySelectorAll(".markdown p");
    paragraphs[99].textContent = "Stream one";
    controller.scheduleSync(observer.takeRecords());
    paragraphs[99].textContent = "Stream two";
    controller.scheduleSync(observer.takeRecords());
    await new Promise(resolve => dom.window.setTimeout(resolve, 80));
    assert.equal(reads - before, 1);
    assert.equal(clones, 1, "unchanged messages must bypass normalization and cloning");
    assert.equal((await controller.search("Stream two")).total, 1);
    assert.equal(controller.snapshot().count, 100);
    const beforeDispose = reads;
    paragraphs[98].textContent = "Pending"; controller.scheduleSync(observer.takeRecords());
    controller.dispose();
    await new Promise(resolve => dom.window.setTimeout(resolve, 60));
    assert.equal(reads, beforeDispose);
  } finally { globalThis.structuredClone = clone; observer.disconnect(); controller.dispose(); dom.window.close(); }
});

test("anonymous messages remounted as the same whole list window keep their indexed identities", async () => {
  const { dom, read } = sourceFor("grok", `<div class="chat-list">${anonymousPair}</div>`);
  const index = createDOMIndexController({ window: dom.window, platform: "grok", readMessages: read });
  try {
    index.configure(true); await index.syncMounted();
    const first = read();
    assert.equal(index.snapshot().count, 2);
    dom.window.document.querySelector(".chat-list").innerHTML = anonymousPair;
    await index.syncMounted();
    assert.equal(index.snapshot().count, 2);
    assert.deepEqual(read().messages.map((message) => message.id), first.messages.map((message) => message.id));
  } finally { index.dispose(); dom.window.close(); }
});

test("prepending repeated anonymous prompts preserves both positions and existing identities", () => {
  const { dom, read } = sourceFor("grok", `<div class="chat-list">${anonymousPair}</div>`);
  try {
    const first = read();
    dom.window.document.querySelector(".chat-list").insertAdjacentHTML("afterbegin", anonymousPair);
    const next = read();
    assert.equal(new Set(next.messages.map((message) => message.id)).size, 4);
    assert.deepEqual(next.messages.slice(2).map((message) => message.id), first.messages.map((message) => message.id));
    assert.equal(next.messages[0].blocks[0].children[0].value, next.messages[2].blocks[0].children[0].value);
    assert.notEqual(next.messages[0].id, next.messages[2].id);
  } finally { dom.window.close(); }
});

test("a live anonymous node retains identity through a streaming text update", () => {
  const { dom, read } = sourceFor("grok", `<div class="chat-list">${anonymousPair}</div>`);
  try {
    const first = read();
    dom.window.document.querySelector(".markdown p").textContent = "正文继续生成";
    const next = read();
    assert.deepEqual(next.messages.map((message) => message.id), first.messages.map((message) => message.id));
    assert.equal(next.messages[1].blocks[1].children[0].value, "正文继续生成");
  } finally { dom.window.close(); }
});

test("identical content in a different native list does not recover anonymous identities", () => {
  const { dom, read } = sourceFor("grok", `<div class="chat-list">${anonymousPair}</div>`);
  try {
    const first = read();
    dom.window.document.querySelector(".chat-list").outerHTML = `<div class="chat-list">${anonymousPair}</div>`;
    assert.ok(read().messages.every((message) => !first.messages.some((prior) => prior.id === message.id)));
  } finally { dom.window.close(); }
});

test("the same anonymous content at a different scroll window remains distinct", () => {
  const { dom, read } = sourceFor("grok", `<div class="chat-list" style="overflow-y:auto">${anonymousPair}</div>`);
  try {
    const list = dom.window.document.querySelector(".chat-list");
    Object.defineProperties(list, { scrollHeight: { value: 1000 }, clientHeight: { value: 200 } });
    const first = read();
    list.innerHTML = anonymousPair;
    list.scrollTop = 400;
    assert.ok(read().messages.every((message) => !first.messages.some((prior) => prior.id === message.id)));
  } finally { dom.window.close(); }
});

for (const html of ['<div class="segment-user"><p>继续</p></div><div class="segment-user"><p>继续</p></div>', '<div class="segment-assistant"><div class="markdown"><p>正文</p></div></div>']) {
  test(`unanchored anonymous windows are not recovered merely by matching text (${html.includes("segment-user") ? "repeated prompts" : "isolated reply"})`, () => {
    const { dom, read } = sourceFor("grok", `<div class="chat-list">${html}</div>`);
    try {
      const first = read();
      dom.window.document.querySelector(".chat-list").innerHTML = html;
      assert.ok(read().messages.every((message) => !first.messages.some((prior) => prior.id === message.id)));
    } finally { dom.window.close(); }
  });
}

test("changing routes clears anonymous ownership and remount context", () => {
  const { dom, read } = sourceFor("grok", `<div class="chat-list">${anonymousPair}</div>`);
  try {
    const first = read();
    dom.window.history.pushState({}, "", "/chat/two");
    dom.window.document.querySelector(".segment-user").remove();
    const next = read();
    assert.notEqual(next.routeKey, first.routeKey);
    assert.equal(next.messages[0].replyTo, "");
  } finally { dom.window.close(); }
});

test("partly mounted bodies under one native message ID do not shift source ordinals", () => {
  const html = '<div data-message-id="a1" class="segment-assistant"><div class="markdown first"><p>第一部分</p></div><div class="markdown second"><p>第二部分</p></div></div>';
  const { dom, read } = sourceFor("grok", html);
  try {
    const first = read();
    dom.window.document.querySelector(".first").remove();
    assert.equal(read().messages[0].id, first.messages[1].id);
    dom.window.document.querySelector(".segment-assistant").innerHTML = '<div class="markdown second"><p>第二部分</p></div>';
    assert.equal(read().messages[0].id, first.messages[1].id);
  } finally { dom.window.close(); }
});

test("an ambiguous remounted native part is not guessed from its current window ordinal", () => {
  const html = '<div data-message-id="a1" class="segment-assistant"><div class="markdown first"><p>相同正文</p></div><div class="markdown second"><p>相同正文</p></div></div>';
  const { dom, read } = sourceFor("grok", html);
  try {
    const first = read();
    dom.window.document.querySelector(".first").remove();
    assert.equal(read().messages[0].id, first.messages[1].id);
    dom.window.document.querySelector(".segment-assistant").innerHTML = '<div class="markdown"><p>相同正文</p></div>';
    assert.ok(!first.messages.some((message) => message.id === read().messages[0].id));
  } finally { dom.window.close(); }
});

test("native identity remains stable when its single body streams into a replaced node", () => {
  const { dom, read } = sourceFor("grok", '<div data-message-id="a1" class="segment-assistant"><div class="markdown"><p>开始</p></div></div>');
  try {
    const first = read();
    dom.window.document.querySelector(".segment-assistant").innerHTML = '<div class="markdown"><p>开始，继续生成</p></div>';
    assert.equal(read().messages[0].id, first.messages[0].id);
  } finally { dom.window.close(); }
});

for (const sample of [
  { initial: '<div class="markdown"><p>第一部分</p></div><div class="markdown"><p>第二部分</p></div>', remount: '<div class="markdown"><p>第二部分</p></div>', part: 1 },
  { initial: '<div class="markdown"><p>开始</p></div>', remount: '<div class="markdown"><p>开始，继续生成</p></div>', part: 0 }
]) {
  test(`native part metadata survives collected DOM references (${sample.part ? "unique part" : "streaming body"})`, () => {
    const { dom, read } = sourceFor("grok", `<div data-message-id="a1" class="segment-assistant">${sample.initial}</div>`);
    const NativeWeakRef = WeakRef;
    const references = [];
    dom.window.WeakRef = class {
      constructor(value) { this.ref = new NativeWeakRef(value); references.push(this); }
      deref() { return this.collected ? undefined : this.ref.deref(); }
    };
    try {
      const originalIds = read().messages.map((message) => message.id);
      assert.equal(references.length, originalIds.length, "历史 part 必须只保留弱 DOM 引用");
      const owner = dom.window.document.querySelector(".segment-assistant");
      owner.innerHTML = ""; read();
      references.forEach((reference) => { reference.collected = true; });
      owner.innerHTML = sample.remount;
      assert.equal(read().messages[0].id, originalIds[sample.part]);
    } finally { dom.window.close(); }
  });
}

test("a recycled anonymous DOM node with a different role receives a new identity", () => {
  const dom = new JSDOM('<div class="chat-list"><div class="message"><p>继续</p></div></div>', { url: "https://grok.com/c/one" });
  const element = dom.window.document.querySelector(".message");
  let assistant = false;
  const read = createDOMConversationSource({ window: dom.window, platform: "grok", readContainers: () => ({
    userContainers: assistant ? [] : [element], assistantContainers: assistant ? [element] : []
  }) });
  try {
    const first = read();
    assistant = true;
    assert.notEqual(read().messages[0].id, first.messages[0].id);
  } finally { dom.window.close(); }
});

test("document-level replacement is not treated as a known native list remount", () => {
  const { dom, read } = sourceFor("grok", anonymousPair);
  try {
    const first = read();
    dom.window.document.body.innerHTML = anonymousPair;
    assert.ok(read().messages.every((message) => !first.messages.some((prior) => prior.id === message.id)));
  } finally { dom.window.close(); }
});

test("coverage requires valid positions covering the declared first and last items", () => {
  for (const positions of [[2, 3], [0, 1], [1.5, 2], [1, 3], [1, 2]]) {
    const { dom, read } = sourceFor("grok", `<div class="chat-list"><div aria-posinset="${positions[0]}" aria-setsize="2"><div class="segment-user"><p>问题</p></div></div><div aria-posinset="${positions[1]}" aria-setsize="2"><div class="segment-assistant"><div class="markdown"><p>回答</p></div></div></div></div>`);
    try { assert.equal(read().coverage, positions[0] === 1 && positions[1] === 2 ? "complete" : "loaded"); }
    finally { dom.window.close(); }
  }
});

test("declared positions do not prove completeness while earlier history is available or loading", () => {
  for (const suffix of ['<button>Load earlier messages</button>', '<button disabled>Load earlier messages</button>', '<div aria-busy="true"></div>', '<div data-history-loading="true"></div>']) {
    const { dom, read } = sourceFor("grok", `<div class="chat-list"><div aria-posinset="1" aria-setsize="2"><div class="segment-user"><p>问题</p></div></div><div aria-posinset="2" aria-setsize="2"><div class="segment-assistant"><div class="markdown"><p>回答</p></div></div></div>${suffix}</div>`);
    try { assert.equal(read().coverage, "loaded"); }
    finally { dom.window.close(); }
  }
});

test("nested assistant containers describe one reply while outer user containers retain attachments", () => {
  const dom = new JSDOM('<div class="message-list"><div data-message-id="u1" class="segment-user"><div class="segment-user"><p>问题</p></div><div class="file-card"><span class="file-name">report.pdf</span></div></div><div data-message-id="a1" data-conv-speaker="ai"><div class="hyc-common-markdown"><h2>答案标题</h2><p>答案正文</p></div></div></div>', { url: "https://yuanbao.tencent.com/chat/one" });
  const read = createDOMConversationSource({ window: dom.window, platform: "yuanbao", readContainers: () => ({
    userContainers: [...dom.window.document.querySelectorAll(".segment-user")],
    assistantContainers: [...dom.window.document.querySelectorAll('[data-conv-speaker="ai"] .hyc-common-markdown, [data-conv-speaker="ai"]')],
    assistantToUser: new Map([[dom.window.document.querySelector('[data-conv-speaker="ai"]'), dom.window.document.querySelector(".segment-user .segment-user")]])
  }) });
  try {
    const messages = read().messages;
    assert.equal(messages.length, 2);
    assert.deepEqual(messages.map((message) => message.role), ["user", "assistant"]);
    assert.deepEqual(messages[0].blocks.find((block) => block.type === "attachment"), { type: "attachment", name: "report.pdf" });
    assert.equal(messages[1].element.className, "hyc-common-markdown");
    assert.equal(messages[1].blocks.filter((block) => block.type === "heading").length, 1);
    assert.equal(messages[1].replyTo, messages[0].id);
  } finally { dom.window.close(); }
});

test("separate identical assistant replies survive nested-container normalization", () => {
  const dom = new JSDOM('<div class="message-list"><div data-message-id="a1" data-conv-speaker="ai"><div class="hyc-common-markdown"><p>相同回复</p></div></div><div data-message-id="a2" data-conv-speaker="ai"><div class="hyc-common-markdown"><p>相同回复</p></div></div></div>', { url: "https://yuanbao.tencent.com/chat/one" });
  const read = createDOMConversationSource({ window: dom.window, platform: "yuanbao", readContainers: () => ({
    assistantContainers: [...dom.window.document.querySelectorAll('[data-conv-speaker="ai"] .hyc-common-markdown, [data-conv-speaker="ai"]')]
  }) });
  try {
    const messages = read().messages;
    assert.equal(messages.length, 2);
    assert.equal(new Set(messages.map((message) => message.id)).size, 2);
    assert.deepEqual(messages[0].blocks, messages[1].blocks);
  } finally { dom.window.close(); }
});

test("Kimi source preserves actual file labels, paragraph formatting and user ownership", async () => {
  const { dom, read } = sourceFor("kimi");
  const index = createDOMIndexController({ window: dom.window, platform: "kimi", readMessages: read });
  try {
    index.configure(true); await index.syncMounted();
    const outline = index.outline({ enabledLevelsByPlatform: { kimi: [1, 2] } });
    assert.equal(index.snapshot().coverage, "loaded");
    assert.deepEqual(outline.items.filter((item) => item.type === "ai").map((item) => item.title), ["第一轮", "你问", "第二轮"]);
    const user = outline.items.find((item) => item.type === "user");
    assert.deepEqual(user.attachments.map((file) => [file.name, file.mimeType]), [["历史记录", "MD"]]);
    assert.match(user.title, /确认最后三轮对话/);
    assert.doesNotMatch(user.title, /Edit|Copy|Share|56.34/);
    assert.ok(outline.chapters.every((node) => node.title !== "Full text"));
    assert.match(chapterTreeText(outline.chapters), /已确认/);
    assert.doesNotMatch(chapterTreeText(outline.chapters), /思考标题/);
    assert.equal(index.exportConversation().scope, "loaded");
  } finally { index.dispose(); dom.window.close(); }
});

test("Kimi native IDs and question ownership survive virtual remounts", () => {
  const { dom, read } = sourceFor("kimi");
  try {
    const first = read();
    const parent = first.messages[0].element.closest(".chat-content-item");
    parent.remove();
    assert.equal(read().messages[0].replyTo, first.messages[0].id);
    dom.window.document.querySelector(".chat-content-list").insertAdjacentHTML("afterbegin", parent.outerHTML);
    assert.deepEqual(read().messages.map((message) => message.id), first.messages.map((message) => message.id));
    assert.notEqual(first.messages[0].id, first.messages[1].id);
  } finally { dom.window.close(); }
});

test("tracking changes keep identity; a different conversation clears source ownership", () => {
  const { dom, read } = sourceFor("kimi");
  try {
    const first = read();
    dom.window.history.pushState({}, "", "?chat_enter_method=history");
    assert.equal(read().routeKey, first.routeKey);
    dom.window.document.querySelector(".chat-content-item-user").remove();
    dom.window.history.pushState({}, "", "/chat/two");
    assert.equal(read().messages[0].replyTo, "");
    assert.notEqual(read().routeKey, first.routeKey);
  } finally { dom.window.close(); }
});

for (const platform of ["claude", "grok", "doubao", "kimi", "qianwen", "yuanbao", "xiaohongshu", "manus", "deepseek"]) {
  test(`${platform} shares structured image, attachment and heading indexing`, async () => {
    const html = `<div data-message-id="u" class="segment-user"><p>问题</p><div class="file-card"><span class="file-name">report.pdf</span></div><img src="https://cdn.test/input.png" alt="上传图片"></div><div data-message-id="a" class="segment-assistant"><div class="markdown"><h2>答案标题</h2><p>答案正文</p><img src="https://cdn.test/output.png" alt="生成图片"></div></div>`;
    const { dom, read } = sourceFor(platform, html);
    const index = createDOMIndexController({ window: dom.window, platform, readMessages: read });
    try {
      index.configure(true); await index.syncMounted();
      const outline = index.outline();
      assert.equal(outline.items.find((item) => item.type === "user").imageCount, 1);
      assert.ok(outline.items.some((item) => item.image && item.title === "生成图片"));
      assert.ok(outline.items.some((item) => item.title === "答案标题"));
      assert.equal(index.snapshot().count, 2);
    } finally { index.dispose(); dom.window.close(); }
  });
}

test("a sized virtual-list placeholder in view reports pending history rendering", () => {
  const { dom, read } = sourceFor("grok", `<div id="list" style="overflow-y:auto">
    <div data-turn-id-container="a" data-is-intersecting="true">${anonymousPair}</div>
    <div data-turn-id-container="b" data-is-intersecting="false"></div></div>`);
  const win = dom.window; const list = win.document.querySelector("#list");
  Object.defineProperties(list, { scrollHeight: { value: 2000 }, clientHeight: { value: 500 } });
  let placeholder = { top: 600, bottom: 900, height: 300 };
  win.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this === list) return { top: 0, bottom: 500, height: 500 };
    if (this.dataset.turnIdContainer === "b") return placeholder;
    return { top: 0, bottom: 100, height: 100 };
  };
  assert.equal(read().historyLoading, false, "a placeholder below the viewport is not pending");
  placeholder = { top: 300, bottom: 600, height: 300 };
  assert.equal(read().historyLoading, true);
  placeholder = { top: 300, bottom: 300, height: 0 };
  assert.equal(read().historyLoading, false, "empty structural containers are ignored");
  dom.window.close();
});
