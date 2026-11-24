import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const contentSource = readFileSync(new URL("../src/content.js", import.meta.url), "utf8");

test("Maker 队列为 tips 阴影保留完整缓冲区", () => {
  assert.match(styles, /--gpt-marker-shadow-buffer: 32px;/);
  assert.match(
    styles,
    /max-height: calc\(var\(--queue-visible-count, 30\) \* 44px \+ var\(--gpt-marker-shadow-buffer\) \* 2\);/
  );
  assert.doesNotMatch(styles, /max\(0px, calc\(100% - 52px/);
  assert.match(
    styles,
    /\.gpt-paragraph-nav__list \{[\s\S]*?padding: var\(--gpt-marker-shadow-buffer\) var\(--gpt-marker-shadow-buffer\) var\(--gpt-marker-shadow-buffer\) 0;/
  );
});

test("Maker tips 使用贴近本体的轻量弥散阴影", () => {
  assert.match(
    styles,
    /\.gpt-paragraph-nav__label \{[\s\S]*?border: 1px solid var\(--polaris-border\);[\s\S]*?box-shadow: none;/
  );
});

test("缩小模式为用户 Maker 的标题、内边距和折叠箭头分别预留宽度", () => {
  assert.match(
    styles,
    /gpt-paragraph-nav__marker\.gpt-paragraph-nav__marker--user \{\n  max-width: min\(190px, calc\(100vw - 28px\)\);/
  );
  assert.match(
    styles,
    /gpt-paragraph-nav__marker--user \.gpt-paragraph-nav__preview \{\n  max-width: 160px;/
  );
});

test("用户 Maker 默认以单行末尾省略长标题，并保留折叠箭头", () => {
  assert.match(
    styles,
    /\.gpt-paragraph-nav__marker--user \.gpt-paragraph-nav__preview \{[\s\S]*?flex: 1 1 auto;[\s\S]*?min-width: 0;[\s\S]*?max-width: calc\(100% - 14px\);[\s\S]*?max-height: 1\.2em;[\s\S]*?font: 500 11px\/1\.2 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;[\s\S]*?white-space: nowrap !important;[\s\S]*?overflow-wrap: normal !important;[\s\S]*?word-break: normal !important;/
  );
});

test("生成中的 AI Maker 保持稳定尺寸并仅以文字呼吸和左侧 loading 提示", () => {
  assert.match(
    styles,
    /\.gpt-paragraph-nav__marker--ai \{[\s\S]*?width: min\(var\(--gpt-nav-controls-width, 360px\), calc\(100vw - 48px\)\);[\s\S]*?min-width: 0;/
  );
  assert.match(
    styles,
    /\.gpt-paragraph-nav__marker--ai \.gpt-paragraph-nav__preview \{[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/
  );
  assert.match(styles, /\.gpt-paragraph-nav__marker--ai\.is-streaming \.gpt-paragraph-nav__preview \{\n  animation: polaris-marker-text-breathe/);
  assert.match(styles, /\.gpt-paragraph-nav__marker--ai\.is-streaming \.gpt-paragraph-nav__streaming-loader \{[\s\S]*?animation: polaris-marker-loader-spin/);
  assert.match(contentSource, /streamingLoader\.src = chrome\.runtime\.getURL\("icons\/loader-2\.svg"\)/);
  assert.match(contentSource, /markerStreamingIndicator\.pulse\(streamingMarker\)/);
});

test("用户 Maker 图片缩略图固定尺寸，纯图片消息不显示空标题", () => {
  assert.match(
    styles,
    /\.gpt-paragraph-nav__user-thumbnail \{[\s\S]*?flex: 0 0 24px;[\s\S]*?min-width: 24px !important;[\s\S]*?max-width: 24px !important;[\s\S]*?width: 24px !important;[\s\S]*?height: 24px !important;[\s\S]*?object-fit: cover !important;/
  );
  assert.match(styles, /\.gpt-paragraph-nav__marker--user\.is-image-only \.gpt-paragraph-nav__preview \{\n  display: none !important;/);
});

test("用户 Maker 提示条显示与消息缩略图同尺寸的大图", () => {
  assert.match(contentSource, /gpt-paragraph-nav__label-thumbnail/);
  assert.match(contentSource, /labelThumbnail\.src = item\.thumbnailSrc/);
  assert.match(styles, /\.gpt-paragraph-nav__label-thumbnail \{[\s\S]*?width: 112px !important;[\s\S]*?height: 112px !important;/);
  assert.match(styles, /\.gpt-paragraph-nav__label--user \{[\s\S]*?flex-direction: column;/);
});

test("用户 Maker 图片提示条定位在 Maker 左侧并垂直居中", () => {
  assert.match(styles, /\.gpt-paragraph-nav__label--user \{[\s\S]*?top: 50%;[\s\S]*?right: calc\(100% \+ 8px\);[\s\S]*?bottom: auto;[\s\S]*?left: auto;[\s\S]*?transform: translate\(6px, -50%\);/);
  assert.match(styles, /\.gpt-paragraph-nav__marker-shell:hover \.gpt-paragraph-nav__label--user \{[\s\S]*?transform: translate\(0, -50%\);/);
});

test("用户 Maker 图片提示条与 Maker 水平对齐，纯图片不显示图片说明文字", () => {
  assert.match(
    styles,
    /\.gpt-paragraph-nav__label--user \{[\s\S]*?top: 50%;[\s\S]*?right: calc\(100% \+ 8px\);[\s\S]*?bottom: auto;[\s\S]*?left: auto;[\s\S]*?transform: translate\(6px, -50%\);/
  );
  assert.match(
    styles,
    /\.gpt-paragraph-nav__marker-shell:hover \.gpt-paragraph-nav__label--user \{[\s\S]*?transform: translate\(0, -50%\);/
  );
  assert.match(contentSource, /label\.classList\.toggle\("is-image-only", item\.isImageOnly\)/);
  assert.match(
    styles,
    /\.gpt-paragraph-nav__label--user\.is-image-only \.gpt-paragraph-nav__label-text \{\n  display: none !important;/
  );
});

test("Maker 提示条和浮动提示条使用统一显示层级", () => {
  assert.match(styles, /--gpt-nav-tooltip-z-index: 3;/);
  assert.match(
    styles,
    /\.gpt-paragraph-nav__label \{[\s\S]*?z-index: var\(--gpt-nav-tooltip-z-index\);/
  );
  assert.match(
    styles,
    /\.gpt-paragraph-nav__floating-active \{[\s\S]*?z-index: var\(--gpt-nav-tooltip-z-index\);/
  );
});

test("当前 Maker 提示条所在行在 Maker 列表中保持最高层级", () => {
  assert.match(
    styles,
    /\.gpt-paragraph-nav__marker-row \{[\s\S]*?position: relative;[\s\S]*?z-index: 0;/
  );
  assert.match(
    styles,
    /\.gpt-paragraph-nav__marker-row:has\(\.gpt-paragraph-nav__marker-shell:hover\) \{[\s\S]*?z-index: var\(--gpt-nav-tooltip-z-index\);/
  );
});

test("提示条图片独立响应点击，并支持键盘打开页内大图", () => {
  assert.match(contentSource, /gpt-paragraph-nav__marker-shell/);
  assert.match(contentSource, /function createImagePreviewZoomIcon\(\)/);
  assert.match(contentSource, /gpt-paragraph-nav__label-thumbnail-zoom/);
  assert.match(contentSource, /labelThumbnail\.setAttribute\("role", "button"\)/);
  assert.match(contentSource, /labelThumbnail\.tabIndex = -1/);
  assert.match(contentSource, /openImagePreview\(labelThumbnail\)/);
  assert.match(contentSource, /event\.stopPropagation\(\);[\s\S]*?openImagePreview/);
  assert.match(
    styles,
    /\.gpt-paragraph-nav__label-thumbnail-zoom \{[\s\S]*?top: 6px;[\s\S]*?right: 6px;[\s\S]*?background: var\(--gpt-glass-input-bg\);[\s\S]*?color: var\(--gpt-arco-text-2\);[\s\S]*?pointer-events: none;/
  );
});

test("页内大图从点击的缩略图打开，并在离开会话时关闭", () => {
  assert.match(contentSource, /showImagePreview\(thumbnail, getRoot\(\), t,/);
  assert.match(contentSource, /dismissPreview\?\.\(\)/);
});

test("缩小模式为折叠分组的标题、余量和箭头扩展宽度", () => {
  assert.match(
    styles,
    /is-control-minimized \.gpt-paragraph-nav__fold \{\n  max-width: min\(280px, calc\(100vw - 28px\)\);/
  );
});

test("折叠 Maker 分组仅保留后置余量和箭头", () => {
  assert.doesNotMatch(contentSource, /gpt-paragraph-nav__fold-count/);
  assert.doesNotMatch(styles, /gpt-paragraph-nav__fold-count/);
  assert.match(contentSource, /gpt-paragraph-nav__fold-remainder/);
  assert.match(contentSource, /gpt-paragraph-nav__fold-chevron/);
});

test("所有箭头和下拉 chevron 使用统一的视觉居中规则", () => {
  assert.match(
    styles,
    /\.gpt-paragraph-nav__control-tab-chevron,[\s\S]*?\.gpt-paragraph-nav__explosion-copy-menu-trigger::after,[\s\S]*?\.gpt-paragraph-nav__fold-chevron \{[\s\S]*?display: block;[\s\S]*?box-sizing: border-box;[\s\S]*?transform-origin: center;/
  );
  assert.match(styles, /\.gpt-paragraph-nav__explosion-copy-menu-trigger::after \{[\s\S]*?flex: 0 0 6px;/);
  assert.match(styles, /\.gpt-paragraph-nav__user-chevron \{[\s\S]*?transform: translateY\(-1px\) rotate\(45deg\);/);
  assert.match(styles, /\.gpt-paragraph-nav__fold-chevron \{[\s\S]*?transform: translateY\(-1px\) rotate\(45deg\);/);
});

test("Maker 列表 chevron 复用主导航的 6px 几何和居中偏移", () => {
  assert.match(
    styles,
    /\.gpt-paragraph-nav__control-tab-chevron,[\s\S]*?\.gpt-paragraph-nav__user-chevron,[\s\S]*?\.gpt-paragraph-nav__fold-chevron \{[\s\S]*?flex: 0 0 6px;[\s\S]*?width: 6px;[\s\S]*?height: 6px;[\s\S]*?border-right: 1\.5px solid currentColor;[\s\S]*?border-bottom: 1\.5px solid currentColor;/
  );
  assert.match(styles, /\.gpt-paragraph-nav__user-chevron \{[\s\S]*?transform: translateY\(-1px\) rotate\(45deg\);/);
  assert.match(styles, /\.gpt-paragraph-nav__fold-chevron \{[\s\S]*?transform: translateY\(-1px\) rotate\(45deg\);/);
  assert.doesNotMatch(styles, /\.gpt-paragraph-nav__user-chevron \{[\s\S]*?flex: 0 0 8px;/);
});

test("Maker 正文默认左对齐且不改变 AI 与用户分组的队列位置", () => {
  assert.match(
    styles,
    /\.gpt-paragraph-nav__marker \{[^}]*justify-content: flex-start;[^}]*text-align: left;/
  );
  assert.match(
    styles,
    /\.gpt-paragraph-nav__floating-active \{[^}]*justify-content: flex-start;[^}]*text-align: left;/
  );
  assert.match(
    styles,
    /\.gpt-paragraph-nav__fold-label \{[^}]*text-align: left;/
  );
  assert.match(
    styles,
    /\.gpt-paragraph-nav__marker-row--ai \{\n  justify-content: flex-start;\n\}[\s\S]*?\.gpt-paragraph-nav__marker-row--user \{\n  justify-content: flex-end;\n\}/
  );
});

test("搜索栏默认沿用主导航背景，悬停时显示输入背景", () => {
  assert.match(
    styles,
    /\.gpt-paragraph-nav__search-input \{[\s\S]*?background: var\(--gpt-glass-dark-button-bg\);/
  );
  assert.match(
    styles,
    /\.gpt-paragraph-nav__search-input:hover \{\n  background: var\(--gpt-glass-input-bg\);\n\}/
  );
  assert.match(
    styles,
    /\.gpt-paragraph-nav__search-input::placeholder \{\n  color: var\(--gpt-arco-text-2\);\n\}/
  );
});

test("Maker 不显示阴影", () => {
  const userMarkerBlock = styles.match(/\.gpt-paragraph-nav__marker\.gpt-paragraph-nav__marker--user \{[^}]*\}/)?.[0] || "";
  assert.match(
    styles,
    /\.gpt-paragraph-nav__marker \{[\s\S]*?box-shadow: none;/
  );
  assert.match(
    styles,
    /\.gpt-paragraph-nav__marker\.gpt-paragraph-nav__marker--user \{[\s\S]*?box-shadow: none;/
  );
  assert.doesNotMatch(
    userMarkerBlock,
    /box-shadow: 0 /
  );
});
