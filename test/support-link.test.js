import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contentSource = await readFile(new URL("../src/content.js", import.meta.url), "utf8");
const settingsPanelSource = await readFile(new URL("../src/settings-panel.js", import.meta.url), "utf8");
const settingsStyles = await readFile(new URL("../src/settings-panel.css", import.meta.url), "utf8");

test("设置面板 Header 提供赞赏入口", () => {
  assert.match(contentSource, /supportLabel: t\("support\.aria"\)/);
  assert.match(contentSource, /const SUPPORT_URL = "https:\/\/jeffery-ho\.github\.io\/polaris-landing\/entry\/extension\/"/);
  assert.match(contentSource, /supportUrl: SUPPORT_URL/);
  assert.doesNotMatch(contentSource, /getSupportLink\(/);
  assert.doesNotMatch(contentSource, /SUPPORT_LINK_CLASS/);
  assert.match(settingsPanelSource, /const support = createElement\("a", "polaris-settings-support-link"\)/);
  assert.match(settingsPanelSource, /support\.href = model\.supportUrl/);
  assert.match(settingsPanelSource, /support\.target = "_blank"/);
  assert.match(settingsPanelSource, /support\.rel = "noreferrer"/);
  assert.match(settingsPanelSource, /header\.append\(app, support\)/);
  assert.match(settingsPanelSource, /createSupportHeartIcon\(\)/);
  assert.match(settingsStyles, /\.polaris-settings-support-link \{[\s\S]*?width: 30px;[\s\S]*?color: var\(--polaris-accent\);/);
});

test("设置面板 Footer 在邮件左侧提供 X 主页入口", () => {
  assert.match(contentSource, /const X_PROFILE_URL = "https:\/\/x\.com\/JefferyHo_"/);
  assert.match(contentSource, /xLabel: t\("contact\.x"\)/);
  assert.match(contentSource, /xUrl: X_PROFILE_URL/);
  assert.match(contentSource, /xLabel: model\.xLabel/);
  assert.match(contentSource, /xUrl: model\.xUrl/);
  assert.match(settingsPanelSource, /const x = createElement\("a", "polaris-settings-contact-action"\)/);
  assert.match(settingsPanelSource, /x\.href = model\.xUrl/);
  assert.match(settingsPanelSource, /x\.target = "_blank"/);
  assert.match(settingsPanelSource, /x\.rel = "noreferrer"/);
  assert.match(settingsPanelSource, /actions\.append\(x, email, issue\)/);
  assert.match(settingsPanelSource, /x\.appendChild\(createXIcon\(\)\)/);
  assert.match(settingsPanelSource, /x\.setAttribute\("aria-label", model\.xLabel\)/);
});
