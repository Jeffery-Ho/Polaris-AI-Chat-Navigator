import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contentSource = await readFile(new URL("../src/content.js", import.meta.url), "utf8");

function functionSource(name, nextName) {
  const start = contentSource.indexOf(`function ${name}(`);
  const end = contentSource.indexOf(`function ${nextName}(`, start);
  assert.ok(start >= 0, `missing function ${name}`);
  assert.ok(end > start, `missing function boundary ${nextName}`);
  return contentSource.slice(start, end);
}

test("Gemini 用户 Marker 从查询正文提取文本，不包含角色前缀", () => {
  const textSource = functionSource("userMessageText", "makeUserMarkerItem");
  const markerSource = functionSource("makeUserMarkerItem", "assistantContainerForHeading");

  assert.match(contentSource, /const GEMINI_USER_MESSAGE_SELECTOR = "user-query";/);
  assert.match(contentSource, /const GEMINI_USER_TEXT_SELECTOR = "\.query-text-line, \.query-text, \.query-content";/);
  assert.match(contentSource, /GEMINI_USER_ROLE_PREFIX_PATTERN = \/\^\\s\*\(\?:You said\|你说\|你話\|你话\)/);
  assert.match(textSource, /isGeminiPage\(\).*?GEMINI_USER_TEXT_SELECTOR/s);
  assert.match(textSource, /GEMINI_USER_TEXT_SELECTOR\.split\(", "\)/);
  assert.match(textSource, /querySelectorAll\(selector\)/);
  assert.match(textSource, /textElements\.length === 0/);
  assert.match(textSource, /textElement\.innerText \|\| textElement\.textContent/);
  assert.match(textSource, /if \(text\.trim\(\)\)/);
  assert.match(textSource, /text\.replace\(GEMINI_USER_ROLE_PREFIX_PATTERN, ""\)/);
  assert.match(markerSource, /const text = userMessageText\(element\);/);
  assert.doesNotMatch(markerSource, /element\.innerText \|\| element\.textContent/);
});
