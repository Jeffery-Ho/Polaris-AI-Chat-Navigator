import test from "node:test";
import assert from "node:assert/strict";

import { isFeatureVersion, releaseNotesForUpdate } from "../src/release-notes.js";

test("当前或未来版本缺失内置说明时提供中英文通用修复文案", () => {
  for (const version of ["0.95.0", "0.96.0", "0.96.1", "99.0.0"]) {
    const [note] = releaseNotesForUpdate(null, version, 1);
    assert.equal(note.version, version.split(".").slice(0, 2).join("."));
    assert.equal(note.isFallback, true);
    assert.deepEqual(note.zh, { title: "优化与修复", changes: ["修复错误，提升体验。"] });
    assert.deepEqual(note.en, { title: "Improvements and fixes", changes: ["Bug fixes and improvements."] });
  }
});

test("缺失说明的版本不会冒用旧版本的功能描述", () => {
  const notes = releaseNotesForUpdate("0.93.0", "0.96.0");
  assert.deepEqual(notes.map((note) => note.version), ["0.96", "0.94"]);
  assert.deepEqual(notes[0].zh.changes, ["修复错误，提升体验。"]);
  assert.match(notes[1].zh.title, /侧栏/);
  assert.equal(notes[1].isFallback, undefined);
});

test("DeepSeek 功能版本提供最终回答导航更新说明", () => {
  const note = releaseNotesForUpdate("0.64.0", "0.65.0")[0];
  assert.equal(note.version, "0.65");
  assert.match(note.en.title, /DeepSeek/);
  assert.match(note.zh.changes[0], /最终回答/);
});

test("Manus 功能版本提供内置更新说明", () => {
  const note = releaseNotesForUpdate("0.63.0", "0.64.0")[0];
  assert.equal(note.version, "0.64");
  assert.equal(note.isFallback, undefined);
  assert.match(note.zh.changes[0], /Manus/);
});

test("只接受精确的 x.y.0 功能版本", () => {
  assert.equal(isFeatureVersion("0.29.0"), true);
  assert.equal(isFeatureVersion("0.29.0.1"), false);
  assert.equal(isFeatureVersion("0.xx.0"), false);
});

test("首次安装只展示当前功能版本的更新说明", () => {
  assert.deepEqual(
    releaseNotesForUpdate(null, "0.29.3").map((note) => note.version),
    ["0.29"]
  );
});

test("补丁版本更新不会单独展示更新说明", () => {
  assert.deepEqual(releaseNotesForUpdate("0.29.2", "0.29.3"), []);
});

test("跨功能版本升级只展示新的 0.xx 说明", () => {
  assert.deepEqual(
    releaseNotesForUpdate("0.28.6", "0.29.3").map((note) => note.version),
    ["0.29"]
  );
});

test("跨多个功能版本升级仅展示当前已内置的说明", () => {
  assert.deepEqual(
    releaseNotesForUpdate("0.26.13", "0.29.3").map((note) => note.version),
    ["0.29"]
  );
});

test("内置功能版本按倒序展示", () => {
  assert.deepEqual(
    releaseNotesForUpdate("0.28.9", "0.30.0").map((note) => note.version),
    ["0.30", "0.29"]
  );
});

test("章节 Markdown 功能版本提供内置更新说明", () => {
  const note = releaseNotesForUpdate("0.30.1", "0.31.0")[0];
  assert.equal(note.version, "0.31");
  assert.equal(note.isFallback, undefined);
  assert.match(note.zh.changes[0], /任务列表/);
});

test("章节空内容跳转功能提供内置更新说明", () => {
  const note = releaseNotesForUpdate("0.31.0", "0.32.0")[0];
  assert.equal(note.version, "0.32");
  assert.equal(note.isFallback, undefined);
  assert.match(note.zh.changes[0], /跳转/);
});

test("原始 Markdown 表格功能提供内置更新说明", () => {
  const note = releaseNotesForUpdate("0.32.0", "0.33.0")[0];
  assert.equal(note.version, "0.33");
  assert.equal(note.isFallback, undefined);
  assert.match(note.zh.changes[0], /表格/);
});

test("混排 Markdown 与特殊字符功能提供内置更新说明", () => {
  const note = releaseNotesForUpdate("0.33.1", "0.34.0")[0];
  assert.equal(note.version, "0.34");
  assert.equal(note.isFallback, undefined);
  assert.match(note.zh.changes[0], /特殊字符/);
});

test("全平台表格 Maker 功能提供内置更新说明", () => {
  const note = releaseNotesForUpdate("0.34.0", "0.35.0")[0];
  assert.equal(note.version, "0.35");
  assert.equal(note.isFallback, undefined);
  assert.match(note.zh.changes[0], /表格/);
});

