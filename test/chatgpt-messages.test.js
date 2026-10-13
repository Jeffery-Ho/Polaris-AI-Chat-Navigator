import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

import {
  collectChatGptConversation,
  CHATGPT_USER_SELECTOR,
  isChatGptUserTurnNode,
  stripChatGptUserRolePrefix
} from "../src/chatgpt-messages.js";

const contentSource = readFileSync(new URL("../src/content.js", import.meta.url), "utf8");

test("ChatGPT recognizes current user bubbles without legacy roles or conversation-turn attributes", () => {
  const doc = new JSDOM('<main><div data-content-search-turn-key="fallback-turn-0"><div class="block-BQZwFn"><h4 class="sr-only m-0 select-none">You said:</h4><div class="group/user-message flex flex-col items-end gap-2">可以在模拟器里面安装系统相册么</div></div><div class="block-BQZwFn"><h4 class="sr-only">ChatGPT said:</h4><div class="MarkdownRoot-rZKhxa"><p>可以，但要区分两件事：</p></div></div></div></main>').window.document;
  const users = [...doc.querySelectorAll(CHATGPT_USER_SELECTOR)].filter(isChatGptUserTurnNode);
  assert.equal(users.length, 1);
  assert.equal(users[0].textContent, "可以在模拟器里面安装系统相册么");
  const conversation = collectChatGptConversation(doc.querySelector("main"));
  assert.deepEqual(conversation.userMessages.map((message) => message.text), ["可以在模拟器里面安装系统相册么"]);
  assert.equal(conversation.assistantMessages.length, 1);
});

function el(tag, className, children = [], text = "", attrs = {}) {
  return { tag, className, children, text, attrs };
}

test("ChatGPT adapter reads legacy role messages and the headings inside them", () => {
  const fixture = el("main", "", [
    el("div", "", [
      el("div", "", [], "Explain how plants grow.", { "data-message-author-role": "user" })
    ], "", { "data-message-author-role": "user" }),
    el("div", "", [
      el("div", "markdown", [
        el("h1", "", [], "Overview"),
        el("p", "", [], "Plants grow by turning light into stored energy."),
        el("h2", "", [], "Light"),
        el("h2", "", [], "Water")
      ])
    ], "", { "data-message-author-role": "assistant" })
  ]);

  const result = collectChatGptConversation(fixture);

  assert.deepEqual(result.userMessages.map((message) => message.text), ["Explain how plants grow."]);
  assert.deepEqual(result.assistantMessages.map((message) => message.kind), ["legacy"]);
  assert.deepEqual(result.sections.map((section) => [section.level, section.title]), [
    [1, "Overview"],
    [2, "Light"],
    [2, "Water"]
  ]);
});

test("ChatGPT adapter reads hashed CSS-module response bodies as message nodes", () => {
  const fixture = el("main", "", [
    el("div", "MarkdownRoot-rZKhxa", [
      el("h2", "Heading-Ro3lZr", [], "Light"),
      el("p", "Paragraph-kKnbIo", [], "Leaves capture sunlight.", { "data-markdown-han-text": "true" }),
      el("blockquote", "Blockquote-EqEEot", [
        el("p", "Paragraph-kKnbIo", [], "Quoted note")
      ]),
      el("hr", "HorizontalRule-ByOEk_"),
      el("div", "VisualizationBlock-BXpp50", [], "Chart"),
      el("h6", "Heading-ZzZzZz", [], "Deep"),
      el("div", "Heading-Custom1", [], "Diagram title")
    ]),
    el("div", "prose", [
      el("h2", "", [], "Older prose heading")
    ])
  ]);

  const result = collectChatGptConversation(fixture);
  const messageClasses = result.assistantMessages.map((message) => message.node.className);

  assert.deepEqual(result.userMessages, []);
  assert.deepEqual(messageClasses, ["MarkdownRoot-rZKhxa", "prose"]);
  assert.deepEqual(result.assistantMessages.map((message) => message.kind), ["hashed", "prose"]);
  assert.ok(!messageClasses.some((className) => /Paragraph|Blockquote|HorizontalRule|VisualizationBlock/.test(className)));
  assert.deepEqual(result.sections.map((section) => [section.messageKind, section.level, section.title]), [
    ["hashed", 2, "Light"],
    ["hashed", 6, "Deep"],
    ["hashed", 2, "Diagram title"],
    ["prose", 2, "Older prose heading"]
  ]);
});

