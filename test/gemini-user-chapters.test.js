import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { JSDOM } from "jsdom";
import { collectSidepanelChapters } from "../src/sidepanel-chapter-content.js";
import { chapterTreeText } from "../src/sidepanel-chapter-state.js";
import { buildWindowChapterOutline } from "../src/window-chapter-outline.js";

const content = readFileSync(new URL("../src/content.js", import.meta.url), "utf8");
function functionSource(name, nextName) {
  const start = content.indexOf(`  function ${name}(`);
  const end = content.indexOf(`  function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start);
  return content.slice(start, end);
}

function chaptersFor(html) {
  const dom = new JSDOM(`<main>${html}</main>`, { url: "https://gemini.google.com/app/test" });
  const doc = dom.window.document;
  const assistantContainers = [...doc.querySelectorAll("model-response message-content")];
  const headings = assistantContainers.flatMap((container) => [...container.querySelectorAll("h2, h3")].map((element) => ({
    element, title: element.textContent, level: Number(element.tagName.slice(1)), markerKey: element.id
  })));
  const platformChecks = Object.fromEntries(["ChatGPT", "Doubao", "DeepSeek", "Qianwen", "Manus", "Xiaohongshu", "Grok", "Yuanbao", "Kimi", "Claude"].map((name) => [`is${name}Page`, () => false]));
  const scope = {
    ...platformChecks,
    isGeminiPage: () => true,
    isUnsupportedXiaohongshuMainPage: () => false,
    isXiaohongshuMainChatPage: () => false,
    HTMLElement: dom.window.HTMLElement,
    document: doc,
    location: dom.window.location,
    isVisible: (element) => !element.closest("[hidden]"),
    isInsideNavigationRoot: () => false,
    isUserInputContext: () => false,
    userMessageThumbnail: () => ({}),
    markerKeyFor: (element) => element.id,
    MAX_USER_PREVIEW_LENGTH: 160,
    compareConversationPosition: (left, right) => {
      const position = left.compareDocumentPosition(right);
      return position & 4 ? -1 : position & 2 ? 1 : 0;
    },
    currentElementForHeading: (heading) => heading.element,
    markerKeyForHeading: (heading) => heading.markerKey,
    collectSidepanelChapters,
    buildWindowChapterOutline,
    t: () => "Full text",
    collectExplosionBlocks: () => [],
    fallbackExplosionSection: (blocks) => ({ title: "Full text", blocks }),
    windowChapterBlocksFromRange: () => []
  };
  const constants = content.split("\n").filter((line) => /^  const (GEMINI_USER_|USER_MESSAGE_SELECTOR)/.test(line)).join("\n");
  const runtime = runInNewContext(`${constants}
    ${functionSource("getUserContainerSelectors", "doubaoMessageRoleForContainer")}
    ${functionSource("getUserContainers", "getXiaohongshuUserFallbackContainers")}
    ${functionSource("normalizeTitle", "userMessageImageSelector")}
    ${functionSource("makeUserMarkerItem", "dedupeAdjacentGroupHeadings")}
    ${functionSource("collectWindowChapterSections", "activeExplosionSectionIndexFromState")}
    function collectMarkerRenderSnapshot() {
      return { assistantContainers, headings, markerGroups: collectMarkerGroups(getUserContainers(), assistantContainers, headings) };
    }
    ({ collect: collectWindowChapterSections, snapshot: collectMarkerRenderSnapshot() })`, { ...scope, assistantContainers, headings });
  const tree = [];
  const standalone = runtime.collect(tree);
  dom.window.close();
  return { tree, standalone, markerGroups: runtime.snapshot.markerGroups };
}

const user = (id, text) => `<user-query id="${id}"><span>You said</span><div class="query-content"><p class="query-text-line">${text}</p></div><button>Edit</button></user-query>`;
const answer = (html) => `<model-response><message-content>${html}</message-content></model-response>`;

test("Gemini Chapters render the user prompt from the screenshot instead of Full text", () => {
  const prompt = "MacBook Pro可以离线跑诊断工具吗";
  const { tree, markerGroups } = chaptersFor(user("u1", prompt) + answer("<p>可以。Apple Diagnostics 支持离线执行。</p>"));
  assert.equal(markerGroups[0].user.title, prompt);
  assert.equal(markerGroups[0].hasAssistantMessage, true);
  assert.equal(tree[0].title, prompt);
  assert.equal(tree[0].markerKey, "u1");
  assert.equal(tree[0].sourceKey, "u1");
  assert.equal(chapterTreeText(tree), `${prompt}\n\n可以。Apple Diagnostics 支持离线执行。`);
});

test("Gemini Chapters keep answer introductions and nested headings under the user prompt", () => {
  const { tree } = chaptersFor(user("u1", "如何运行诊断") + answer('<p>可以离线运行。</p><h2 id="h1">进入诊断模式</h2><p>关机后操作。</p><h3 id="h2">Apple 芯片</h3><p>按住电源键。</p><h2 id="h3">检测区别</h2><p>说明。</p>'));
  assert.equal(tree[0].title, "如何运行诊断");
  assert.equal(tree.find((node) => node.markerKey === "h1").parentKey, "u1");
  assert.equal(tree.find((node) => node.markerKey === "h2").parentKey, "h1");
  assert.equal(tree.find((node) => node.markerKey === "h3").parentKey, "u1");
  assert.equal(chapterTreeText(tree), "如何运行诊断\n\n可以离线运行。\n\n进入诊断模式\n\n关机后操作。\n\nApple 芯片\n\n按住电源键。\n\n检测区别\n\n说明。");
  assert.ok(tree.every((node) => node.title !== "Full text"));
});

test("Gemini Chapters retain repeated prompts, multiple answer bodies and pending turns", () => {
  const { tree } = chaptersFor(user("u1", "继续") + answer("<p>第一轮回答</p>") + answer("<p>补充说明</p>") + user("u2", "继续") + answer("<p>第二轮回答</p>") + user("u3", "待回答"));
  assert.deepEqual(tree.map((node) => node.markerKey), ["u1", "u2", "u3"]);
  assert.equal(chapterTreeText(tree, "u1"), "继续\n\n第一轮回答\n\n补充说明");
  assert.equal(chapterTreeText(tree, "u2"), "继续\n\n第二轮回答");
  assert.equal(chapterTreeText(tree, "u3"), "待回答");
});

test("Gemini user titles keep all query lines and omit role labels and controls", () => {
  const prompt = '<user-query id="u1"><span>你说：</span><div class="query-text"><p class="query-text-line">第一行</p><p class="query-text-line">第二行</p></div><button>编辑</button></user-query>';
  const { tree, markerGroups } = chaptersFor(prompt + answer("<p>回答正文</p>"));
  assert.equal(markerGroups[0].user.title, "第一行 第二行");
  assert.equal(markerGroups[0].user.previewTitle, "第一行");
  assert.equal(tree[0].title, "第一行 第二行");
  assert.equal(chapterTreeText(tree), "第一行 第二行\n\n回答正文");
});

test("Gemini user titles exclude the screen-reader heading that repeats the visible prompt", () => {
  const text = "MacBook Pro可以离线跑诊断工具吗";
  const prompt = `<user-query id="u1"><div class="query-content"><h5 class="cdk-visually-hidden">你話 ${text}</h5><div class="query-text"><p class="query-text-line">${text}</p></div></div><button>编辑</button></user-query>`;
  const { tree, markerGroups } = chaptersFor(prompt + answer("<p>回答正文</p>"));
  assert.equal(markerGroups[0].user.title, text);
  assert.equal(markerGroups[0].user.previewTitle, text);
  assert.equal(tree[0].title, text);
  assert.equal(chapterTreeText(tree), `${text}\n\n回答正文`);
});

test("Gemini extraction preserves deliberately repeated lines inside one prompt", () => {
  const prompt = '<user-query id="u1"><div class="query-content"><h5 class="cdk-visually-hidden">你話 重复 重复</h5><div class="query-text"><p class="query-text-line">重复</p><p class="query-text-line">重复</p></div></div></user-query>';
  const { tree } = chaptersFor(prompt);
  assert.equal(tree[0].title, "重复 重复");
});

test("Gemini extraction prefers the query body when line wrappers are absent", () => {
  const prompt = '<user-query id="u1"><div class="query-content"><h5 class="cdk-visually-hidden">你話 问题正文</h5><div class="query-text">问题正文</div></div></user-query>';
  const { tree } = chaptersFor(prompt);
  assert.equal(tree[0].title, "问题正文");
});

test("Gemini Chapters preserve Full text for orphan replies and standalone answer sections", () => {
  const hidden = '<user-query id="hidden" hidden><div class="query-content">隐藏问题</div></user-query>';
  const { tree, standalone } = chaptersFor(hidden + answer("<p>未找到用户来源的回答</p>") + user("u1", "当前提问") + answer('<h3 id="h1">当前标题</h3><p>当前回答</p>'));
  assert.deepEqual(tree.filter((node) => !node.parentKey).map((node) => node.title), ["Full text", "当前提问"]);
  assert.equal(chapterTreeText(tree, "u1"), "当前提问\n\n当前标题\n\n当前回答");
  assert.equal(standalone.length, 1);
  assert.equal(standalone[0].title, "当前标题");
});
