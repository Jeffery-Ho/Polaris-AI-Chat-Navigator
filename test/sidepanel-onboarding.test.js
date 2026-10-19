import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createI18n } from "../src/i18n.js";
import { createSidepanelOnboarding, ONBOARDING_STORAGE_KEY, ONBOARDING_VERSION } from "../src/sidepanel-onboarding.js";

async function boot({ stored = {}, locale = "zh", reducedMotion = false, readError = false, writeError = false } = {}) {
  const dom = new JSDOM('<body><button class="window-settings-button">设置</button></body>', { pretendToBeVisual: true });
  const { window } = dom;
  window.matchMedia = (query) => ({ matches: reducedMotion && query === "(prefers-reduced-motion: reduce)" });
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new window.Event("close")); };
  const local = { ...stored };
  const writes = [];
  const chrome = {
    runtime: { getManifest: () => ({ version: "0.74.0" }), getURL: (path) => `chrome-extension://polaris/${path}` },
    storage: { local: {
      async get() { if (readError) throw new Error("unavailable"); return { ...local }; },
      async set(values) { if (writeError) throw new Error("unavailable"); writes.push(values); Object.assign(local, values); }
    } }
  };
  const { t } = createI18n(locale === "zh" ? "zh-CN" : "en");
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args);
  const onboarding = createSidepanelOnboarding({ document: window.document, chrome, locale, t });
  const shown = await onboarding.ready;
  console.warn = warn;
  const doc = window.document;
  return { dom, doc, onboarding, shown, writes, warnings, dialog: () => doc.querySelector(".onboarding-dialog[open]") };
}

function advance(context, milliseconds) {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 20) {
    context.mock.timers.tick(Math.min(20, milliseconds - elapsed));
  }
}

test("切换步骤后移入移出鼠标，旧演示不会重播覆盖当前步骤", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const s = await boot();
  try {
    const dialog = s.dialog();
    dialog.querySelector(".onboarding-next").click();
    const figure = dialog.querySelector(".onboarding-figure");
    figure.dispatchEvent(new s.dom.window.Event("pointerenter"));
    figure.dispatchEvent(new s.dom.window.Event("pointerleave"));
    advance(context, 5500);
    assert.equal(dialog.dataset.step, "open");
    assert.ok(figure.classList.contains("ob-figure-open"), figure.className);
    assert.ok(figure.querySelector("[data-ob=polaris]"));
    dialog.querySelector(".onboarding-close").click();
    figure.dispatchEvent(new s.dom.window.Event("pointerleave"));
    advance(context, 6000);
    assert.equal(s.dialog(), null);
  } finally { s.dom.window.close(); }
});

test("暂停演示时清除点击状态", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const s = await boot({ locale: "en" });
  try {
    const dialog = s.dialog();
    dialog.querySelectorAll(".onboarding-dot")[5].click();
    const figure = dialog.querySelector(".onboarding-figure");
    advance(context, 1540);
    assert.ok(figure.querySelector(".is-demo-press"));
    figure.dispatchEvent(new s.dom.window.Event("pointerenter"));
    assert.equal(figure.querySelector(".is-demo-press"), null);
    assert.equal(figure.querySelector(".ob-cursor.is-pressed"), null);
  } finally { s.dom.window.close(); }
});

test("暂停演示时取消尚未完成的逐字输入", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const s = await boot({ locale: "en" });
  try {
    const dialog = s.dialog();
    dialog.querySelectorAll(".onboarding-dot")[5].click();
    const figure = dialog.querySelector(".onboarding-figure");
    advance(context, 1920);
    const query = figure.querySelector("[data-ob=query]");
    assert.equal(query.textContent, "d");
    figure.dispatchEvent(new s.dom.window.Event("pointerenter"));
    advance(context, 1000);
    assert.equal(query.textContent, "d");
  } finally { s.dom.window.close(); }
});

test("快速切换全部步骤再恢复播放，演示始终属于当前步骤", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const s = await boot();
  try {
    const dialog = s.dialog();
    const figure = dialog.querySelector(".onboarding-figure");
    const dots = dialog.querySelectorAll(".onboarding-dot");
    for (const index of [1, 2, 3, 4, 5, 6, 0, 5, 2, 6]) dots[index].click();
    figure.dispatchEvent(new s.dom.window.Event("pointerenter"));
    figure.dispatchEvent(new s.dom.window.Event("pointerleave"));
    for (let elapsed = 0; elapsed < 12000; elapsed += 200) {
      advance(context, 200);
      assert.ok(figure.classList.contains("ob-figure-copy"), figure.className);
      assert.equal(figure.querySelectorAll(".ob-cursor").length, 1);
    }
  } finally { s.dom.window.close(); }
});

test("切步和关闭时取消未完成的逐字输入及循环任务", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const s = await boot({ locale: "en" });
  try {
    const dialog = s.dialog();
    dialog.querySelectorAll(".onboarding-dot")[5].click();
    advance(context, 1920);
    const query = dialog.querySelector("[data-ob=query]");
    assert.equal(query.textContent, "d");
    dialog.querySelectorAll(".onboarding-dot")[6].click();
    advance(context, 1000);
    assert.equal(query.textContent, "d");
    const figure = dialog.querySelector(".onboarding-figure");
    dialog.querySelector(".onboarding-close").click();
    const stopped = figure.innerHTML;
    advance(context, 6000);
    assert.equal(figure.innerHTML, stopped);
  } finally { s.dom.window.close(); }
});