test("ChatGPT keeps legacy and hashed turns in one conversation without duplicating inner bodies", () => {
  const fixture = el("main", "", [
    el("article", "", [], "How do plants grow?", { "data-message-role": "user" }),
    el("article", "", [
      el("div", "markdown prose", [
        el("h2", "", [], "Overview")
      ])
    ], "", { "data-message-role": "assistant" }),
    el("div", "", [], "What about water?", { "data-message-author-role": "user" }),
    el("div", "MarkdownRoot-rZKhxa", [
      el("h2", "Heading-Ro3lZr", [], "Water"),
      el("div", "markdown", [
        el("h3", "Heading-Inner1", [], "Roots")
      ])
    ])
  ]);

  const result = collectChatGptConversation(fixture);

  assert.deepEqual(result.userMessages.map((message) => message.text), [
    "How do plants grow?",
    "What about water?"
  ]);
  assert.deepEqual(result.assistantMessages.map((message) => message.kind), ["legacy", "hashed"]);
  assert.equal(result.assistantMessages[1].node.className, "MarkdownRoot-rZKhxa");
  assert.deepEqual(result.sections.map((section) => section.title), ["Overview", "Water", "Roots"]);
  assert.match(contentSource, /if \(isChatGPTPage\(\)\)/);
  assert.match(contentSource, /mergeChatGptAssistantNodes/);
  assert.match(contentSource, /CHATGPT_LEGACY_ASSISTANT_SELECTOR/);
  assert.match(contentSource, /CHATGPT_USER_SELECTOR/);
  assert.match(contentSource, /getChatGptUserContainers/);
  assert.match(contentSource, /stripChatGptUserRolePrefix/);
  assert.match(contentSource, /CHATGPT_PROSE_SELECTOR/);
});

test("ChatGPT adapter recognizes the current conversation-turn user wrapper", () => {
  const fixture = el("main", "", [
    el("article", "", [
      el("h5", "sr-only", [], "You said:"),
      el("div", "", [], "Find the best extension architecture.")
    ], "", { "data-testid": "conversation-turn-0", "data-turn": "user" }),
    el("div", "", [
      el("h5", "sr-only", [], "ChatGPT said:"),
      el("h2", "", [], "You said:"),
      el("div", "", [], "The response.")
    ], "", { "data-testid": "conversation-turn-1", "data-turn": "assistant" }),
    el("div", "", [
      el("div", "markdown", [
        el("h2", "", [], "Architecture")
      ])
    ], "", { "data-message-author-role": "assistant" })
  ]);

  const result = collectChatGptConversation(fixture);

  assert.deepEqual(result.userMessages.map((message) => message.text), [
    "You said: Find the best extension architecture."
  ]);
  assert.equal(
    stripChatGptUserRolePrefix("You said:\nFind the best extension architecture."),
    "Find the best extension architecture."
  );
});

test("ChatGPT adapter recognizes a shared user turn from data-turn", () => {
  const fixture = el("main", "", [
    el("article", "", [
      el("div", "", [], "Find the shared conversation prompt.")
    ], "", { "data-testid": "conversation-turn-1", "data-turn": "user" }),
    el("article", "", [
      el("h6", "sr-only", [], "ChatGPT said:"),
      el("div", "markdown", [
        el("h2", "", [], "The response")
      ])
    ], "", { "data-testid": "conversation-turn-2", "data-turn": "assistant" })
  ]);

  const result = collectChatGptConversation(fixture);

  assert.deepEqual(result.userMessages.map((message) => message.text), [
    "Find the shared conversation prompt."
  ]);
});
