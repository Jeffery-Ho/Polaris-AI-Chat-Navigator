import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { JSDOM } from "jsdom";
import { collectDeepSeekConversation, deepseekUserMessageText } from "../src/deepseek-messages.js";
import { collectSidepanelChapters } from "../src/sidepanel-chapter-content.js";
import { buildWindowChapterOutline } from "../src/window-chapter-outline.js";
import { chapterTreeText } from "../src/sidepanel-chapter-state.js";

const content = readFileSync(new URL("../src/content.js", import.meta.url), "utf8");
const start = content.indexOf("  function collectWindowChapterSections(");
const end = content.indexOf("  function activeExplosionSectionIndexFromState(", start);
const snapshotStart = content.indexOf("  function collectMarkerRenderSnapshot(");
const snapshotEnd = content.indexOf("  function render(", snapshotStart);
const groupsStart = content.indexOf("  function assistantContainerForHeading(");
const groupsEnd = content.indexOf("  function dedupeAdjacentGroupHeadings(", groupsStart);
assert.ok(start >= 0 && end > start && snapshotStart >= 0 && snapshotEnd > snapshotStart && groupsStart >= 0 && groupsEnd > groupsStart);

function chapters(html) {
  const dom = new JSDOM(`<main><div class="ds-virtual-list ds-scroll-area"><div class="ds-virtual-list-visible-items">${html}</div></div></main>`, { url: "https://chat.deepseek.com/a/chat/test" });
  const users = new Map();
  const collect = runInNewContext(`${content.slice(groupsStart, groupsEnd)}\n${content.slice(snapshotStart, snapshotEnd)}\n${content.slice(start, end)}\ncollectWindowChapterSections;`, {
    HTMLElement: dom.window.HTMLElement,
    window: dom.window,
    location: dom.window.location,
    state: {},
    createMarkerScanContext: () => ({}),
    getDeepSeekConversation: () => collectDeepSeekConversation(dom.window.document),
    isManusPage: () => false,
    isXiaohongshuMainChatPage: () => false,
    collectHeadings: (containers) => containers.flatMap((container) => [...container.querySelectorAll("h2, h3")].map((element) => ({
      element, markerKey: element.id, title: element.textContent, level: Number(element.tagName.slice(1))
    }))),
    makeUserMarkerItem: (element) => {
      if (!users.has(element)) users.set(element, `user-${users.size}`);
      return { element, markerKey: users.get(element), title: deepseekUserMessageText(element) };
    },
    compareConversationPosition: (left, right) => {
      const position = left.compareDocumentPosition(right);
      return position & 4 ? -1 : position & 2 ? 1 : 0;
    },
    dedupeAdjacentGroupHeadings: (groups) => groups,
    isHeadingEnabledForCurrentConfig: () => true,
    getConversationMetrics: () => ({}),
    debugCollection: () => {},
    currentElementForHeading: (heading) => heading.element,
    markerKeyForHeading: (heading) => heading.markerKey,
    collectSidepanelChapters, buildWindowChapterOutline,
    isChatGPTPage: () => false,
    isDoubaoPage: () => false,
    isDeepSeekPage: () => true,
    t: () => "Full text",
    windowChapterBlocksFromRange: () => [],
    collectExplosionBlocks: () => [],
    fallbackExplosionSection: () => ({})
  });
  const result = [];
  collect(result);
  dom.window.close();
  return result;
}

const user = (key, text) => `<div data-virtual-list-item-key="${key}"><div class="ds-message"><div class="ds-collapsible-text">${text}</div><button>Edit</button></div></div>`;
const answer = (key, html) => `<div data-virtual-list-item-key="${key}"><div class="ds-message"><div class="ds-markdown ds-assistant-message-main-content">${html}</div></div></div>`;

test("DeepSeek chapter titles use the mounted user prompt instead of Full text", () => {
  const nodes = chapters(user(1, "说明这个问题") + answer(2, '<p>回答引言</p><h2 id="detail">详细说明</h2><p>回答正文</p>'));
  assert.equal(nodes[0].title, "说明这个问题");
  assert.equal(nodes[0].sourceKey, "user-0");
  assert.equal(nodes.find((node) => node.markerKey === "detail").parentKey, "user-0");
  assert.equal(chapterTreeText(nodes), "说明这个问题\n\n回答引言\n\n详细说明\n\n回答正文");
  assert.ok(nodes.every((node) => node.title !== "Full text"));
});

test("DeepSeek keeps repeated prompts, short replies and pending questions separate", () => {
  const nodes = chapters(user(1, "继续") + answer(2, "<p>第一轮回答</p>") + user(3, "继续") + answer(4, "<p>第二轮回答</p>") + user(5, "待回答"));
  assert.deepEqual(nodes.map((node) => node.title), ["继续", "继续", "待回答"]);
  assert.equal(chapterTreeText(nodes, "user-0"), "继续\n\n第一轮回答");
  assert.equal(chapterTreeText(nodes, "user-1"), "继续\n\n第二轮回答");
  assert.equal(chapterTreeText(nodes, "user-2"), "待回答");
});

test("DeepSeek does not place replies across virtual-list gaps under the preceding prompt", () => {
  const nodes = chapters(user(1, "较早的问题") + answer(4, '<p>未归属回答</p><h2 id="orphan">未归属章节</h2><p>章节正文</p>') + user(5, "当前问题") + answer(6, "<p>当前回答</p>"));
  assert.equal(chapterTreeText(nodes, "user-0"), "较早的问题");
  assert.equal(nodes.find((node) => node.markerKey === "orphan").parentKey, "");
  assert.equal(nodes.find((node) => node.synthetic).title, "Full text");
  assert.equal(chapterTreeText(nodes, "user-1"), "当前问题\n\n当前回答");
});

test("DeepSeek keeps an answer with no mounted user available as Full text", () => {
  const nodes = chapters(answer(2, "<p>用户消息已卸载的回答</p>"));
  assert.equal(nodes[0].title, "Full text");
  assert.equal(chapterTreeText(nodes), "用户消息已卸载的回答");
});
