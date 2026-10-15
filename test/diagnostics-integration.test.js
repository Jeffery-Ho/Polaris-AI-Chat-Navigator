import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contentSource = await readFile(new URL("../src/content.js", import.meta.url), "utf8");
const settingsSource = await readFile(new URL("../src/settings-panel.jsx", import.meta.url), "utf8");
const i18nSource = await readFile(new URL("../src/i18n.js", import.meta.url), "utf8");

function functionSource(name, nextName) {
  const start = contentSource.indexOf(`  function ${name}(`);
  const end = contentSource.indexOf(`  function ${nextName}(`, start);
  return contentSource.slice(start, end);
}

test("拖动使用指针捕获并覆盖异常结束、路由移除与窄视口边界", () => {
  const pointerDown = functionSource("handlePointerDown", "handlePointerMove");
  const pointerMove = functionSource("handlePointerMove", "completePointerDrag");
  const routeReset = functionSource("resetRouteState", "removeNavigationRoot");
  const removeRoot = functionSource("removeNavigationRoot", "handleRouteChange");

  assert.match(pointerDown, /capturePointerForDrag\(drag, event\.pointerId\)/);
  assert.match(pointerMove, /POINTER_DRAG_THRESHOLD/);
  assert.match(contentSource, /lifecycle\.listen\(window, "lostpointercapture", handleLostPointerCapture/);
  assert.match(contentSource, /lifecycle\.listen\(window, "blur", handleWindowBlur/);
  assert.match(contentSource, /lifecycle\.listen\(document, "visibilitychange", handleVisibilityChange/);
  assert.match(contentSource, /lifecycle\.listen\(window, "pagehide", handlePageHide/);
  assert.match(routeReset, /cancelPointerDrag\("route-change"\)/);
  assert.match(removeRoot, /cancelPointerDrag\("navigation-root-removed"\)/);
  assert.match(contentSource, /Math\.max\(0, Math\.min\(position\.top, maxTop\)\)/);
  assert.match(contentSource, /Math\.max\(0, Math\.min\(position\.right, maxRight\)\)/);
});

test("设置页同时提供发送和仅下载日志，并显示操作状态", () => {
  assert.match(settingsSource, /createDiagnosticsSection/);
  assert.match(settingsSource, /model\.onSendDiagnostics/);
  assert.match(settingsSource, /model\.onDownloadDiagnostics/);
  assert.match(settingsSource, /role/, "settings panel should expose an accessible status");
  assert.match(contentSource, /onDownloadDiagnostics: handleDownloadDiagnostics/);
  assert.match(contentSource, /onSendDiagnostics: handleSendDiagnostics/);
  assert.match(i18nSource, /settings\.diagnostics\.send/);
  assert.match(i18nSource, /settings\.diagnostics\.download/);
});

test("诊断日志只走本地会话存储和用户主动下载/邮件入口", () => {
  assert.match(contentSource, /createDiagnosticLog\(\)/);
  assert.match(contentSource, /downloadDiagnosticLog/);
  assert.match(contentSource, /openDiagnosticEmail/);
  assert.match(contentSource, /jefferyho\.build@gmail\.com/);
  assert.doesNotMatch(contentSource, /fetch\([^)]*diagnostic|navigator\.sendBeacon/);
  assert.match(contentSource, /errorName: diagnosticErrorName/);
  assert.doesNotMatch(contentSource, /event\.message|event\.error\.stack/);
});
