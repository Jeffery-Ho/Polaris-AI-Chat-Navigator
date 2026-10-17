import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [contentSource, backgroundSource] = await Promise.all([
  readFile(new URL("../src/content.js", import.meta.url), "utf8"),
  readFile(new URL("../src/background.js", import.meta.url), "utf8")
]);

test("内容脚本从 i18n 模块取翻译，并保留单实例返回", () => {
  const guardIndex = contentSource.indexOf("CONTENT_SCRIPT_INSTANCE_KEY");
  const listenerIndex = contentSource.indexOf("addEventListener");
  assert.match(contentSource, /if \(globalThis\[CONTENT_SCRIPT_INSTANCE_KEY\]\) \{\s*return;\s*\}/);
  assert.match(contentSource, /import \{ createI18n \} from "\.\/i18n\.js";/);
  assert.match(contentSource, /const \{ locale, t \} = createI18n\(\);/);
  assert.doesNotMatch(contentSource, /PolarisI18n/);
  assert.ok(guardIndex >= 0 && guardIndex < listenerIndex);
});

test("动态注入从 manifest 读取内容脚本路径，失败时记录日志", () => {
  assert.match(backgroundSource, /chrome\.runtime\.getManifest\?\.\(\)\?\.content_scripts/);
  assert.match(backgroundSource, /\[Polaris\] Content script injection failed\./);
  assert.match(backgroundSource, /\[Polaris\] Content stylesheet injection failed\./);
  assert.match(backgroundSource, /\[Polaris\] Content script did not respond after injection\./);
  assert.doesNotMatch(backgroundSource, /files:\s*\[\s*"src\/content\.js"\s*\]/);
});