test("Maker 流式渐进渲染功能提供内置更新说明", () => {
  const note = releaseNotesForUpdate("0.35.8", "0.36.0")[0];
  assert.equal(note.version, "0.36");
  assert.equal(note.isFallback, undefined);
  assert.match(note.zh.changes[0], /流式输出/);
});

test("Maker 列表流式稳定化功能提供内置更新说明", () => {
  const note = releaseNotesForUpdate("0.36.6", "0.37.0")[0];
  assert.equal(note.version, "0.37");
  assert.equal(note.isFallback, undefined);
  assert.match(note.zh.changes[0], /滚动/);
  assert.match(note.zh.changes[0], /折叠/);
});

test("赞赏页功能提供内置更新说明", () => {
  const note = releaseNotesForUpdate("0.37.6", "0.38.0")[0];
  assert.equal(note.version, "0.38");
  assert.match(note.zh.changes[0], /赞赏页/);
});

test("设置面板 Header 赞赏入口提供内置更新说明", () => {
  const note = releaseNotesForUpdate("0.38.8", "0.39.0")[0];
  assert.equal(note.version, "0.39");
  assert.match(note.zh.changes[0], /心形入口/);
  assert.match(note.zh.changes[0], /设置面板 Header/);
});

test("可选赞赏页分析提供内置更新说明", () => {
  const note = releaseNotesForUpdate("0.39.1", "0.40.0")[0];
  assert.equal(note.version, "0.40");
  assert.match(note.zh.changes[0], /同意分析/);
  assert.match(note.en.changes[0], /allow analytics/);
});

test("Maker 分组默认展开提供内置更新说明", () => {
  const note = releaseNotesForUpdate("0.43.3", "0.44.0")[0];
  assert.equal(note.version, "0.44");
  assert.equal(note.isFallback, undefined);
  assert.match(note.zh.changes[0], /默认展开/);
  assert.match(note.en.changes[0], /expanded by default/);
});

test("Claude.ai 支持提供内置更新说明", () => {
  const note = releaseNotesForUpdate("0.44.4", "0.45.0")[0];
  assert.equal(note.version, "0.45");
  assert.equal(note.isFallback, undefined);
  assert.match(note.zh.changes[0], /Claude\.ai/);
  assert.match(note.en.changes[0], /Claude\.ai/);
});

test("Google Gemini 支持提供内置更新说明", () => {
  const note = releaseNotesForUpdate("0.49.2", "0.50.0")[0];
  assert.equal(note.version, "0.50");
  assert.equal(note.isFallback, undefined);
  assert.match(note.zh.changes[0], /Google Gemini/);
  assert.match(note.en.changes[0], /Google Gemini/);
});

test("Grok 支持提供内置更新说明", () => {
  const note = releaseNotesForUpdate("0.50.0", "0.51.0")[0];
  assert.equal(note.version, "0.51");
  assert.equal(note.isFallback, undefined);
  assert.match(note.zh.changes[0], /Grok/);
  assert.match(note.en.changes[0], /Grok/);
});

test("加粗文本筛选提供内置更新说明", () => {
  const note = releaseNotesForUpdate("0.45.0", "0.46.0")[0];
  assert.equal(note.version, "0.46");
  assert.equal(note.isFallback, undefined);
  assert.match(note.zh.changes[0], /加粗文本/);
  assert.match(note.en.changes[0], /Bold text/);
});

test("有序列表筛选提供内置更新说明", () => {
  const note = releaseNotesForUpdate("0.46.0", "0.47.0")[0];
  assert.equal(note.version, "0.47");
  assert.equal(note.isFallback, undefined);
  assert.match(note.zh.changes[0], /有序列表/);
  assert.match(note.en.changes[0], /Ordered lists/);
});

test("更新说明赞赏入口提供内置更新说明", () => {
  const note = releaseNotesForUpdate("0.47.1", "0.48.0")[0];
  assert.equal(note.version, "0.48");
  assert.equal(note.isFallback, undefined);
  assert.match(note.zh.changes[0], /赞赏按钮/);
  assert.match(note.en.changes[0], /support button/);
});

test("章节目录与来源正文对应功能提供内置更新说明", () => {
  const note = releaseNotesForUpdate("0.60.0", "0.61.2")[0];
  assert.equal(note.version, "0.61");
  assert.equal(note.isFallback, undefined);
  assert.match(note.zh.changes[0], /来源节点/);
  assert.match(note.en.changes[0], /source nodes/);
});

test("章节目录与阅读卡片功能提供内置更新说明", () => {
  const note = releaseNotesForUpdate("0.59.7", "0.60.0")[0];
  assert.equal(note.version, "0.60");
  assert.match(note.zh.changes[0], /完整目录/);
  assert.match(note.zh.changes[0], /Markdown/);
});
