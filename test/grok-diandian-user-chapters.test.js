import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { JSDOM } from "jsdom";
import { HASHED_MARKDOWN_ROOT_SELECTOR } from "../src/hashed-markdown.js";
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

const selectorsStart = content.indexOf("  const ASSISTANT_MESSAGE_SELECTOR =");
const selectorsEnd = content.indexOf("  const USER_INPUT_SELECTOR =", selectorsStart);
assert.ok(selectorsStart >= 0 && selectorsEnd > selectorsStart);

function chaptersFor(platform, html, url = platform === "grok" ? "https://grok.com/c/test" : "https://www.xiaohongshu.com/ai_chat?conversationId=test") {
  const dom = new JSDOM(platform === "grok" ? `<div>${html}</div>` : `<div class="xhs-ai-chat-page">${html}</div>`, { url });
  const platformChecks = Object.fromEntries(["ChatGPT", "Doubao", "DeepSeek", "Qianwen", "Manus", "Gemini", "Yuanbao", "Kimi", "Claude"].map((name) => [`is${name}Page`, () => false]));
  const runtime = runInNewContext(`${content.slice(selectorsStart, selectorsEnd)}
    ${functionSource("isXiaohongshuPage", "isSupportedRoute")}
    ${functionSource("isGrokPage", "isManusPage")}
    ${functionSource("withHashedMarkdownSelectors", "getAssistantContainerSelectors")}
    ${functionSource("getAssistantContainerSelectors", "logDiscardedConversationNodes")}
    ${functionSource("getAssistantContainers", "getUserContainerSelectors")}
    ${functionSource("getUserContainerSelectors", "doubaoMessageRoleForContainer")}
    ${functionSource("getUserContainers", "normalizeTitle")}
    ${functionSource("normalizeTitle", "userMessageImageSelector")}
    ${functionSource("makeUserMarkerItem", "dedupeAdjacentGroupHeadings")}
    ${functionSource("collectWindowChapterSections", "activeExplosionSectionIndexFromState")}
    function collectMarkerRenderSnapshot() {
      const assistantContainers = getAssistantContainers();
      const userContainers = getUserContainers();
      const headings = assistantContainers.flatMap(container => Array.from(container.querySelectorAll("h2, h3")).map(element => ({
        element, title: element.textContent, level: Number(element.tagName.slice(1)), markerKey: element.id
      })));
      return { assistantContainers, userContainers, headings, markerGroups: collectMarkerGroups(userContainers, assistantContainers, headings) };
    }
    ({ collect: collectWindowChapterSections, snapshot: collectMarkerRenderSnapshot() })`, {
    ...platformChecks,
    HTMLElement: dom.window.HTMLElement,
    window: dom.window,
    document: dom.window.document,
    location: dom.window.location,
    HASHED_MARKDOWN_ROOT_SELECTOR,
    isVisible: (element) => !element.closest("[hidden]"),
    isInsideNavigationRoot: (element) => Boolean(element.closest("#gpt-paragraph-nav")),
    isUserInputContext: (element) => Boolean(element.closest('[contenteditable="true"]')),
    logDiscardedConversationNodes: () => {},
    currentRouteKey: () => dom.window.location.href,
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
  });
  const tree = [];
  runtime.collect(tree);
  dom.window.close();
  return { tree, snapshot: runtime.snapshot };
}

const platforms = {
  grok: {
    user: (id, text) => `<div id="${id}" data-testid="user-message"><div class="response-content-markdown markdown"><p>${text}</p></div></div>`,
    answer: (html) => `<div data-testid="assistant-message"><div class="response-content-markdown markdown">${html}</div></div>`
  },
  diandian: {
    user: (id, text) => `<div id="${id}" class="user-message-wrapper"><div class="user-message"><div class="user-message__text">${text}</div></div></div>`,
    answer: (html) => `<div class="xhs-ai-message-copy-wrapper"><div class="ai-message ai-message-finished"><div class="xhs-ai-md-container"><div class="markdown-block">${html}</div></div></div></div>`
  }
};

