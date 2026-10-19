import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createSidepanelReleaseNotice } from "../src/sidepanel-release-notice.js";

const storageKey = "polaris-release-notice-version";

async function boot({ lastSeen, version = "0.68.0", locale = "zh", storageError = false, writeError = false, deferredRead = false, asyncClose = false, autoShowGate } = {}) {
  const dom = new JSDOM('<body><button class="settings-release-notes">更新说明</button><main id="polaris-window"></main></body>', { pretendToBeVisual: true });
  const { window } = dom;
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    if (asyncClose) window.setTimeout(() => this.dispatchEvent(new window.Event("close")), 0);
    else this.dispatchEvent(new window.Event("close"));
  };
  const local = lastSeen ? { [storageKey]: lastSeen } : {};
  const writes = [];
  const listeners = [];
  let resolveRead;
  const reading = new Promise((resolve) => { resolveRead = resolve; });
  const chrome = {
    runtime: { getManifest: () => ({ version, version_name: `${version}(275)` }) },
    storage: {
      local: {
        async get() { if (storageError) throw new Error("storage unavailable"); return deferredRead ? reading : { ...local }; },
        async set(values) { if (storageError || writeError) throw new Error("storage unavailable"); writes.push(values); Object.assign(local, values); }
      },
      onChanged: { addListener(listener) { listeners.push(listener); } }
    }
  };
  const t = (key, args) => ({
    "releaseNotice.title": locale === "zh" ? "Polaris 已更新" : "Polaris is updated",
    "releaseNotice.summary": `Updated to ${args?.version || ""}`,
    "releaseNotice.acknowledge": locale === "zh" ? "知道了" : "Got it",
    "releaseNotice.close": "Close update notice",
    "releaseNotice.feedback": "Feedback",
    "releaseNotice.emailAction": "Email feedback",
    "releaseNotice.issueAction": "GitHub Issue",
    "support.aria": "Support Polaris"
  })[key] || key;
  const notice = createSidepanelReleaseNotice({ document: window.document, chrome, locale, t, ...(autoShowGate ? { autoShowGate } : {}) });
  if (!deferredRead) await notice.ready;
  return { dom, window, notice, local, writes, listeners, completeRead: () => resolveRead(lastSeen ? { [storageKey]: lastSeen } : {}) };
}

test("首次打开侧栏可在没有网页快照时展示内置说明，关闭后记为已读", async () => {
  const s = await boot();
  try {
    const dialog = s.window.document.querySelector("dialog[open]");
    assert.ok(dialog);
    assert.match(dialog.textContent, /0\.68/);
    assert.doesNotMatch(dialog.textContent, /更新说明暂不可用/);
    assert.equal(s.writes.length, 0);
    dialog.querySelector(".release-notice-acknowledge").click();
    await Promise.resolve();
    assert.equal(s.window.document.querySelector("dialog[open]"), null);
    assert.deepEqual(s.writes, [{ [storageKey]: "0.68.0" }]);
  } finally { s.dom.window.close(); }
});

test("跨功能版本提示一次，同功能版本的补丁更新保持安静", async () => {
  for (const [lastSeen, version, expected] of [["0.67.7", "0.68.0", true], ["0.68.0", "0.68.1", false], ["0.68.0", "0.68.0", false]]) {
    const s = await boot({ lastSeen, version });
    try { assert.equal(Boolean(s.window.document.querySelector("dialog[open]")), expected); }
    finally { s.dom.window.close(); }
  }
});

test("退出侧栏而未关闭说明不会写入已读，下次仍展示", async () => {
  const first = await boot({ lastSeen: "0.67.7" });
  assert.equal(first.writes.length, 0);
  first.dom.window.close();
  const next = await boot({ lastSeen: first.local[storageKey] });
  try { assert.ok(next.window.document.querySelector("dialog[open]")); }
  finally { next.dom.window.close(); }
});

test("已读说明可再次打开，关闭后将焦点归还入口", async () => {
  const s = await boot({ lastSeen: "0.68.0", locale: "en" });
  try {
    const button = s.window.document.querySelector("button");
    button.focus();
    s.notice.open();
    assert.match(s.window.document.querySelector("dialog[open]").textContent, /A single sidepanel experience/);
    const close = s.window.document.querySelector(".release-notice-close");
    close.focus(); close.click();
    assert.equal(s.window.document.activeElement, button);
    s.notice.open();
    const cancel = new s.window.Event("cancel", { cancelable: true });
    s.window.document.querySelector("dialog").dispatchEvent(cancel);
    assert.equal(s.window.document.querySelector("dialog[open]"), null);
  } finally { s.dom.window.close(); }
});

test("其他侧栏记录已读后关闭自动提示，但保留手动回看", async () => {
  const s = await boot({ lastSeen: "0.67.7" });
  try {
    s.listeners.forEach((listener) => listener({ [storageKey]: { newValue: "0.68.0" } }, "local"));
    assert.equal(s.window.document.querySelector("dialog[open]"), null);
    assert.equal(s.writes.length, 0);
    s.notice.open();
    s.listeners.forEach((listener) => listener({ [storageKey]: { newValue: "0.68.0" } }, "local"));
    assert.ok(s.window.document.querySelector("dialog[open]"));
  } finally { s.dom.window.close(); }
});

test("存储失败不会妨碍关闭，当前会话不重复自动提示", async (t) => {
  t.mock.method(console, "warn", () => {});
  const s = await boot({ storageError: true });
  try {
    s.window.document.querySelector(".release-notice-acknowledge").click();
    await Promise.resolve();
    s.window.document.dispatchEvent(new s.window.Event("visibilitychange"));
    assert.equal(s.window.document.querySelector("dialog[open]"), null);
    s.notice.open();
    assert.ok(s.window.document.querySelector("dialog[open]"));
  } finally { s.dom.window.close(); }
});

test("初始化的旧读取不会覆盖其他侧栏新收到的已读状态", async () => {
  const s = await boot({ lastSeen: "0.67.7", deferredRead: true });
  try {
    s.listeners.forEach((listener) => listener({ [storageKey]: { newValue: "0.68.0" } }, "local"));
    s.completeRead(); await s.notice.ready;
    assert.equal(s.window.document.querySelector("dialog[open]"), null);
  } finally { s.dom.window.close(); }
});

test("原生异步关闭和迟到读取不会重新提示或删除后续手动弹窗", async (t) => {
  t.mock.method(console, "warn", () => {});
  const s = await boot({ lastSeen: "0.67.7", deferredRead: true, asyncClose: true, writeError: true });
  try {
    s.notice.open();
    s.window.document.querySelector(".release-notice-acknowledge").click();
    s.completeRead(); await s.notice.ready;
    assert.equal(s.window.document.querySelector("dialog[open]"), null);
    s.notice.open();
    const current = s.window.document.querySelector("dialog[open]");
    await new Promise((resolve) => s.window.setTimeout(resolve, 5));
    assert.equal(s.window.document.querySelector("dialog[open]"), current);
    assert.equal(s.window.document.querySelectorAll("dialog").length, 1);
  } finally { s.dom.window.close(); }
});

test("新手引导已展示时不自动弹出更新说明，手动打开仍可用", async () => {
  const s = await boot({ autoShowGate: Promise.resolve(false) });
  try {
    assert.equal(s.window.document.querySelector("dialog[open]"), null);
    s.notice.open();
    assert.ok(s.window.document.querySelector(".release-notice-dialog[open]"));
  } finally { s.dom.window.close(); }
});
