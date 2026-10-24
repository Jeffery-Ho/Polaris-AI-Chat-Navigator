import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { JSDOM } from "jsdom";
import { SUPPORTED_PLATFORMS, LAST_USED_PLATFORM_STORAGE_KEY, createPlatformLinks, openPlatformTab } from "../src/supported-platforms.js";
import { SUPPORTED_MATCHES } from "../src/supported-sites.js";

function matches(pattern, url) {
  const [, scheme, host] = pattern.match(/^(\w+):\/\/([^/]+)\//);
  const target = new URL(url);
  return target.protocol === `${scheme}:` && target.hostname === host;
}

test("每个平台入口都指向支持的站点，图标存在", () => {
  assert.equal(SUPPORTED_PLATFORMS.length, 11);
  for (const platform of SUPPORTED_PLATFORMS) {
    assert.ok(SUPPORTED_MATCHES.some((pattern) => matches(pattern, platform.url)), platform.url);
    for (const host of platform.alternateHosts || []) {
      assert.ok(SUPPORTED_MATCHES.includes(`https://${host}/*`), host);
    }
    assert.ok(existsSync(new URL(`../public/${platform.favicon}`, import.meta.url)), platform.favicon);
  }
});

function browser({ tabs = [], stored = {} } = {}) {
  const calls = { created: [], activated: [], focused: [] };
  const chrome = {
    runtime: { getURL: (path) => `chrome-extension://test/${path}` },
    storage: { local: {
      async get() { return { ...stored }; },
      async set(values) { Object.assign(stored, values); }
    } },
    tabs: {
      async query({ url }) { return tabs.filter((tab) => url.some((pattern) => matches(pattern, tab.url))); },
      async update(id, options) { calls.activated.push({ id, ...options }); },
      async create(options) { calls.created.push(options); return { id: 100, ...options }; }
    },
    windows: {
      async getCurrent() { return { id: 1 }; },
      async update(id, options) { calls.focused.push({ id, ...options }); }
    }
  };
  return { chrome, calls, stored };
}

test("平台入口复用现有会话，包括平台的其他受支持域名", async () => {
  for (const platform of SUPPORTED_PLATFORMS) {
    for (const host of [new URL(platform.url).hostname, ...(platform.alternateHosts || [])]) {
      const tab = { id: 7, windowId: 1, url: `https://${host}/chat/existing?mode=one` };
      const { chrome, calls } = browser({ tabs: [tab] });
      assert.equal(await openPlatformTab(chrome, platform), tab);
      assert.deepEqual(calls.activated, [{ id: 7, active: true }]);
      assert.deepEqual(calls.created, []);
      assert.equal(tab.url, `https://${host}/chat/existing?mode=one`);
    }
  }
});

test("多个会话优先当前窗口的活动页，其次最近访问的会话", async () => {
  const tabs = [
    { id: 8, windowId: 2, active: true, lastAccessed: 300, url: "https://chatgpt.com/c/other-window" },
    { id: 9, windowId: 1, active: false, lastAccessed: 200, url: "https://chatgpt.com/c/recent" },
    { id: 10, windowId: 1, active: false, lastAccessed: 100, url: "https://chatgpt.com/c/older" }
  ];
  const { chrome, calls } = browser({ tabs });
  assert.equal((await openPlatformTab(chrome, SUPPORTED_PLATFORMS[0])).id, 9);
  tabs[2].active = true;
  assert.equal((await openPlatformTab(chrome, SUPPORTED_PLATFORMS[0])).id, 10);
  assert.deepEqual(calls.created, []);
});

test("会话位于其他窗口时一并聚焦该窗口，未打开时才新建", async () => {
  const { chrome, calls } = browser({ tabs: [{ id: 3, windowId: 2, url: "https://claude.ai/chat/existing" }] });
  await openPlatformTab(chrome, SUPPORTED_PLATFORMS[1]);
  assert.deepEqual(calls.focused, [{ id: 2, focused: true }]);
  assert.deepEqual(calls.created, []);
  await openPlatformTab(chrome, SUPPORTED_PLATFORMS[0]);
  assert.deepEqual(calls.created, [{ url: "https://chatgpt.com/", windowId: 1, active: true }]);
});

test("点击阻止默认跳转并保存上次使用，重新打开入口后恢复唯一 badge", async () => {
  const dom = new JSDOM("<body></body>");
  const { chrome, calls, stored } = browser({ tabs: [{ id: 3, windowId: 1, url: "https://claude.ai/chat/existing" }] });
  try {
    const list = createPlatformLinks(dom.window.document, chrome, { lastUsedLabel: "上次使用" });
    await Promise.resolve();
    assert.equal(list.querySelector(".platform-link-badge:not([hidden])"), null);
    const link = list.querySelector('[data-platform="claude"]');
    assert.equal(link.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })), false);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls.created, []);
    assert.equal(stored[LAST_USED_PLATFORM_STORAGE_KEY], "claude");
    assert.equal(list.querySelectorAll(".platform-link-badge:not([hidden])").length, 1);
    assert.equal(link.querySelector(".platform-link-badge:not([hidden])").textContent, "上次使用");
    assert.equal(link.getAttribute("aria-label"), "Claude · 上次使用");
    const restored = createPlatformLinks(dom.window.document, chrome, { compact: true, lastUsedLabel: "上次" });
    await Promise.resolve();
    assert.equal(restored.querySelectorAll(".platform-link-badge:not([hidden])").length, 1);
    assert.equal(restored.querySelector('[data-platform="claude"] .platform-link-badge:not([hidden])').textContent, "上次");
  } finally { dom.window.close(); }
});
