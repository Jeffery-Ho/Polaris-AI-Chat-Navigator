import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contentSource = await readFile(new URL("../src/content.js", import.meta.url), "utf8");
const settingsPanelSource = await readFile(new URL("../src/settings-panel.js", import.meta.url), "utf8");
const settingsStyles = await readFile(new URL("../src/settings-panel.css", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const i18nSource = await readFile(new URL("../src/i18n.js", import.meta.url), "utf8");
const keyboardSource = await readFile(new URL("../src/control-tab-keyboard.js", import.meta.url), "utf8");

test("垂直布局入口、级联 Maker 菜单和设置选项已移除", () => {
  assert.doesNotMatch(contentSource, /navigationLayout|VERTICAL_LAYOUT_ENABLED|is-layout-vertical|vertical(?:User|Ai|Pinned|Preview|Selected)/);
  assert.doesNotMatch(settingsPanelSource, /NavigationLayout|navigationLayout|polaris-settings-layout/);
  assert.doesNotMatch(settingsStyles, /polaris-settings-layout/);
  assert.doesNotMatch(styles, /is-layout-vertical|vertical-submenu|vertical-user-list|vertical-ai-width|control-tab-icon--vertical/);
  assert.doesNotMatch(i18nSource, /settings\.layout(?:Horizontal|Vertical)?|userMarker\.vertical|userMarker\.unassignedGroup|userMarker\.noAiMarkers/);
  assert.doesNotMatch(keyboardSource, /orientation|ArrowDown|ArrowUp/);
});

test("移除旧布局配置后保留横向导航和 Maker 列表", () => {
  assert.match(contentSource, /capsule\.setAttribute\("aria-orientation", "horizontal"\)/);
  assert.match(contentSource, /markerRenderItems\(visibleGroups, earlierUserGroupCount\)/);
  assert.match(contentSource, /function getMakerPane\(root = getRoot\(\)\)/);
  assert.match(contentSource, /function getMarkerSearchInput\(root = getRoot\(\)\)/);
  assert.match(styles, /\.gpt-paragraph-nav__control-capsule/);
  assert.match(styles, /\.gpt-paragraph-nav__maker-pane/);
});

test("支持平台文案保留小红书", () => {
  assert.match(i18nSource, /Xiaohongshu|小红书/);
});
