import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readJson = (path) => readFile(new URL(path, import.meta.url), "utf8").then(JSON.parse);
const [manifest, en, zh, builtManifest] = await Promise.all([
  readJson("../manifest.build.json"),
  readJson("../public/_locales/en/messages.json"),
  readJson("../public/_locales/zh_CN/messages.json"),
  readJson("../dist/manifest.json")
]);

const referencedKeys = [manifest.name, manifest.description, manifest.action.default_title]
  .map((value) => value.match(/^__MSG_(\w+)__$/)?.[1]);

test("manifest 通过 _locales 声明英文默认语言和简体中文，商店可识别两种语言", () => {
  assert.equal(manifest.default_locale, "en");
  assert.deepEqual(referencedKeys, ["extName", "extDescription", "actionTitle"]);
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  for (const key of referencedKeys) {
    assert.ok(en[key]?.message, `en 缺少 ${key}`);
    assert.ok(zh[key]?.message, `zh_CN 缺少 ${key}`);
  }
  assert.equal(en.extName.message, "Polaris: AI Chat Navigator");
  assert.equal(zh.extName.message, "Polaris: AI Chat Navigator");
  assert.equal(zh.actionTitle.message, "打开 Polaris");
  assert.ok(en.extName.message.length <= 75 && zh.extName.message.length <= 75);
  assert.ok(en.extDescription.message.length <= 132 && zh.extDescription.message.length <= 132);
});

test("打包后的 manifest 保留默认语言和本地化占位符", () => {
  assert.equal(builtManifest.default_locale, "en");
  assert.equal(builtManifest.name, "__MSG_extName__");
  assert.equal(builtManifest.description, "__MSG_extDescription__");
});

test("导出文件的应用名从 _locales 读取，不使用未替换的 manifest 占位符", async () => {
  const windowSource = await readFile(new URL("../src/window.js", import.meta.url), "utf8");
  assert.match(windowSource, /appName: chrome\.i18n\.getMessage\("extName"\)/);
  assert.doesNotMatch(windowSource, /getManifest\(\)\.name/);
});
