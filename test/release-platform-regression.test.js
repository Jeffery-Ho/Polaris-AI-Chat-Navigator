import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";
import { JSDOM } from "jsdom";
import * as chatgpt from "../src/chatgpt-messages.js";
import * as deepseek from "../src/deepseek-messages.js";
import * as manus from "../src/manus-messages.js";
import { HASHED_MARKDOWN_ROOT_SELECTOR } from "../src/hashed-markdown.js";
import { doubaoMessageRoleFromClassNames } from "../src/doubao-message-role.js";
import { createDOMConversationSource } from "../src/dom-conversation-source.js";
import { createConversationIndex } from "../src/conversation-index.js";
import { buildConversationExport } from "../src/conversation-export.js";
import { chapterTreeText } from "../src/sidepanel-chapter-state.js";
import { SUPPORTED_PLATFORMS } from "../src/supported-platforms.js";
import { fixtureURL, fixturePage, expected, fixtureKeys } from "../test-support/release-fixtures.js";

// Exercise the same closed-over collectors used by the content entrypoint.
// Layout-dependent visibility and browser chrome are covered by the E2E suite.
const source = readFileSync(new URL("../src/content.js", import.meta.url), "utf8");
function section(start, end) {
  const left = source.indexOf(start);
  const right = source.indexOf(end, left);
  assert.ok(left >= 0 && right > left, "Missing collector boundary: " + start);
  return source.slice(left, right);
}
const collectors = new Script([
  section("  const ASSISTANT_MESSAGE_SELECTOR", "  const CONTROLS_CLASS"),
  section("  function isDoubaoPage(", "  function currentModelLabel("),
  section("  function withHashedMarkdownSelectors(", "  function getXiaohongshuUserFallbackContainers("),
  '() => isDeepSeekPage() ? getDeepSeekConversation() : isManusPage() ? getManusConversation() : ({ userContainers: getUserContainers(), assistantContainers: getAssistantContainers() })'
].join("\n"));

test("发布样本覆盖所有支持的平台", () => {
  assert.deepEqual(fixtureKeys, SUPPORTED_PLATFORMS.map(p => p.key).sort());
});

for (const key of fixtureKeys) {
  test(key + " 合成会话归属、目录、复制、导出、流式更新与切换", async t => {
    const dom = new JSDOM(fixturePage(key), { url: fixtureURL(key), runScripts: "dangerously" });
    t.after(() => dom.window.close());
    const { document, HTMLElement } = dom.window;
    const readContainers = collectors.runInNewContext({
      window: dom.window, document, HTMLElement, console, ...chatgpt, ...deepseek, ...manus,
      HASHED_MARKDOWN_ROOT_SELECTOR, doubaoMessageRoleFromClassNames,
      isVisible: node => !node.closest("[hidden]"), isInsideNavigationRoot: () => false,
      isUserInputContext: node => Boolean(node.closest("textarea,input,[contenteditable=true]"))
    });
    const read = createDOMConversationSource({ window: dom.window, platform: key, readContainers });
    const index = createConversationIndex({ platform: key });
    async function verify(session, streamed = false) {
      const e = expected(session);
      const { messages } = read();
      assert.deepEqual(messages.map(m => m.role), ["user", "assistant", "user", "assistant"]);
      assert.equal(messages[1].replyTo, messages[0].id);
      assert.equal(messages[3].replyTo, messages[2].id);
      await index.upsertMessages(messages, { replace: true });
      const { chapters, items } = index.getOutline();
      const title = name => chapters.find(node => node.title === name);
      assert.deepEqual(items.filter(item => item.type === "user").map(item => item.title), e.prompts);
      assert.equal(title(e.heading)?.parentKey, title(e.prompts[0]).markerKey);
      assert.equal(title(e.subheading)?.parentKey, title(e.heading).markerKey);
      assert.equal(title(e.code), undefined);
      assert.equal(messages[1].targets.get(title(e.heading).markerKey), document.getElementById("fixture-heading"));
      assert.equal(new Set(items.map(item => item.markerKey)).size, items.length);
      assert.equal((await index.search(e.tableCell)).total, 1);
      const copy = chapterTreeText(chapters, title(e.prompts[0]).markerKey);
      const exported = buildConversationExport({ document, conversation: index.exportConversation() });
      for (const value of [e.listItem, e.tableCell, e.code]) {
        assert.ok(copy.includes(value), value);
        assert.ok(exported.markdown.includes(value), value);
        assert.ok(exported.html.includes(value), value);
      }
      assert.ok(!copy.includes(e.prompts[1]));
      assert.equal(items.filter(item => item.title === e.streamedHeading).length, Number(streamed));
      if (streamed) assert.equal(title(e.streamedHeading).parentKey, title(e.prompts[1]).markerKey);
      if (session === "B") {
        assert.equal((await index.search("Pomelostar")).total, 0);
        assert.ok(!exported.markdown.includes(expected("A").prompts[0]));
        assert.ok(!copy.includes(expected("A").code));
      }
    }
    await verify("A");
    document.getElementById("fixture-stream").click();
    await verify("A");
    await new Promise(resolve => dom.window.setTimeout(resolve, 70));
    await verify("A", true);
    document.getElementById("fixture-switch").click();
    assert.equal(dom.window.location.href, fixtureURL(key, "B"));
    await verify("B");
  });
}
