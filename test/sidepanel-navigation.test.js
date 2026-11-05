import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createPageNavigation } from '../src/sidepanel-navigation.js';

test('品牌标题整体使用 Lora 字标，包括 Pro 后缀', () => {
  const { document } = new JSDOM('').window;
  const nav = createPageNavigation(document, { title: 'Polaris Pro', backLabel: 'Back', onBack() {}, wordmark: true });
  const heading = nav.querySelector('.window-settings-nav-title');
  assert.equal(heading.children.length, 1);
  assert.equal(heading.querySelector('.polaris-wordmark').textContent, 'Polaris Pro');
});

test('非品牌标题不套用字标', () => {
  const { document } = new JSDOM('').window;
  const nav = createPageNavigation(document, { title: 'Settings', backLabel: 'Back', onBack() {}, wordmark: true });
  assert.equal(nav.querySelector('.polaris-wordmark'), null);
});

test('Pro 卡片标题使用 Lora SemiBold Italic', async () => {
  const css = await readFile(new URL('../src/window.css', import.meta.url), 'utf8');
  assert.match(css, /\.settings-pro-title \{[^}]*font-family: "Polaris Lora"[^}]*font-weight: 600;[^}]*font-style: italic;/);
});
