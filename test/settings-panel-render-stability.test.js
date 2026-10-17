import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contentSource = await readFile(new URL("../src/content.js", import.meta.url), "utf8");
const settingsPanelSource = await readFile(new URL("../src/settings-panel.js", import.meta.url), "utf8");

function functionSource(name, nextName) {
  const start = contentSource.indexOf(`  function ${name}(`);
  const end = contentSource.indexOf(`  function ${nextName}(`, start);
  return contentSource.slice(start, end);
}

test("设置模型未变化时不会因宿主 DOM 刷新重建面板", () => {
  const sync = functionSource("syncSettingsInputs", "enabledLevelsForPlatform");

  assert.match(contentSource, /const settingsPanelRenderSignatures = new WeakMap\(\);/);
  assert.match(contentSource, /function settingsPanelRenderSignature\(model\)/);
  assert.match(sync, /const model = createSettingsPanelModel\(\);/);
  assert.match(sync, /const signature = settingsPanelRenderSignature\(model\);/);
  assert.match(sync, /if \(settingsPanelRenderSignatures\.get\(settings\) === signature\) \{\n      return;\n    \}/);
  assert.match(sync, /controller\.render\(model\);/);
  assert.match(sync, /settingsPanelRenderSignatures\.set\(settings, signature\);/);
});

test("设置渲染签名覆盖滑杆、Marker 筛选、评分卡和平台显示状态", () => {
  const signature = functionSource("settingsPanelRenderSignature", "syncSettingsInputs");

  assert.match(signature, /model\.fields\.map/);
  assert.match(signature, /model\.markerLevels\.map/);
  assert.match(signature, /model\.orderedList/);
  assert.match(signature, /model\.strong/);
  assert.match(signature, /model\.unorderedList/);
  assert.match(signature, /model\.showRating/);
});

test("设置面板重建后恢复筛选区域的滚动位置", () => {
  assert.match(settingsPanelSource, /const previousBody = mountPoint\.querySelector\("\.polaris-settings-body"\);/);
  assert.match(settingsPanelSource, /const scrollTop = previousBody instanceof HTMLElement \? previousBody\.scrollTop : 0;/);
  assert.match(settingsPanelSource, /mountPoint\.replaceChildren\(createSettingsPanel\(model\)\);/);
  assert.match(settingsPanelSource, /const nextBody = mountPoint\.querySelector\("\.polaris-settings-body"\);/);
  assert.match(settingsPanelSource, /nextBody\.scrollTop = scrollTop;/);
});
