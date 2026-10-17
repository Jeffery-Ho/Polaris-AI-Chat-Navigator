import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const packagedContentScripts = [{
  css: ["assets/content-styles-HASH.css"],
  js: ["assets/i18n-HASH.js", "assets/content-HASH.js"]
}];

const [backgroundSource, deliverySource] = await Promise.all([
  readFile(new URL("../src/background.js", import.meta.url), "utf8"),
  readFile(new URL("../src/snapshot-delivery.js", import.meta.url), "utf8")
]);
const executableBackgroundSource = backgroundSource.replace(
  'import { snapshotDeliveryResult } from "./snapshot-delivery.js";\n',
  deliverySource.replaceAll("export ", "")
).replace("export function initializeBackground", "function initializeBackground") + "\ninitializeBackground();";

function createEvent() {
  let listener = null;
  return {
    addListener(next) {
      listener = next;
    },
    emit(...args) {
      return listener?.(...args);
    }
  };
}

async function runAction({ storedWindow, getError = null, updateError = null, syncGetError = null, sidePanel = false, behaviorError = null, sidebarAction = false, toggleError = null, contentScriptFailures = 0, contentResponse, scripting = false, cssError = null, scriptError = null, contentScripts = packagedContentScripts, settleMs = 0 }) {
  const windowUrl = "chrome-extension://test/polaris-home.html";
  const sourceTab = { id: 42, windowId: 9, active: true, url: "https://chatgpt.com/c/test" };
  const local = {
    "polaris-window-id": storedWindow?.id ?? null,
    "polaris-window-tab-id": storedWindow?.tabs?.[0]?.id ?? null,
    "polaris-source-window-id": sourceTab.windowId,
    "polaris-source-tab-id": sourceTab.id
  };
  local["polaris-release-notice-version"] = "0.67.7";
  local["existing-preference"] = { enabled: true };
  const action = createEvent();
  const runtimeMessage = createEvent();
  const calls = { creates: [], updates: [], contentRequests: [], runtimeMessages: [], sidePanelBehaviors: [], sidebarToggles: 0, cssInjections: [], scriptInjections: [], warnings: [] };
  let contentRequestAttempts = 0;
  const noOpEvent = () => createEvent();
  const chrome = {
    action: { onClicked: action },
    sidePanel: sidePanel ? {
      async setPanelBehavior(behavior) { calls.sidePanelBehaviors.push(behavior); if (behaviorError) throw behaviorError; }
    } : undefined,
    sidebarAction: sidebarAction ? {
      async toggle() { calls.sidebarToggles += 1; if (toggleError) throw toggleError; }
    } : undefined,
    scripting: scripting ? {
      async insertCSS(details) {
        calls.cssInjections.push(details);
        if (cssError) throw cssError;
      },
      async executeScript(details) {
        calls.scriptInjections.push(details);
        if (scriptError) throw scriptError;
      }
    } : undefined,
    runtime: {
      getManifest() {
        return { content_scripts: contentScripts };
      },
      getURL(path) { return `chrome-extension://test/${path}`; },
      async sendMessage(message) { calls.runtimeMessages.push(message); },
      onMessage: runtimeMessage
    },
    storage: {
      local: {
        async get(key) {
          if (typeof key === "string") return { [key]: local[key] };
          return { ...local };
        },
        async set(values) { Object.assign(local, values); },
        async remove(keys) {
          for (const key of [].concat(keys)) delete local[key];
        }
      },
      sync: {
        async get() {
          if (syncGetError) throw syncGetError;
          return {};
        },
        async set() {},
        async remove() {}
      }
    },
    windows: {
      WINDOW_ID_NONE: -1,
      async get() {
        if (getError) throw getError;
        return storedWindow;
      },
      async create(data) {
        calls.creates.push(data);
        return { id: 10, type: "popup", tabs: [{ id: 99, url: windowUrl }] };
      },
      async update(id, data) {
        calls.updates.push({ id, data });
        if (updateError) throw updateError;
        return { id, ...data };
      },
      onFocusChanged: noOpEvent(),
      onRemoved: noOpEvent()
    },
    tabs: {
      async query() { return [sourceTab]; },
      async sendMessage(tabId, message) {
        calls.contentRequests.push({ tabId, message });
        if (contentRequestAttempts < contentScriptFailures) {
          contentRequestAttempts += 1;
          throw new Error("content script unavailable");
        }
        return contentResponse;
      },
      async update() {},
      async get() { return sourceTab; },
      onActivated: noOpEvent(),
      onUpdated: noOpEvent(),
      onRemoved: noOpEvent()
    }
  };

  vm.runInNewContext(executableBackgroundSource, {
    chrome,
    URL,
    Number,
    Date,
    Promise,
    setTimeout,
    clearTimeout,
    console: {
      warn(...args) { calls.warnings.push(args); },
      log() {},
      error(...args) { calls.warnings.push(args); }
    }
  });
  action.emit(sourceTab);
  runtimeMessage.emit({ type: "POLARIS_WINDOW_READY", windowType: "sidepanel" }, {});
  await new Promise((resolve) => setTimeout(resolve, settleMs));
  calls.command = (message) => new Promise((resolve) => runtimeMessage.emit(message, {}, resolve));
  calls.local = local;
  return calls;
}

