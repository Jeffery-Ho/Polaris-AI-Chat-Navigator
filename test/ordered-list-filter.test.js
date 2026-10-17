import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contentSource = await readFile(new URL("../src/content.js", import.meta.url), "utf8");
const settingsPanelSource = await readFile(new URL("../src/settings-panel.js", import.meta.url), "utf8");
const sourceManifest = JSON.parse(await readFile(new URL("../manifest.build.json", import.meta.url), "utf8"));

function functionSource(name, nextName) {
  const start = contentSource.indexOf(`  function ${name}(`);
  const end = contentSource.indexOf(`  function ${nextName}(`, start);
  return contentSource.slice(start, end);
}

test("有序列表 Marker 按平台默认关闭且可独立保存", () => {
  const normalizeConfig = functionSource("normalizeConfig", "enabledLevelsByPlatformEqual");
  const model = functionSource("createSettingsPanelModel", "updateEnabledLevelForCurrentPlatform");

  assert.match(contentSource, /const DEFAULT_ENABLED_ORDERED_LIST_BY_PLATFORM = Object\.freeze\([\s\S]*?default: false/);
  assert.match(contentSource, /function normalizeEnabledOrderedListByPlatform\(config\)/);
  assert.match(normalizeConfig, /result\.enabledOrderedListByPlatform = normalizeEnabledOrderedListByPlatform\(config\);/);
  assert.match(model, /orderedList: \{[\s\S]*?isSelected: enabledOrderedListForPlatform\(platformKey\)/);
  assert.match(model, /onOrderedListChange\(isEnabled\) \{[\s\S]*?updateEnabledOrderedListForCurrentPlatform\(isEnabled\)/);
  assert.match(settingsPanelSource, /label: model\.orderedList\.label/);
  assert.match(settingsPanelSource, /onChange: model\.onOrderedListChange/);
});

test("有序列表与编号标题使用不同筛选规则", () => {
  const collect = functionSource("collectHeadings", "debugCollection");
  const enabled = functionSource("isHeadingEnabledForCurrentConfig", "filteredHeadings");

  assert.match(collect, /heading\.matches\("ol > li"\)/);
  assert.match(collect, /sourceType: marker\.sourceType/);
  assert.match(collect, /if \(item\.sourceType === "ordered-list"\) \{\s*return orderedListEnabled;/);
  assert.match(enabled, /if \(heading\.sourceType === "ordered-list"\) \{\s*return enabledOrderedListForPlatform\(platformKey\);/);
});

test("源清单同步版本与构建号", () => {
  assert.match(sourceManifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(sourceManifest.version_name, `${sourceManifest.version}(${Number(sourceManifest.version_name.match(/\((\d+)\)$/)?.[1])})`);
});
