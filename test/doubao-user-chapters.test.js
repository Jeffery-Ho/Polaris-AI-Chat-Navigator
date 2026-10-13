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

function chaptersFor(html, { platform = "doubao" } = {}) {
  const dom = new JSDOM(html, { url: `https://www.${platform}.com/chat/test` });
  const doc = dom.window.document;
  const assistantContainers = [...doc.querySelectorAll(".receive-message-box")];
  const headings = assistantContainers.flatMap((container) => [...container.querySelectorAll("h2, h3")].map((element) => ({
    element, title: element.textContent, level: Number(element.tagName.slice(1)), markerKey: element.id
  })));
  const markerGroups = [...doc.querySelectorAll(".bg-g-send-msg-bubble-bg")].map((element) => ({
    user: { element, title: element.textContent, markerKey: element.id }, headings: []
  }));
  const collect = runInNewContext(`${content.slice(start, end)}\ncollectWindowChapterSections`, {
    HTMLElement: dom.window.HTMLElement,
    location: dom.window.location,
    collectMarkerRenderSnapshot: () => ({ assistantContainers, headings, markerGroups }),
    currentElementForHeading: (heading) => heading.element,
    markerKeyForHeading: (heading) => heading.markerKey,
    isChatGPTPage: () => platform === "chatgpt",
    isDoubaoPage: () => platform === "doubao",
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

test("Doubao Chapters render the user prompt instead of a Full text root", () => {
  const { tree } = chaptersFor('<main><div id="u1" class="bg-g-send-msg-bubble-bg">减脂期间适合吃什么食物</div><div class="receive-message-box"><p>以下是饮食建议。</p><h2 id="h1">减脂适合吃的食物</h2><p>搭配蛋白质与蔬菜。</p></div></main>');
  assert.equal(tree[0].title, "减脂期间适合吃什么食物");
  assert.equal(tree[0].sourceKey, "u1");
  assert.equal(tree.find((node) => node.markerKey === "h1").parentKey, "u1");
  assert.equal(chapterTreeText(tree), "减脂期间适合吃什么食物\n\n以下是饮食建议。\n\n减脂适合吃的食物\n\n搭配蛋白质与蔬菜。");
});

test("Doubao Chapters retain repeated prompts, headingless replies and unanswered turns", () => {
  const { tree } = chaptersFor('<main><div id="u1" class="bg-g-send-msg-bubble-bg">继续</div><div class="receive-message-box"><p>第一轮回答</p></div><div id="u2" class="bg-g-send-msg-bubble-bg">继续</div><div class="receive-message-box"><h2 id="h2">建议</h2><p>第二轮回答</p></div><div id="u3" class="bg-g-send-msg-bubble-bg">尚未回答的问题</div></main>');
  assert.deepEqual(tree.filter((node) => !node.parentKey).map((node) => node.markerKey), ["u1", "u2", "u3"]);
  assert.equal(chapterTreeText(tree, "u1"), "继续\n\n第一轮回答");
  assert.equal(chapterTreeText(tree, "u2"), "继续\n\n建议\n\n第二轮回答");
  assert.equal(chapterTreeText(tree, "u3"), "尚未回答的问题");
});

test("Doubao retains Full text for orphan replies and standalone answer sections", () => {
  const { tree, standalone } = chaptersFor('<main><div class="receive-message-box"><p>较早回答</p></div><div id="u1" class="bg-g-send-msg-bubble-bg">当前提问</div><div class="receive-message-box"><h2 id="h1">当前标题</h2><p>当前回答</p></div></main>');
  assert.deepEqual(tree.filter((node) => !node.parentKey).map((node) => node.title), ["Full text", "当前提问"]);
  assert.equal(standalone.length, 1);
  assert.equal(standalone[0].title, "当前标题");
});
