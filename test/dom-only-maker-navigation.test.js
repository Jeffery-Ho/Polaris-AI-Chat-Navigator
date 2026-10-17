import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const contentSource = readFileSync(new URL("../src/content.js", import.meta.url), "utf8");
const routeBridgeSource = readFileSync(new URL("../public/src/route-bridge.js", import.meta.url), "utf8");

function functionSource(name, nextName) {
  const start = contentSource.indexOf(`function ${name}(`);
  const end = contentSource.indexOf(`function ${nextName}(`, start);
  return contentSource.slice(start, end);
}

test("路由切换立即清空旧列表，并等待宿主 DOM 变更后才扫描", () => {
  const routeChange = functionSource("handleRouteChange", "watchRouteChanges");
  const mutations = functionSource("handleDocumentMutations", "getSelectedHeading");
  const renderSnapshot = functionSource("collectMarkerRenderSnapshot", "render");
  const windowBridge = functionSource("registerWindowBridge", "collectMarkerRenderSnapshot");

  assert.match(routeChange, /clearNonConversationPageState\(\)/);
  assert.match(routeChange, /state\.awaitingRouteDom = true/);
  assert.match(routeChange, /scheduleRouteDomFallback\(\)/);
  assert.match(routeChange, /render\(\)/);
  assert.doesNotMatch(routeChange, /scheduleRender/);
  assert.match(contentSource, /console\.info\(`\$\{routeFallbackLogMessage\(details\)\} level=\$\{level\}`\)/);
  assert.doesNotMatch(contentSource, /console\.warn\("\[Polaris\] Route fallback/);
  assert.match(contentSource, /function isPolarisOwnedMutationNode/);
  assert.match(contentSource, /changedNodes\.every\(isPolarisOwnedMutationNode\)/);
  assert.match(mutations, /state\.awaitingRouteDom = false/);
  assert.match(renderSnapshot, /if \(state\.awaitingRouteDom\)/);
  assert.match(windowBridge, /!state\.awaitingRouteDom && state\.markerSourceContainers\.length === 0/);
  assert.match(windowBridge, /publishWindowSnapshot\(\)/);
});

test("Maker 分组只使用当前挂载 DOM，AI 标题跟随当前用户容器", () => {
  const collection = functionSource("collectMarkerGroups", "syncUserMarkerExpansion");

  assert.match(collection, /userContainers/);
  assert.match(collection, /assistantContainers/);
  assert.match(collection, /assistantToUser\.set\(entry\.element, currentUser\)/);
  assert.match(collection, /group\.headings\.push\(heading\)/);
  assert.doesNotMatch(collection, /snapshot|sourceMessageKey|conversation/);
});

test("连续标题去重在用户回复分组后执行", () => {
  const renderSnapshot = functionSource("collectMarkerRenderSnapshot", "render");
  const groupDeduplication = functionSource("dedupeAdjacentGroupHeadings", "syncUserMarkerExpansion");

  assert.match(renderSnapshot, /dedupeAdjacentGroupHeadings\(/);
  assert.match(groupDeduplication, /group\.user\?\.element/);
});

test("未挂载目标只显示既有提示，不再尝试恢复滚动", () => {
  const target = functionSource("currentElementForHeading", "jumpToHeading");
  const click = functionSource("handleMarkerListClick", "displayedHeadingCount");

  assert.doesNotMatch(target, /resolveElement|recover/);
  assert.match(click, /jumpToHeading\(heading\)/);
  assert.match(click, /replyNotLoaded/);
  assert.doesNotMatch(contentSource, /recoverMakerElement|makerSnapshotModel|fetch\(.*conversation/);
});

test("反向会话滚动容器会把原生定位标记传给共享跳转函数", () => {
  const jump = functionSource("jumpToMarker", "currentElementForHeading");

  assert.match(jump, /window\.getComputedStyle\(scrollContainer\)/);
  assert.match(jump, /display === "flex"/);
  assert.match(jump, /flexDirection === "column-reverse"/);
  assert.match(jump, /reverseFlow:/);
});

test("路由桥只发布 SPA 路由变化，不读取 ChatGPT 会话 API", () => {
  assert.match(routeBridgeSource, /pushState/);
  assert.match(routeBridgeSource, /ROUTE_CHANGE_EVENT/);
  assert.doesNotMatch(routeBridgeSource, /backend-api\/conversation|window\.fetch|message/);
});
