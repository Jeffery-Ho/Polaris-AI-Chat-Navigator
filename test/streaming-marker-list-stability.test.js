import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const contentSource = readFileSync(new URL("../src/content.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const liquidGlassSelectorStart = contentSource.indexOf("  const LIQUID_GLASS_SELECTOR = [");
const liquidGlassSelectorEnd = contentSource.indexOf('  ].join(", ");', liquidGlassSelectorStart);
const liquidGlassSelectorSource = contentSource.slice(liquidGlassSelectorStart, liquidGlassSelectorEnd);
const baseGlassStart = stylesSource.indexOf(".gpt-paragraph-nav__control-capsule,");
const dynamicGlassStart = stylesSource.indexOf("@supports ((backdrop-filter:", baseGlassStart);
const baseGlassSource = stylesSource.slice(baseGlassStart, dynamicGlassStart);
const dynamicGlassEnd = stylesSource.indexOf("\n\n.gpt-paragraph-nav__control-capsule {", dynamicGlassStart);
const dynamicGlassSource = stylesSource.slice(dynamicGlassStart, dynamicGlassEnd);
const renderStart = contentSource.indexOf("  function render(snapshot = null");
const renderEnd = contentSource.indexOf("  function scheduleRender(", renderStart);
const renderSource = contentSource.slice(renderStart, renderEnd);
const listStart = contentSource.indexOf("  function getList(");
const listEnd = contentSource.indexOf("  function getMarkerSearchInput(", listStart);
const listSource = contentSource.slice(listStart, listEnd);
const listConfigStart = contentSource.indexOf("  function configureMarkerList(");
const listConfigEnd = contentSource.indexOf("  function getVerticalSubmenu(", listConfigStart);
const listInteractionSource = contentSource.slice(listConfigStart, listConfigEnd);
const pointerMoveStart = contentSource.indexOf("  function handlePointerMove(");
const pointerMoveEnd = contentSource.indexOf("  function finishPointerDrag(", pointerMoveStart);
const pointerMoveSource = contentSource.slice(pointerMoveStart, pointerMoveEnd);
const finishPointerDragStart = pointerMoveEnd;
const finishPointerDragEnd = contentSource.indexOf("  function handlePointerUp(", finishPointerDragStart);
const finishPointerDragSource = contentSource.slice(finishPointerDragStart, finishPointerDragEnd);
const pointerDragClickStart = contentSource.indexOf("  function handlePointerDragClick(");
const pointerDragClickEnd = contentSource.indexOf("  function handlePointerDown(", pointerDragClickStart);
const pointerDragClickSource = contentSource.slice(pointerDragClickStart, pointerDragClickEnd);
const pointerDownStart = pointerDragClickEnd;
const pointerDownEnd = contentSource.indexOf("  function handlePointerMove(", pointerDownStart);
const pointerDownSource = contentSource.slice(pointerDownStart, pointerDownEnd);
const markerClickStart = contentSource.indexOf("  async function handleMarkerListClick(");
const markerClickEnd = contentSource.indexOf("  function displayedHeadingCount(", markerClickStart);
const markerClickSource = contentSource.slice(markerClickStart, markerClickEnd);
const markerRowUpdateStart = contentSource.indexOf("  function updateMarkerRenderRow(");
const markerRowUpdateEnd = contentSource.indexOf("  async function handleMarkerListClick(", markerRowUpdateStart);
const markerRowUpdateSource = contentSource.slice(markerRowUpdateStart, markerRowUpdateEnd);
const activeMarkerStart = contentSource.indexOf("  function updateActiveMarker(");
const activeMarkerEnd = contentSource.indexOf("  function isMarkerVisibleInViewport(", activeMarkerStart);
const activeMarkerSource = contentSource.slice(activeMarkerStart, activeMarkerEnd);
const activeSyncStart = contentSource.indexOf("  function syncActiveMarker(");
const activeSyncEnd = contentSource.indexOf("  function updateActiveMarker(", activeSyncStart);
const activeSyncSource = contentSource.slice(activeSyncStart, activeSyncEnd);
const floatingStart = contentSource.indexOf("  function updateFloatingActiveMarker(");
const floatingEnd = contentSource.indexOf("  function scheduleScrollWork(", floatingStart);
const floatingSource = contentSource.slice(floatingStart, floatingEnd);
const liquidGlassRegistrationStart = contentSource.indexOf("  function observeLiquidGlassElement(");
const liquidGlassRegistrationEnd = contentSource.indexOf("  function updateLiquidGlassFilter(", liquidGlassRegistrationStart);
const liquidGlassRegistrationSource = contentSource.slice(liquidGlassRegistrationStart, liquidGlassRegistrationEnd);
const routeResetStart = contentSource.indexOf("  function resetRouteState(");
const routeResetEnd = contentSource.indexOf("  function removeNavigationRoot(", routeResetStart);
const routeResetSource = contentSource.slice(routeResetStart, routeResetEnd);

test("整体折叠期间缓存最新快照且跳过列表协调", () => {
  const stateUpdate = renderSource.indexOf("state.markerGroups = markerGroups;");
  const collapsedReturn = renderSource.indexOf("if (state.isCollapsed)");
  const reconciliation = renderSource.indexOf("markerListReconciler.reconcile(");

  assert.ok(stateUpdate >= 0);
  assert.ok(collapsedReturn > stateUpdate);
  assert.ok(reconciliation > collapsedReturn);
});

test("流式渲染不再清空列表或取消进行中的滚动", () => {
  assert.doesNotMatch(renderSource, /list\.textContent\s*=\s*["']{2}/);
  assert.doesNotMatch(renderSource, /stopMarkerListScrollAnimation/);
});

test("AI 流式渲染期间不重写既有用户 Maker 文本", () => {
  assert.match(
    renderSource,
    /markerListReconciler\.reconcile\([\s\S]*?shouldUpdate: \(item\) => !\(suppressMarkerMotion && item\.type === "user"\)/
  );
});

test("Maker 卡片 wheel 使用列表原生滚动并取消自动定位", () => {
  assert.match(listInteractionSource, /createMarkerListNativeWheelHandler/);
  assert.match(listInteractionSource, /cancelAutoPosition: \(\) => markerListScrollPersistence\.cancel\(\)/);
  assert.match(listInteractionSource, /\{ passive: true \}/);
});

test("不再注册全局 wheel 或维护自定义滚动动画", () => {
  assert.doesNotMatch(contentSource, /lifecycle\.listen\(window, "wheel"/);
  assert.doesNotMatch(contentSource, /handleMarkerListWheel|markerListWheelHitWidth|animateMarkerListScroll/);
  assert.doesNotMatch(contentSource, /markerListScrollAnimation|markerListScrollTarget/);
});

test("Maker 列表拖动超过阈值后让手动滚动接管", () => {
  assert.match(pointerMoveSource, /drag\.kind === "list"[\s\S]*markerListScrollPersistence\.cancel\(\)/);
});

test("Maker 卡片轻点保留点击，超过阈值拖动时抑制点击", () => {
  const thresholdGuard = pointerMoveSource.indexOf("POINTER_DRAG_THRESHOLD");
  const dragActivation = pointerMoveSource.indexOf("drag.didDrag = true");

  assert.ok(thresholdGuard >= 0);
  assert.ok(dragActivation > thresholdGuard);
  assert.match(finishPointerDragSource, /drag\.didDrag[\s\S]*suppressNextClick\(\)/);
  assert.match(pointerDragClickSource, /state\.suppressNextClick[\s\S]*event\.preventDefault\(\)[\s\S]*event\.stopImmediatePropagation\(\)/);
  assert.match(pointerDownSource, /markerListDragTarget\(event, root\)[\s\S]*kind: "list"/);
  assert.match(contentSource, /markerListCardForTarget\(event\.target, list\)/);
});

test("手动收起活动 Maker 分组时保留选中，滚动不改写分组状态", () => {
  assert.match(markerClickSource, /toggleFoldGroupExpansion\([\s\S]*collapsedKeys: state\.collapsedFoldGroups/);
  assert.doesNotMatch(markerClickSource, /clearActiveMarker\(\)/);
  assert.doesNotMatch(activeMarkerSource, /shouldAutoExpandActiveFoldGroup|collapsedFoldGroups|collapsedUserMarkerKeys/);
});

test("DOM 映射临时缺失时保留选中 key 并暂停活动定位", () => {
  assert.match(contentSource, /function getSelectedHeading\(\)/);
  assert.match(activeMarkerSource, /const selected = getSelectedHeading\(\)[\s\S]*if \(!selected\)[\s\S]*clearActiveMarker\(\)/);
  assert.match(activeMarkerSource, /const activeElement = currentElementForHeading\(selected\)[\s\S]*if \(!activeElement\)[\s\S]*state\.activeHeading = null[\s\S]*return/);
});

test("流式快照和路由重置不会恢复已取消的 Active Maker 定位", () => {
  assert.doesNotMatch(renderSource, /markerListScrollPersistence\.request\(\)/);
  assert.match(routeResetSource, /markerListActiveTracker\.reset\(\)/);
  assert.match(routeResetSource, /markerListScrollPersistence\.reset\(\)/);
});

test("列表滚动仅使用缓存的活动元素更新浮动 Maker", () => {
  assert.match(floatingSource, /updateFloatingActiveMarker\(markerListActiveTracker\.current\(\)\)/);
  assert.doesNotMatch(floatingSource, /syncActiveMarker\(/);
  assert.match(activeSyncSource, /markerListActiveTracker\.sync/);
  assert.doesNotMatch(activeSyncSource, /querySelectorAll/);
});

test("流式更新同一 Maker 节点时保留活动样式", () => {
  assert.match(markerRowUpdateSource, /const wasActive = marker\.classList\.contains\("is-active"\)/);
  assert.match(markerRowUpdateSource, /marker\.classList\.toggle\("is-active", wasActive\)/);
});

test("液态玻璃只在元素首次注册时主动刷新", () => {
  const alreadyRegisteredGuard = liquidGlassRegistrationSource.indexOf("state.liquidGlassElements.has(element)");
  const earlyReturn = liquidGlassRegistrationSource.indexOf("return;", alreadyRegisteredGuard);
  const refresh = liquidGlassRegistrationSource.indexOf("updateLiquidGlassFilter(element)");

  assert.ok(alreadyRegisteredGuard >= 0);
  assert.ok(earlyReturn > alreadyRegisteredGuard);
  assert.ok(refresh > earlyReturn);
});

test("Maker 与浮动 Maker 使用轻量玻璃且不注册动态 SVG 滤镜", () => {
  assert.doesNotMatch(liquidGlassSelectorSource, /__marker|__fold|__floating-active/);
  assert.match(baseGlassSource, /\.gpt-paragraph-nav__fold/);
  assert.match(baseGlassSource, /\.gpt-paragraph-nav__marker/);
  assert.match(baseGlassSource, /\.gpt-paragraph-nav__floating-active/);
  assert.match(baseGlassSource, /backdrop-filter: blur\(var\(--gpt-glass-blur\)\) saturate\(var\(--gpt-glass-saturate\)\)/);
  assert.match(dynamicGlassSource, /\.gpt-paragraph-nav__control-capsule/);
  assert.match(dynamicGlassSource, /\.gpt-paragraph-nav__search-input/);
  assert.doesNotMatch(dynamicGlassSource, /__marker|__fold|__floating-active/);
  assert.doesNotMatch(floatingSource, /updateLiquidGlassFilter\(/);
});