test("章节来源定位将 content script 的成功响应返回侧栏", async () => {
  const calls = await runAction({ storedWindow: null, contentResponse: { ok: true } });
  const response = await calls.command({ type: "POLARIS_WINDOW_COMMAND", command: "jump-to-chapter", markerKey: "user-1", expectedTabId: 42, expectResult: true });
  assert.equal(response.ok, true);
  assert.equal(calls.contentRequests.at(-1).message.markerKey, "user-1");
});

test("章节来源定位保留失败结果并拒绝已切换的来源标签页", async () => {
  const calls = await runAction({ storedWindow: null, contentResponse: { ok: false } });
  const command = { type: "POLARIS_WINDOW_COMMAND", command: "jump-to-chapter", markerKey: "user-1", expectedTabId: 42, expectResult: true };
  assert.equal((await calls.command(command)).ok, false);
  const requests = calls.contentRequests.length;
  assert.equal((await calls.command({ ...command, expectedTabId: 99 })).ok, false);
  assert.equal(calls.contentRequests.length, requests);
});

test("诊断命令将内容页的导出状态返回侧栏", async () => {
  const calls = await runAction({ storedWindow: null, contentResponse: { ok: true, diagnosticStatus: "Log downloaded." } });
  const response = await calls.command({ type: "POLARIS_WINDOW_COMMAND", command: "download-diagnostics", expectedTabId: 42, expectResult: true });
  assert.equal(response.diagnosticStatus, "Log downloaded.");
  assert.equal(calls.contentRequests.at(-1).message.command, "download-diagnostics");
});

