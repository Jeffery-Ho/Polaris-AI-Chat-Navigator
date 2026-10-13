import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const platformFaviconFiles = ["chatgpt", "claude", "gemini", "grok", "doubao", "kimi", "qianwen", "yuanbao", "xiaohongshu", "manus"];
const [buildManifest, background, content, windowSource, sidePanelHtml, windowCss, searchInputSource, tokensCss] = await Promise.all([
  readFile(new URL("../manifest.build.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../src/background.js", import.meta.url), "utf8"),
  readFile(new URL("../src/content.js", import.meta.url), "utf8"),
  readFile(new URL("../src/window.js", import.meta.url), "utf8"),
  readFile(new URL("../sidepanel.html", import.meta.url), "utf8"),
  readFile(new URL("../src/window.css", import.meta.url), "utf8"),
  readFile(new URL("../src/search-input.js", import.meta.url), "utf8"),
  readFile(new URL("../src/tokens.css", import.meta.url), "utf8")
]);

test("manifest.build.json 声明 Polaris 窗口和系统 side panel 入口", () => {
  assert.deepEqual(buildManifest.permissions, ["storage", "tabs", "sidePanel", "scripting"]);
  assert.equal(buildManifest.action.default_title, "Open Polaris");
  assert.deepEqual(buildManifest.side_panel, { default_path: "sidepanel.html" });
  assert.equal(buildManifest.background.service_worker, "src/background.js");
  assert.equal(buildManifest.background.type, "module");
});

test("侧栏跟随最近的普通标签页", () => {
  assert.match(background, /openPanelOnActionClick: true/);
  assert.match(background, /active: true, lastFocusedWindow: true/);
  assert.match(background, /chrome\.tabs\.onUpdated/);
  assert.match(background, /SOURCE_WINDOW_STORAGE_KEY]: lastNormalWindowId/);
  assert.match(background, /publishEmptySnapshot/);
  assert.match(background, /publishEmptySnapshot\(targetTab\.id, isSupportedCandidateUrl\(targetTab\.url\)\)/);
  assert.match(background, /persistWindowConfigCommand/);
  assert.match(background, /POLARIS_WINDOW_STATE/);
  assert.match(background, /POLARIS_WINDOW_IMAGE/);
  assert.match(background, /message\.command === "refresh-state"/);
  assert.match(background, /isNormalSourceTab/);
  assert.match(content, /__POLARIS_CONTENT_SCRIPT_ACTIVE__/);
});

test("内容脚本通过快照桥提供 Maker、章节和设置操作", () => {
  assert.match(content, /POLARIS_WINDOW_REQUEST_STATE/);
  assert.match(content, /POLARIS_WINDOW_COMMAND/);
  assert.match(content, /POLARIS_CONTENT_STATE/);
  assert.match(content, /POLARIS_WINDOW_CHAPTERS/);
  assert.match(content, /request-image-preview/);
  assert.match(content, /markerItems/);
  assert.match(content, /currentModelLabel/);
  assert.match(content, /Select ChatGPT model/);
  assert.match(content, /model: currentModelLabel\(\)/);
  assert.match(content, /mergeWindowConfigPatch/);
  assert.match(content, /revision: Date\.now\(\)/);
  assert.match(content, /routeKey: currentRouteKey/);
  assert.match(content, /reset-config/);
  assert.match(content, /is-window-managed/);
});

