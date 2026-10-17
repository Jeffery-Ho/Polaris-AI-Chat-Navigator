import test from "node:test";
import assert from "node:assert/strict";
import { SUPPORTED_MATCHES } from "../src/supported-sites.js";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const content = readFileSync(new URL("../src/content.js", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../manifest.build.json", import.meta.url), "utf8"));

test("DeepSeek is available to extension injection, the source window and localized platform information", () => {
  const origin = "https://chat.deepseek.com/*";
  assert.ok(SUPPORTED_MATCHES.includes(origin));
  assert.ok(manifest.web_accessible_resources[0].resources.includes("icons/platform-deepseek.ico"));
  assert.ok(readFileSync(new URL("../public/icons/platform-deepseek.ico", import.meta.url)).length > 0);
  const background = readFileSync(new URL("../src/background.js", import.meta.url), "utf8");
  const windowSource = readFileSync(new URL("../src/window.js", import.meta.url), "utf8");
  const translations = readFileSync(new URL("../src/i18n.js", import.meta.url), "utf8");
  assert.match(background, /"chat\.deepseek\.com"/);
  assert.match(windowSource, /key: "deepseek", label: "DeepSeek", favicon: "icons\/platform-deepseek\.ico"/);
  assert.equal(translations.split('\n').filter((line) => line.includes('"settings.supportedPlatforms"') && line.includes("DeepSeek")).length, 2);
});

test("DeepSeek settings add defaults to existing preferences and retain platform-specific changes", () => {
  const defaultsStart = content.indexOf("  const PLATFORM_KEYS =");
  const defaultsEnd = content.indexOf("  const DEFAULT_CONFIG =", defaultsStart);
  const functionsStart = content.indexOf("  function maxHeadingLevelForPlatform(");
  const functionsEnd = content.indexOf("  function normalizeConfig(", functionsStart);
  const normalizers = runInNewContext(`${content.slice(defaultsStart, defaultsEnd)}\n${content.slice(functionsStart, functionsEnd)}\n({
    levels: normalizeEnabledLevelsByPlatform,
    bold: normalizeEnabledStrongByPlatform,
    unordered: normalizeUnorderedListByPlatform,
    ordered: normalizeEnabledOrderedListByPlatform
  });`);
  const existing = {
    enabledLevelsByPlatform: { chatgpt: [2] },
    enabledStrongByPlatform: { chatgpt: false },
    enabledUnorderedListByPlatform: { chatgpt: false },
    enabledOrderedListByPlatform: { chatgpt: true }
  };
  assert.deepEqual(Array.from(normalizers.levels(existing).deepseek), [1, 2, 3]);
  assert.deepEqual(Array.from(normalizers.levels(existing).chatgpt), [2]);
  assert.equal(normalizers.bold(existing).deepseek, true);
  assert.equal(normalizers.unordered(existing).deepseek, true);
  assert.equal(normalizers.ordered(existing).deepseek, false);
  existing.enabledLevelsByPlatform.deepseek = [2, 3];
  existing.enabledStrongByPlatform.deepseek = false;
  existing.enabledUnorderedListByPlatform.deepseek = false;
  existing.enabledOrderedListByPlatform.deepseek = true;
  assert.deepEqual(Array.from(normalizers.levels(existing).deepseek), [2, 3]);
  assert.equal(normalizers.bold(existing).deepseek, false);
  assert.equal(normalizers.unordered(existing).deepseek, false);
  assert.equal(normalizers.ordered(existing).deepseek, true);
  assert.equal(normalizers.bold(existing).chatgpt, false);
  assert.equal(normalizers.ordered(existing).chatgpt, true);
});

test("DeepSeek observes grouping inputs while other platforms retain their image attribute filter", () => {
  assert.match(content, /attributeFilter: isDeepSeekPage\(\)\s*\? \[\.\.\.USER_MESSAGE_IMAGE_ATTRIBUTE_FILTER, \.\.\.DEEPSEEK_OBSERVED_ATTRIBUTES\]\s*: USER_MESSAGE_IMAGE_ATTRIBUTE_FILTER/);
  assert.match(content, /isDeepSeekPage\(\) && mutations\.some\(isDeepSeekConversationMutation\)/);
  assert.match(content, /if \(!hasDeepSeekMutation && !hasRelevantMarkerMutation/);
});