async function runSidePanelReady() {
  const sourceTab = { id: 42, windowId: 7, active: true, url: "https://chatgpt.com/c/test" };
  const local = {
    "polaris-window-id": 9,
    "polaris-window-tab-id": 99,
    "polaris-source-window-id": sourceTab.windowId,
    "polaris-source-tab-id": sourceTab.id
  };
  const runtimeMessage = createEvent();
  const sends = [];
  const noOpEvent = () => createEvent();
  const chrome = {
    action: { onClicked: noOpEvent() },
    runtime: {
      getURL(path) { return `chrome-extension://test/${path}`; },
      async sendMessage() {},
      onMessage: runtimeMessage
    },
    storage: {
      local: {
        async get(key) {
          if (typeof key === "string") return { [key]: local[key] };
          return { ...local };
        },
        async set(values) { Object.assign(local, values); },
        async remove(keys) {
          for (const key of [].concat(keys)) delete local[key];
        }
      },
      sync: {
        async get() { return {}; },
        async set() {},
        async remove() {}
      }
    },
    windows: {
      WINDOW_ID_NONE: -1,
      onFocusChanged: noOpEvent(),
      onRemoved: noOpEvent()
    },
    tabs: {
      async query() { return [sourceTab]; },
      async get() { return sourceTab; },
      async sendMessage(tabId) { sends.push(tabId); },
      onActivated: noOpEvent(),
      onUpdated: noOpEvent(),
      onRemoved: noOpEvent()
    }
  };

  vm.runInNewContext(executableBackgroundSource, { chrome, URL, Number, Date, Promise, console });
  runtimeMessage.emit({ type: "POLARIS_WINDOW_READY", windowType: "sidepanel" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { local, sends };
}



test("Side Panel API 缺失时不再创建独立窗口", async () => {
  const calls = await runAction({ storedWindow: null, sidePanel: false });
  assert.equal(calls.creates.length, 0);
});

test("Firefox 缺少 Side Panel API 时，扩展图标切换 sidebar_action", async () => {
  const calls = await runAction({ storedWindow: null, sidebarAction: true });
  assert.equal(calls.sidebarToggles, 1);
  assert.equal(calls.creates.length, 0);
  assert.equal(calls.warnings.some((args) => String(args[0]).includes("does not support")), false);
});

test("Firefox 侧栏切换失败只记录警告", async () => {
  const calls = await runAction({ sidebarAction: true, toggleError: new Error("blocked") });
  assert.equal(calls.sidebarToggles, 1);
  assert.equal(calls.warnings.some((args) => String(args[0]).includes("could not be toggled")), true);
});

test("同时支持 Side Panel API 时不注册 sidebar 切换", async () => {
  const calls = await runAction({ sidePanel: true, sidebarAction: true });
  assert.equal(calls.sidebarToggles, 0);
  assert.equal(calls.sidePanelBehaviors.length, 1);
});

test("侧栏配置失败不会回退创建独立窗口", async () => {
  const calls = await runAction({ sidePanel: true, behaviorError: new Error("unsupported") });
  assert.equal(calls.creates.length, 0);
  assert.equal(calls.warnings.some((args) => String(args[0]).includes("could not be configured")), true);
});

test("清理旧窗口标识保留已读和偏好，残留 ID 不影响当前来源", async () => {
  const calls = await runAction({ sidePanel: true, storedWindow: { id: 9, tabs: [{ id: 42 }] } });
  assert.equal(calls.local["polaris-window-id"], undefined);
  assert.equal(calls.local["polaris-window-tab-id"], undefined);
  assert.equal(calls.local["polaris-release-notice-version"], "0.67.7");
  assert.deepEqual(calls.local["existing-preference"], { enabled: true });
  assert.equal(calls.contentRequests[0].tabId, 42);
  assert.equal(calls.creates.length, 0);
});

test("支持系统 side panel 时，扩展图标交给浏览器打开面板", async () => {
  const calls = await runAction({ storedWindow: null, sidePanel: true });

  assert.equal(calls.sidePanelBehaviors.length, 1);
  assert.equal(calls.sidePanelBehaviors[0].openPanelOnActionClick, true);
  assert.equal(calls.creates.length, 0);
});

test("目标平台缺少 content script 时会动态注入并重试 DOM 状态读取", async () => {
  const calls = await runAction({ storedWindow: null, contentScriptFailures: 1, scripting: true });

  assert.equal(calls.contentRequests.length, 2);
  assert.equal(calls.cssInjections.length, 1);
  assert.equal(calls.cssInjections[0].target.tabId, 42);
  assert.deepEqual([...calls.cssInjections[0].files], packagedContentScripts[0].css);
  assert.equal(calls.scriptInjections.length, 1);
  assert.equal(calls.scriptInjections[0].target.tabId, 42);
  assert.equal(calls.scriptInjections[0].target.allFrames, false);
  assert.deepEqual([...calls.scriptInjections[0].files], packagedContentScripts[0].js);
});

test("动态注入按 manifest 顺序合并脚本，并去掉重复路径", async () => {
  const calls = await runAction({
    storedWindow: null,
    contentScriptFailures: 1,
    scripting: true,
    contentScripts: [
      { js: ["assets/i18n-HASH.js"], css: ["assets/content-styles-HASH.css"] },
      { js: ["assets/i18n-HASH.js", "assets/content-HASH.js"], css: ["assets/content-styles-HASH.css"] }
    ]
  });

  assert.deepEqual([...calls.cssInjections[0].files], ["assets/content-styles-HASH.css"]);
  assert.deepEqual([...calls.scriptInjections[0].files], ["assets/i18n-HASH.js", "assets/content-HASH.js"]);
});

test("样式注入失败不会阻止脚本注入，脚本注入失败会留下日志", async () => {
  const calls = await runAction({
    storedWindow: null,
    contentScriptFailures: 1,
    scripting: true,
    cssError: new Error("duplicate stylesheet"),
    scriptError: new Error("inject failed")
  });

  assert.equal(calls.scriptInjections.length, 1);
  assert.equal(calls.warnings.some((args) => String(args[0]).includes("[Polaris] Content script injection failed.")), true);
});

test("同一次回退只注入一次，消息仍然失败时会记录日志", async () => {
  const calls = await runAction({
    storedWindow: null,
    contentScriptFailures: 5,
    scripting: true,
    settleMs: 200
  });

  assert.equal(calls.scriptInjections.length, 1);
  assert.equal(calls.warnings.some((args) => String(args[0]).includes("[Polaris] Content script did not respond after injection.")), true);
});




test("启动时支持会话先请求内容状态，不先显示无会话空快照", async () => {
  const calls = await runAction({ storedWindow: null });

  assert.equal(calls.contentRequests.length, 1);
  assert.equal(calls.contentRequests[0].tabId, 42);
  assert.equal(calls.contentRequests[0].message.type, "POLARIS_WINDOW_REQUEST_STATE");
  const stateMessage = calls.runtimeMessages.find((message) => message.type === "POLARIS_WINDOW_STATE");
  assert.ok(stateMessage);
  assert.equal(stateMessage.snapshot.loading, true);
});


test("系统 side panel 就绪时不会把宿主浏览器窗口登记为 Polaris popup", async () => {
  const { local, sends } = await runSidePanelReady();
  assert.equal(local["polaris-window-id"], undefined);
  assert.equal(local["polaris-window-tab-id"], undefined);
  assert.deepEqual(sends, [42]);
});