test("首次打开自动展示引导，关闭后同时记录引导与更新说明已读", async () => {
  const s = await boot();
  try {
    assert.equal(s.shown, true);
    const dialog = s.dialog();
    assert.ok(dialog);
    assert.equal(dialog.querySelector(".onboarding-eyebrow").textContent, "新手引导 · 1 / 7");
    assert.equal(dialog.querySelectorAll(".platform-link").length, 11);
    assert.equal(dialog.querySelector(".onboarding-previous").hidden, true);
    assert.equal(s.doc.activeElement, dialog.querySelector(".onboarding-next"));
    dialog.querySelector(".onboarding-close").click();
    assert.equal(s.dialog(), null);
    assert.deepEqual(s.writes, [{ [ONBOARDING_STORAGE_KEY]: ONBOARDING_VERSION, "polaris-release-notice-version": "0.74.0" }]);
    assert.equal(s.doc.activeElement, s.doc.querySelector(".window-settings-button"));
  } finally { s.dom.window.close(); }
});

test("已看过当前引导版本时不自动展示，手动打开仍可用", async () => {
  const s = await boot({ stored: { [ONBOARDING_STORAGE_KEY]: ONBOARDING_VERSION } });
  try {
    assert.equal(s.shown, false);
    assert.equal(s.dialog(), null);
    s.onboarding.open();
    s.onboarding.open();
    assert.equal(s.doc.querySelectorAll(".onboarding-dialog").length, 1);
  } finally { s.dom.window.close(); }
});

test("下一步、上一步、圆点与方向键切换卡片，最后一张开始使用后关闭", async () => {
  const s = await boot({ locale: "en" });
  try {
    const dialog = s.dialog();
    const next = dialog.querySelector(".onboarding-next");
    const title = () => dialog.querySelector(".onboarding-title").textContent;
    next.click();
    assert.equal(title(), "Open the sidepanel");
    assert.equal(dialog.querySelector('[aria-current="step"]'), dialog.querySelectorAll(".onboarding-dot")[1]);
    dialog.querySelector(".onboarding-previous").click();
    assert.equal(title(), "Works with 11 AI platforms");
    dialog.dispatchEvent(new s.dom.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    assert.equal(dialog.dataset.step, "open");
    dialog.querySelectorAll(".onboarding-dot")[6].click();
    assert.equal(title(), "Copy a chapter");
    assert.equal(dialog.querySelector(".onboarding-skip").hidden, true);
    assert.equal(next.textContent, "Get started");
    next.click();
    assert.equal(s.dialog(), null);
    assert.equal(s.writes.length, 1);
  } finally { s.dom.window.close(); }
});

test("跳过与 Esc 都会关闭并记为已读", async () => {
  const skip = await boot();
  try {
    skip.dialog().querySelector(".onboarding-skip").click();
    assert.equal(skip.dialog(), null);
    assert.equal(skip.writes.length, 1);
  } finally { skip.dom.window.close(); }
  const escape = await boot();
  try {
    escape.dialog().dispatchEvent(new escape.dom.window.Event("cancel", { cancelable: true }));
    assert.equal(escape.dialog(), null);
    assert.equal(escape.writes.length, 1);
  } finally { escape.dom.window.close(); }
});

test("每张卡片都有操作演示光标，减少动效时直接展示结果", async () => {
  const s = await boot();
  try {
    const dialog = s.dialog();
    for (let index = 0; index < 7; index += 1) {
      assert.ok(dialog.querySelector(".onboarding-figure .ob-cursor"), `step ${index + 1}`);
      if (index < 6) dialog.querySelector(".onboarding-next").click();
    }
  } finally { s.dom.window.close(); }
  const reduced = await boot({ reducedMotion: true });
  try {
    const dialog = reduced.dialog();
    assert.equal(dialog.querySelector(".ob-cursor"), null);
    dialog.querySelectorAll(".onboarding-dot")[1].click();
    assert.ok(dialog.querySelector("[data-ob=panel]").classList.contains("is-open"));
    dialog.querySelectorAll(".onboarding-dot")[5].click();
    assert.equal(dialog.querySelector("[data-ob=query]").textContent, "部署");
    assert.ok(dialog.querySelector("[data-ob=match]").classList.contains("is-match"));
    dialog.querySelectorAll(".onboarding-dot")[6].click();
    assert.ok(dialog.querySelector("[data-ob=status]").classList.contains("is-visible"));
  } finally { reduced.dom.window.close(); }
});

test("演示按脚本推进悬停与点击状态", async () => {
  const s = await boot();
  try {
    const dialog = s.dialog();
    dialog.querySelectorAll(".onboarding-dot")[1].click();
    await new Promise((resolve) => setTimeout(resolve, 2000));
    assert.ok(dialog.querySelector("[data-ob=polaris]").classList.contains("is-demo-hover"));
    assert.ok(dialog.querySelector("[data-ob=panel]").classList.contains("is-open"));
    assert.ok(dialog.querySelector(".ob-cursor").classList.contains("is-visible"));
  } finally { s.dom.window.close(); }
});

test("存储读取失败时不展示也不抛错，写入失败只记录警告", async () => {
  const failedRead = await boot({ readError: true });
  try {
    assert.equal(failedRead.shown, false);
    assert.equal(failedRead.dialog(), null);
    assert.equal(failedRead.warnings.length, 1);
  } finally { failedRead.dom.window.close(); }
  const failedWrite = await boot({ writeError: true });
  try {
    failedWrite.dialog().querySelector(".onboarding-close").click();
    assert.equal(failedWrite.dialog(), null);
  } finally { failedWrite.dom.window.close(); }
});
