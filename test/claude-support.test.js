import test from "node:test";
import assert from "node:assert/strict";
import { SUPPORTED_MATCHES } from "../src/supported-sites.js";
import { readFile } from "node:fs/promises";

const contentSource = await readFile(new URL("../src/content.js", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../manifest.build.json", import.meta.url), "utf8"));

function functionSource(name, nextName) {
  const start = contentSource.indexOf(`function ${name}(`);
  const end = contentSource.indexOf(`function ${nextName}(`, start);
  return contentSource.slice(start, end);
}

test("Claude.ai 使用语义消息选择器和独立平台配置", () => {
  const platform = functionSource("currentPlatformKey", "getAssistantContainerSelectors");
  const assistantSelectors = functionSource("getAssistantContainerSelectors", "getAssistantContainers");
  const userSelectors = functionSource("getUserContainerSelectors", "doubaoMessageRoleForContainer");

  assert.match(contentSource, /function isClaudePage\(\) \{\s*return window\.location\.hostname === "claude\.ai";/);
  assert.match(contentSource, /\["chatgpt", "claude", "gemini", "grok", "doubao"/);
  assert.match(contentSource, /claude: \[1, 2, 3\]/);
  assert.match(contentSource, /claude: true/);
  assert.match(platform, /isClaudePage\(\).*?return "claude"/s);
  assert.match(contentSource, /const CLAUDE_ASSISTANT_MESSAGE_SELECTOR = 'div\[data-cds="Prose"\]\.prose';/);
  assert.match(contentSource, /const CLAUDE_USER_MESSAGE_SELECTOR = '\[data-cds="UserMessage"\] \[data-testid="user-message"\]';/);
  assert.match(assistantSelectors, /isClaudePage\(\).*?CLAUDE_ASSISTANT_MESSAGE_SELECTOR/s);
  assert.match(userSelectors, /isClaudePage\(\).*?CLAUDE_USER_MESSAGE_SELECTOR/s);
});

test("manifest.build.json 会向 Claude.ai 注入内容脚本与路由桥", () => {
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.match(manifest.version_name, new RegExp(`^${manifest.version.replaceAll(".", "\\.")}\\(\\d+\\)$`));
  assert.ok(SUPPORTED_MATCHES.includes("https://claude.ai/*"));
});