for (const [platform, { user, answer }] of Object.entries(platforms)) {
  test(`${platform} chapters use the user prompt and extract only the answer body`, () => {
    const { tree, snapshot } = chaptersFor(platform, `<div class="round-item">${user("u1", "讲解通用能力")}${answer("<p>回答正文</p>")}</div>`);
    assert.equal(snapshot.userContainers.length, 1);
    assert.equal(snapshot.assistantContainers.length, 1);
    assert.equal(snapshot.assistantContainers[0].textContent, "回答正文");
    assert.equal(tree[0].title, "讲解通用能力");
    assert.equal(tree[0].sourceKey, "u1");
    assert.equal(chapterTreeText(tree), "讲解通用能力\n\n回答正文");
  });

  test(`${platform} chapters keep introductions and nested headings under their prompt`, () => {
    const { tree } = chaptersFor(platform, `<div class="round-item">${user("u1", "详细说明")}${answer('<p>引言</p><h2 id="h1">父章</h2><p>父章正文</p><h3 id="h2">子章</h3><p>子章正文</p>')}</div>`);
    assert.equal(tree.find((node) => node.markerKey === "h1").parentKey, "u1");
    assert.equal(tree.find((node) => node.markerKey === "h2").parentKey, "h1");
    assert.equal(chapterTreeText(tree), "详细说明\n\n引言\n\n父章\n\n父章正文\n\n子章\n\n子章正文");
    assert.ok(tree.every((node) => node.title !== "Full text"));
  });

  test(`${platform} chapters preserve identical prompts, multiple answer bodies and pending turns`, () => {
    const { tree } = chaptersFor(platform, user("u1", "继续") + answer("<p>第一轮</p>") + answer("<p>补充</p>") + user("u2", "继续") + answer("<p>第二轮</p>") + user("u3", "待回答"));
    assert.deepEqual(tree.map((node) => node.markerKey), ["u1", "u2", "u3"]);
    assert.equal(chapterTreeText(tree, "u1"), "继续\n\n第一轮\n\n补充");
    assert.equal(chapterTreeText(tree, "u2"), "继续\n\n第二轮");
    assert.equal(chapterTreeText(tree, "u3"), "待回答");
  });

  test(`${platform} never treats a pending user message as an assistant reply`, () => {
    const { tree, snapshot } = chaptersFor(platform, `<div class="round-item">${user("u1", "等待回复")}</div>`);
    assert.equal(snapshot.assistantContainers.length, 0);
    assert.equal(chapterTreeText(tree), "等待回复");
  });

  test(`${platform} keeps Full text only for answers without a mounted user source`, () => {
    const { tree } = chaptersFor(platform, answer("<p>未归属回答</p>") + `<section hidden>${user("hidden", "隐藏提问")}</section>` + user("u1", "当前提问") + answer("<p>当前回答</p>"));
    assert.deepEqual(tree.filter((node) => !node.parentKey).map((node) => node.title), ["Full text", "当前提问"]);
    assert.equal(chapterTreeText(tree, "u1"), "当前提问\n\n当前回答");
  });
}

test("Grok keeps support for conversations inside the legacy main wrapper", () => {
  const { user, answer } = platforms.grok;
  const { tree } = chaptersFor("grok", `<main>${user("u1", "旧版提问")}${answer("<p>旧版回答</p>")}</main>`);
  assert.equal(chapterTreeText(tree), "旧版提问\n\n旧版回答");
});

test("Diandian keeps legacy Markdown extraction without duplicating nested answer bodies", () => {
  const { user } = platforms.diandian;
  const { tree, snapshot } = chaptersFor("diandian", user("u1", "旧版提问") + '<div class="ai-message"><div class="xhs-ai-md-container"><div class="markdown-styles-diandian-main-v3"><p>旧版回答</p></div></div></div>');
  assert.equal(snapshot.assistantContainers.length, 1);
  assert.equal(chapterTreeText(tree), "旧版提问\n\n旧版回答");
  const legacy = chaptersFor("diandian", user("u1", "旧版提问") + '<div class="markdown-styles-diandian-main-v3"><p>旧版回答</p></div>');
  assert.equal(chapterTreeText(legacy.tree), "旧版提问\n\n旧版回答");
});

for (const url of ["https://diandian.xiaohongshu.com/chat/test", "https://www.askdiandian.com/chat/test", "https://www.diandianlife.top/chat/test"]) {
  test(`Diandian user chapters work on ${new URL(url).hostname}`, () => {
    const { user, answer } = platforms.diandian;
    const { tree } = chaptersFor("diandian", user("u1", "平台提问") + answer("<p>平台回答</p>"), url);
    assert.equal(chapterTreeText(tree), "平台提问\n\n平台回答");
  });
}
