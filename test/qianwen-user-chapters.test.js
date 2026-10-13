import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { JSDOM } from "jsdom";
import { collectSidepanelChapters } from "../src/sidepanel-chapter-content.js";
import { chapterTreeText } from "../src/sidepanel-chapter-state.js";
import { buildWindowChapterOutline } from "../src/window-chapter-outline.js";

const content = readFileSync(new URL("../src/content.js", import.meta.url), "utf8");
const start = content.indexOf("  function collectWindowChapterSections(");
const end = content.indexOf("  function activeExplosionSectionIndexFromState(", start);
assert.ok(start >= 0 && end > start);

function chaptersFor(html) {
  const dom = new JSDOM(html, { url: "https://www.qianwen.com/chat/test" });
  const doc = dom.window.document;
  const assistantContainers = [...doc.querySelectorAll('[class*="message-select-wrapper-answer"] .qk-markdown')];
  const headings = assistantContainers.flatMap((container) => [...container.querySelectorAll("h2, h3")].map((element) => ({
    element, title: element.textContent, level: Number(element.tagName.slice(1)), markerKey: element.id
  })));
  const markerGroups = [...doc.querySelectorAll('[class*="message-select-wrapper-question"]')].map((element) => ({
    user: { element, title: element.textContent, markerKey: element.id }, headings: []
  }));
  const collect = runInNewContext(`${content.slice(start, end)}\ncollectWindowChapterSections`, {
    HTMLElement: dom.window.HTMLElement,
    location: dom.window.location,
    collectMarkerRenderSnapshot: () => ({ assistantContainers, headings, markerGroups }),
    currentElementForHeading: (heading) => heading.element,
    markerKeyForHeading: (heading) => heading.markerKey,
    isChatGPTPage: () => false,
    isDoubaoPage: () => false,
    isDeepSeekPage: () => false,
    isQianwenPage: () => true,
    collectSidepanelChapters,
    buildWindowChapterOutline,
    t: () => "Full text",
    collectExplosionBlocks: () => [],
    fallbackExplosionSection: (blocks) => ({ title: "Full text", blocks }),
    windowChapterBlocksFromRange: () => []
  });
  const tree = [];
  const standalone = collect(tree);
  dom.window.close();
  return { tree, standalone };
}

const user = (id, text) => `<div id="${id}" class="message-select-wrapper-question">${text}</div>`;
const answer = (html) => `<div class="message-select-wrapper-answer"><div class="qk-markdown">${html}</div></div>`;

test("Qwen Chapters use the user prompt instead of Full text", () => {
  const { tree } = chaptersFor(user("u1", "你好") + answer("<p>你好呀！</p>"));
  assert.equal(tree[0].title, "你好");
  assert.equal(tree[0].sourceKey, "u1");
  assert.equal(chapterTreeText(tree), "你好\n\n你好呀！");
});

test("Qwen Chapters keep answer introductions and headings under their prompt", () => {
  const { tree } = chaptersFor(user("u1", "详细讲解一下苹果公司历史") + answer('<p>发展历程分为以下阶段。</p><h3 id="h1">车库萌芽</h3><p>创立苹果。</p><h3 id="h2">库克时代</h3><p>持续创新。</p>'));
  assert.equal(tree[0].title, "详细讲解一下苹果公司历史");
  assert.equal(tree.find((node) => node.markerKey === "h1").parentKey, "u1");
  assert.equal(tree.find((node) => node.markerKey === "h2").parentKey, "u1");
  assert.equal(chapterTreeText(tree), "详细讲解一下苹果公司历史\n\n发展历程分为以下阶段。\n\n车库萌芽\n\n创立苹果。\n\n库克时代\n\n持续创新。");
  assert.ok(tree.every((node) => node.title !== "Full text"));
});

test("Qwen Chapters retain repeated prompts, multiple answer bodies and pending turns", () => {
  const { tree } = chaptersFor(user("u1", "继续") + answer("<p>第一轮回答</p>") + answer("<p>补充说明</p>") + user("u2", "继续") + answer("<p>第二轮回答</p>") + user("u3", "待回答"));
  assert.deepEqual(tree.map((node) => node.markerKey), ["u1", "u2", "u3"]);
  assert.equal(chapterTreeText(tree, "u1"), "继续\n\n第一轮回答\n\n补充说明");
  assert.equal(chapterTreeText(tree, "u2"), "继续\n\n第二轮回答");
  assert.equal(chapterTreeText(tree, "u3"), "待回答");
});

test("Qwen Chapters preserve Full text for orphan replies and standalone answer sections", () => {
  const { tree, standalone } = chaptersFor(answer("<p>未找到用户来源的回答</p>") + user("u1", "当前提问") + answer('<h3 id="h1">当前标题</h3><p>当前回答</p>'));
  assert.deepEqual(tree.filter((node) => !node.parentKey).map((node) => node.title), ["Full text", "当前提问"]);
  assert.equal(standalone.length, 1);
  assert.equal(standalone[0].title, "当前标题");
});
