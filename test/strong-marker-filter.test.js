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

test("加粗文本 Marker 按平台默认开启且可独立保存", () => {
  const normalizeConfig = functionSource("normalizeConfig", "enabledLevelsByPlatformEqual");
  const model = functionSource("createSettingsPanelModel", "updateEnabledLevelForCurrentPlatform");

  assert.match(contentSource, /const DEFAULT_ENABLED_STRONG_BY_PLATFORM = Object\.freeze\([\s\S]*?default: true/);
  assert.match(contentSource, /function normalizeEnabledStrongByPlatform\(config\)/);
  assert.match(normalizeConfig, /result\.enabledStrongByPlatform = normalizeEnabledStrongByPlatform\(config\);/);
  assert.match(model, /strong: \{[\s\S]*?isSelected: enabledStrongForPlatform\(platformKey\)/);
  assert.match(model, /onStrongChange\(isEnabled\) \{[\s\S]*?updateEnabledStrongForCurrentPlatform\(isEnabled\)/);
  assert.match(settingsPanelSource, /label: model\.strong\.label/);
  assert.match(settingsPanelSource, /onChange: model\.onStrongChange/);
});

test("加粗文本与无序列表 Marker 分别受各自筛选控制", () => {
  const collect = functionSource("collectHeadings", "debugCollection");
  const enabled = functionSource("isHeadingEnabledForCurrentConfig", "filteredHeadings");

  assert.match(collect, /makeHeadingItem\(heading, headings\.length, markdownLevel \|\| 2, "strong"\)/);
  assert.match(contentSource, /function unorderedListHeading\(element, container\)[\s\S]*?return \{ sourceType: "strong", title: strongTitle \}/);
  assert.match(contentSource, /return title \? \{ sourceType: "unordered-list", title \} : null;/);
  assert.match(collect, /sourceType: marker\.sourceType/);
  assert.match(collect, /const strongEnabled = enabledStrongForPlatform\(platformKey\);/);
  assert.match(collect, /if \(item\.sourceType === "strong"\) \{\s*return strongEnabled;/);
  assert.match(enabled, /if \(heading\.sourceType === "strong"\) \{\s*return enabledStrongForPlatform\(platformKey\);/);
});