test("侧栏包含导航、章节、设置和无对话平台空状态", () => {
  assert.match(sidePanelHtml, /data-window-type="sidepanel"/);
  assert.match(windowSource, /renderNavigation/);
  assert.match(windowSource, /renderChapters/);
  assert.match(windowSource, /renderSettings/);
  assert.match(windowSource, /supportedPlatforms/);
  assert.match(windowSource, /startSourceObserver/);
  assert.match(windowSource, /startThemeObserver/);
  assert.match(windowSource, /matchMedia\(SYSTEM_THEME_QUERY\)/);
  assert.match(windowSource, /addEventListener\("change", refresh\)/);
  assert.match(windowSource, /chrome\.tabs\?\.onActivated/);
  assert.match(windowSource, /chrome\.tabs\?\.onUpdated/);
  assert.match(windowSource, /setInterval\(requestSourceState, 1200\)/);
  assert.match(windowSource, /const shouldRetry = !snapshot \|\| Boolean\(snapshot\.supportedRoute && !snapshot\.hasConversation\)/);
  assert.match(windowSource, /if \(isLoading \|\| snapshot\.loading\)/);
  assert.match(windowSource, /Reading conversation/);
  assert.match(windowSource, /No conversation here/);
  assert.match(windowSource, /jump-to-marker/);
  assert.match(windowSource, /request-chapters/);
  assert.match(windowSource, /matchesSearch/);
  assert.match(windowSource, /input\.type = "text"/);
  assert.match(windowSource, /input\.lang = locale === "zh" \? "zh-CN" : "en"/);
  assert.match(windowSource, /if \(item\.type === "user"\)/);
  assert.doesNotMatch(windowSource, /append\(copy, element\("span", "maker-chevron"/);
  assert.doesNotMatch(windowSource, /empty-symbol|platform-grid|platform-chip|iconLabel/);
  assert.match(windowSource, /platform-stack/);
  assert.match(windowSource, /platform-favicon/);
  assert.match(windowSource, /icon\.alt = label/);
  assert.match(windowSource, /download-diagnostics/);
});

test("Side Panel 使用窗口专属赤陶品牌层级", () => {
  assert.match(windowCss, /--window-accent: #b85c3a;/i);
  assert.match(windowCss, /--window-accent-dark: #e69a78;/i);
  assert.match(windowCss, /--polaris-bg: #faf9f7;/i);
  assert.match(windowCss, /--polaris-bg: #191817;/i);
  assert.match(windowSource, /window-brand/);
  assert.match(windowSource, /window-meta/);
  assert.match(windowSource, /window-settings-button/);
  assert.match(windowSource, /window-platform-icon/);
  assert.match(windowSource, /platform\.setAttribute\("role", "img"\)/);
  assert.match(windowSource, /function activePlatform\(snapshot\) \{[\s\S]*?\|\| null;/);
  assert.match(windowSource, /if \(snapshot\?\.supportedRoute && platformData\) \{[\s\S]*?meta\.append\(platform\);/);
  assert.doesNotMatch(windowSource, /favicon: "icons\/gpt-voyager-icon-32\.png"/);
  assert.match(windowSource, /createSettingsIcon/);
  assert.match(windowSource, /window-settings-nav/);
  assert.match(windowSource, /createBackIcon/);
  assert.match(windowSource, /window-settings-back/);
  assert.match(windowSource, /document\.querySelector\("\.window-settings-back"\)\?\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(windowSource, /secondary-button settings-back/);
  assert.doesNotMatch(windowSource, /maker-badge maker-badge-model/);
  assert.match(windowSource, /previousContentTab/);
  assert.match(windowSource, /restoreViewState/);
  assert.match(windowSource, /focusSearchInput\(activeSearch\)/);
  assert.match(windowSource, /state\.activeTab === "settings"\) \{\s*closeSettings\(\)/);
  assert.match(windowSource, /settingsButton\.addEventListener\("pointerdown", \(\) => \{\s*if \(state\.activeTab !== "settings"\) rememberViewState\(\)/);
  assert.match(windowSource, /\["navigation",[\s\S]*?\["chapters",/);
  assert.doesNotMatch(windowSource, /\["settings", locale/);
});

test("侧栏保留搜索清除并使用层级章节阅读器", () => {
  assert.match(windowSource, /renderSearchEmpty/);
  assert.match(windowSource, /clear-search/);
  assert.match(windowSource, /createSidepanelChapterReader/);
  assert.doesNotMatch(windowSource, /chapter-selector|fitExpandedChapterDirectory/);
});

test("AI 流式快照原位协调 Maker，用户分组正文不再重建", () => {
  assert.match(windowSource, /createMarkerListReconciler/);
  assert.match(windowSource, /const existingBody = root\.querySelector\(":scope > \.window-body"\)/);
  assert.match(windowSource, /renderBody\(snapshot, \{ isLoading, existingBody \}\)/);
  assert.match(windowSource, /windowMarkerListReconciler\.reconcile\(list, renderItems\)/);
  assert.match(
    windowSource,
    /if \(item\.type !== "user" \|\| !title\.textContent\) \{\s*title\.textContent = primaryText;/
  );
  assert.match(windowSource, /createMarkerStreamingIndicator/);
  assert.match(windowSource, /markerStreamingIndicator\.pulse\(streamingMarker\)/);
  assert.match(windowSource, /previousContentSignatures/);
  assert.match(windowSource, /previousContentSignatures\.get\(item\.key\) !== markerContentSignature\(item\)/);
  assert.match(windowSource, /button\.dataset\.markerContentSignature = markerContentSignature\(item\)/);
  assert.match(windowSource, /if \(item\.type === "empty"\) \{[\s\S]*?button\.textContent = item\.message \|\| "";/);
  assert.doesNotMatch(
    windowSource,
    /state\.routeKey !== \(message\.snapshot\.routeKey \|\| ""\) \|\| state\.snapshot\?\.revision !== message\.snapshot\.revision/
  );
  assert.doesNotMatch(windowCss, /polaris-window-marker-text-breathe/);
  assert.match(windowCss, /\.maker-card-ai\.is-streaming \.maker-streaming-loader \{[\s\S]*?animation: polaris-window-marker-loader-spin/);
});

test("侧栏图片预览使用中性遮罩并带有可读名称", () => {
  assert.match(windowCss, /\.image-preview \{[^}]*background: var\(--polaris-overlay\);/);
  assert.match(windowSource, /close\.setAttribute\("aria-label", t\("userMarker\.closeImagePreview"\)\)/);
  assert.match(windowSource, /previous\.setAttribute\("aria-label", t\("userMarker\.previousImage"\)\)/);
  assert.match(windowSource, /next\.setAttribute\("aria-label", t\("userMarker\.nextImage"\)\)/);
  assert.match(windowSource, /image\.alt = t\("userMarker\.imagePreview"\)/);
});

test("侧栏缩略图加载失败后移除破图并保留 Maker 文本", () => {
  assert.match(windowSource, /image\.addEventListener\("error", \(\) => \{[\s\S]*?image\.remove\(\)/);
  assert.match(windowSource, /button\.insertBefore\(image, button\.querySelector\(":scope > \.maker-copy"\)\)/);
});

test("Maker 列表用同一套表面区分 agent 和用户卡片，并保留可见焦点", () => {
  assert.match(windowCss, /\.maker-card-ai \{[\s\S]*?background: var\(--polaris-bg-subtle\);/);
  assert.match(windowCss, /\.maker-card-user \{[\s\S]*?background: var\(--polaris-bg-elevated\);/);
  assert.match(windowCss, /\.maker-card:hover \{[\s\S]*?background: var\(--polaris-bg-subtle\);/);
  assert.match(windowCss, /\.maker-card:focus-visible[\s\S]*?outline: 2px solid var\(--polaris-focus\);/);
  assert.doesNotMatch(windowCss, /\.maker-card \{[^}]*outline:\s*0/);
});

test("Side Panel 的 Maker 卡片不显示阴影", () => {
  assert.match(windowCss, /\.maker-card \{[^}]*box-shadow: none;/);
});

test("Maker 卡片正文保持左对齐，仅流式状态显示小型 loading", () => {
  assert.match(windowCss, /\.maker-card \{[\s\S]*?justify-content: flex-start;[\s\S]*?text-align: left;[\s\S]*?text-indent: 0;/);
  assert.match(windowCss, /\.maker-copy \{[\s\S]*?margin: 0;[\s\S]*?padding: 0;[\s\S]*?text-align: left;[\s\S]*?text-indent: 0;/);
  assert.match(windowCss, /\.maker-card\.is-expanded,[\s\S]*?\.maker-card\.is-expanded \.maker-copy \{[\s\S]*?justify-content: flex-start;[\s\S]*?text-align: left;[\s\S]*?text-indent: 0;/);
  assert.match(windowCss, /\.maker-card-fold,\n\.maker-card-earlier \{[\s\S]*?justify-content: flex-start;/);
  assert.match(windowCss, /\.maker-streaming-loader \{[\s\S]*?display: none;[\s\S]*?flex: 0 0 10px;[\s\S]*?width: 10px;[\s\S]*?height: 10px;/);
  assert.match(windowCss, /\.maker-card-ai\.is-streaming \.maker-streaming-loader \{[\s\S]*?display: block;/);
  assert.match(windowCss, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.maker-streaming-loader \{\s*animation: none !important;/);
  assert.match(windowCss, /\.maker-card-user \{[\s\S]*?align-self: flex-end;/);
});

test("窗口标题只保留平台图标，卡片不重复模型名", () => {
  assert.doesNotMatch(windowSource, /function renderHeader\(snapshot\)[\s\S]*?snapshot\.model/);
  assert.match(windowSource, /function renderMarker\(item\)/);
  assert.doesNotMatch(windowSource, /function renderMarker\(item, model/);
  assert.doesNotMatch(windowSource, /renderMarker\(item,/);
  assert.doesNotMatch(windowSource, /maker-badge-role|"Agent"/);
  assert.doesNotMatch(windowSource, /"maker-preview"/);
  assert.match(windowCss, /\.maker-badge \{[^}]*background: var\(--polaris-accent-subtle\);[^}]*color: var\(--polaris-accent\);/);
  assert.match(windowCss, /\.maker-badge \{[^}]*width: fit-content;/);
});

test("Side Panel 不使用渐变背景", () => {
  assert.match(windowCss, /@import "\.\/tokens\.css"/);
  assert.match(tokensCss, /--window-background: var\(--polaris-bg\)/);
  assert.match(tokensCss, /--polaris-bg: #ffffff;/);
  assert.match(tokensCss, /--polaris-bg: #09090b;/);
  assert.doesNotMatch(windowCss, /radial-gradient|linear-gradient/);
  assert.doesNotMatch(tokensCss, /--window-background:[^;]*(?:radial-gradient|linear-gradient)/);
});

test("搜索输入支持中文输入法组合态并在提交后刷新", () => {
  for (const source of [searchInputSource]) {
    assert.match(source, /compositionstart/);
    assert.match(source, /compositionend/);
    assert.match(source, /event\.isComposing/);
  }
  assert.match(windowSource, /bindSearchInput/);
  assert.match(content, /bindSearchInput/);
});

test("空状态使用每个平台打包的 favicon 资源", async () => {
  await Promise.all(platformFaviconFiles.map((name) => access(new URL(`../icons/platform-${name}.png`, import.meta.url))));
  assert.equal((windowSource.match(/icons\/platform-[^"']+\.png/g) || []).length, platformFaviconFiles.length);
  assert.doesNotMatch(windowSource, /from ["']\.\/assets\/platform-favicons\/[^"']+\.png["']/);
  assert.match(windowSource, /chrome\.runtime\.getURL\(favicon\)/);
  const resources = buildManifest.web_accessible_resources?.flatMap((entry) => entry.resources) || [];
  for (const name of platformFaviconFiles) assert.ok(resources.includes(`icons/platform-${name}.png`));
});
