import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createSidepanelPlatformMenu } from "../src/sidepanel-platform-menu.js";

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function fixture({ tier = "free", locale = "zh", failOpen = false } = {}) {
  const dom = new JSDOM('<button class="window-platform">Platform</button><button id="outside">Outside</button>', { pretendToBeVisual: true });
  const document = dom.window.document;
  let view = { available: true, tier, fullAccess: tier !== "free", platforms: ["chatgpt", "kimi"] };
  const calls = [];
  const chrome = { runtime: { getURL: path => `https://extension.test/${path}` }, storage: { local: { set: async value => calls.push(["remember", value]) } },
    tabs: { query: async () => { if (failOpen) throw new Error("unavailable"); return [{ id: 7, windowId: 1 }]; }, update: async (id, fields) => calls.push(["tab", id, fields]) },
    windows: { getCurrent: async () => ({ id: 1 }), update: async id => calls.push(["window", id]) } };
  const menu = createSidepanelPlatformMenu({ document, chrome, locale, getView: () => view, getPlatform: () => "kimi",
    onManage: () => calls.push(["manage"]), onRestricted: platform => calls.push(["restricted", platform.key]), onUpgrade: () => calls.push(["upgrade"]) });
  const click = key => document.querySelector(`[data-platform="${key}"]`).click();
  return { dom, document, menu, calls, click, setView(next) { view = next; menu.refresh(); } };
}

test("Free 菜单只开放已选平台，受限平台与管理入口不导航或修改名单", async () => {
  const f = fixture();
  try {
    f.menu.toggle(); assert.equal(f.document.querySelector('.window-platform').getAttribute('aria-expanded'), 'true');
    assert.equal(f.document.querySelectorAll('.platform-menu-list:not(.is-restricted) button').length, 2);
    assert.equal(f.document.querySelectorAll('.is-restricted button').length, 9);
    f.click('gemini'); assert.deepEqual(f.calls, [['restricted', 'gemini']]); assert.equal(f.menu.isOpen(), false);
    f.menu.toggle(); f.document.querySelector('.platform-menu-footer button').click(); assert.deepEqual(f.calls.at(-1), ['manage']);
    f.menu.toggle(); f.document.querySelector('.platform-menu-footer button:last-child').click(); assert.deepEqual(f.calls.at(-1), ['upgrade']);
    assert.equal(f.calls.some(([name]) => name === 'tab'), false);
    f.menu.toggle(); f.click('kimi'); await tick(); assert.deepEqual(f.calls.find(([name]) => name === 'tab'), ['tab', 7, { active: true }]);
    assert.equal(f.menu.isOpen(), false); assert.ok(f.calls.find(([name]) => name === 'remember'));
  } finally { f.menu.close(); f.dom.window.close(); }
});

test("试用与 Pro 全平台可切换，许可与来源刷新不会关闭菜单或丢失焦点", () => {
  for (const tier of ['trial', 'pro']) {
    const f = fixture({ tier, locale: 'en' });
    try {
      f.menu.toggle(); assert.equal(f.document.querySelectorAll('.platform-menu-platform').length, 11); assert.equal(f.document.querySelector('.is-restricted'), null);
      assert.equal(f.document.querySelector('.platform-menu-footer') === null, tier === 'pro');
      f.document.querySelector('[data-platform="claude"]').focus();
      f.setView({ available: true, tier: 'free', fullAccess: false, platforms: ['chatgpt', 'kimi'] });
      assert.equal(f.menu.isOpen(), true); assert.equal(f.document.activeElement.dataset.platform, 'claude');
      f.document.querySelector('.window-platform').replaceWith(f.document.querySelector('.window-platform').cloneNode(true));
      f.menu.refresh(); assert.equal(f.document.querySelector('.window-platform').getAttribute('aria-expanded'), 'true');
    } finally { f.menu.close(); f.dom.window.close(); }
  }
});

test("Escape、外部点击与焦点离开会关闭菜单，导航失败可重试", async () => {
  const f = fixture({ failOpen: true });
  try {
    f.menu.toggle(); f.click('kimi'); await tick(); assert.equal(f.menu.isOpen(), true); assert.ok(f.document.querySelector('[role=alert]'));
    assert.ok([...f.document.querySelectorAll('.window-platform-menu button')].every(button => !button.disabled));
    f.document.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(f.menu.isOpen(), false); assert.equal(f.document.activeElement.className, 'window-platform');
    f.menu.toggle(); f.document.querySelector('#outside').dispatchEvent(new f.dom.window.Event('pointerdown', { bubbles: true })); assert.equal(f.menu.isOpen(), false);
    f.menu.toggle(); f.document.querySelector('#outside').focus(); assert.equal(f.menu.isOpen(), false);
  } finally { f.menu.close(); f.dom.window.close(); }
});
