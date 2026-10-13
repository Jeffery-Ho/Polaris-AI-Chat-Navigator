import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contentSource = await readFile(new URL("../src/content.js", import.meta.url), "utf8");

function functionSource(name, nextName) {
  const start = [
    contentSource.indexOf(`  function ${name}(`),
    contentSource.indexOf(`  async function ${name}(`)
  ].filter((index) => index >= 0).sort((first, second) => first - second)[0];
  const end = nextName
    ? contentSource.indexOf(`  function ${nextName}(`, start)
    : contentSource.length;
  return contentSource.slice(start, end);
}

test("非支持路由会释放页面滚动锁并清理插件界面", () => {
  const renderSource = functionSource("render", "scheduleRender");
  const routeSource = functionSource("handleRouteChange", "watchRouteChanges");
  const unsupportedRoute = renderSource.slice(renderSource.indexOf("if (!isSupportedRoute())"));
  const cleanupSource = functionSource("clearNonConversationPageState", "normalizeNumber");

  assert.match(unsupportedRoute, /clearNonConversationPageState\(\)/);
  assert.match(cleanupSource, /unlockPageScroll\(\)/);
  assert.match(cleanupSource, /removeNavigationRoot\(\)/);
  assert.match(routeSource, /render\(\)/);
});

test("无会话内容时同样释放滚动锁，不保留更新说明弹层", () => {
  const renderSource = functionSource("render", "scheduleRender");
  const noConversation = renderSource.slice(renderSource.indexOf("if (!renderSnapshot.hasConversation)"));
  const cleanupSource = functionSource("clearNonConversationPageState", "normalizeNumber");

  assert.match(noConversation, /clearNonConversationPageState\(\)/);
  assert.match(cleanupSource, /closeReleaseNoticeForNonConversation\(\)/);
  assert.match(cleanupSource, /removeNavigationRoot\(\)/);
});

test("页面清理后滚动监听不会重新创建插件根节点", () => {
  const floatingSource = functionSource("updateFloatingActiveMarker", "scheduleFloatingActiveUpdate");

  assert.match(floatingSource, /document\.getElementById\(ROOT_ID\)/);
  assert.match(floatingSource, /if \(!\(root instanceof HTMLElement\)\) \{\s+return;/);
  assert.doesNotMatch(floatingSource, /const root = getRoot\(\)/);
});

test("网页脚本不再自动打开或保存更新说明", () => {
  const startSource = functionSource("start", null);
  const renderSource = functionSource("render", "scheduleRender");
  assert.doesNotMatch(startSource, /readReleaseNoticeVersion|releaseNoticePending =/);
  assert.doesNotMatch(renderSource, /showPendingReleaseNotice\(\)/);
  assert.doesNotMatch(contentSource, /polaris-release-notice-version|saveReleaseNoticeVersion/);
});

test("滚动锁恢复进入插件前的 html/body overflow 值", async () => {
  const vm = await import("node:vm");
  const document = {
    documentElement: { style: { overflow: "auto" } },
    body: { style: { overflow: "scroll" } }
  };
  const state = { scrollLock: null };
  const context = { document, state };
  vm.createContext(context);
  vm.runInContext([
    functionSource("lockPageScroll", "unlockPageScroll"),
    functionSource("unlockPageScroll", "openExplosionOverlay")
  ].join("\n"), context);

  context.lockPageScroll();
  assert.deepEqual(
    { html: document.documentElement.style.overflow, body: document.body.style.overflow },
    { html: "hidden", body: "hidden" }
  );
  context.unlockPageScroll();
  assert.deepEqual(
    { html: document.documentElement.style.overflow, body: document.body.style.overflow },
    { html: "auto", body: "scroll" }
  );
  assert.equal(state.scrollLock, null);
});
