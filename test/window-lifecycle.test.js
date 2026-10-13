import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const packagedContentScripts = [{
  css: ["assets/content-styles-HASH.css"],
  js: ["assets/i18n-HASH.js", "assets/content-HASH.js"]
}];

const [backgroundSource, lifecycleSource, deliverySource] = await Promise.all([
  readFile(new URL("../src/background.js", import.meta.url), "utf8"),
  readFile(new URL("../src/window-lifecycle.js", import.meta.url), "utf8"),
  readFile(new URL("../src/snapshot-delivery.js", import.meta.url), "utf8")
]);
const executableBackgroundSource = backgroundSource
  .replace(
    'import { matchingPolarisTab, restorePopupWindowUpdate } from "./window-lifecycle.js";\n',
    lifecycleSource.replaceAll("export ", "")
  )
  .replace(
    'import { snapshotDeliveryResult } from "./snapshot-delivery.js";\n',
    deliverySource.replaceAll("export ", "")
  );

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

async function runAction({ storedWindow, getError = null, updateError = null, syncGetError = null, sidePanel = false, contentScriptFailures = 0, contentResponse, scripting = false, cssError = null, scriptError = null, contentScripts = packagedContentScripts, settleMs = 0 }) {
  const windowUrl = "chrome-extension://test/polaris-home.html";
  const sourceTab = { id: 42, windowId: 9, active: true, url: "https://chatgpt.com/c/test" };
  const local = {
    "polaris-window-id": storedWindow?.id ?? null,
    "polaris-window-tab-id": storedWindow?.tabs?.[0]?.id ?? null,
    "polaris-source-window-id": sourceTab.windowId,
    "polaris-source-tab-id": sourceTab.id
  };
  const action = createEvent();
  const runtimeMessage = createEvent();
  const calls = { creates: [], updates: [], contentRequests: [], runtimeMessages: [], sidePanelBehaviors: [], cssInjections: [], scriptInjections: [], warnings: [] };
  let contentRequestAttempts = 0;
  const noOpEvent = () => createEvent();
  const chrome = {
    action: { onClicked: action },
    sidePanel: sidePanel ? {
      async setPanelBehavior(behavior) { calls.sidePanelBehaviors.push(behavior); }
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
  await new Promise((resolve) => setTimeout(resolve, settleMs));
  calls.command = (message) => new Promise((resolve) => runtimeMessage.emit(message, {}, resolve));
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

async function runWindowReady() {
  const windowUrl = "chrome-extension://test/polaris-home.html";
  const sourceTab = { id: 42, windowId: 7, active: false, url: "https://chatgpt.com/c/test" };
  const extensionTab = { id: 99, windowId: 7, active: true, url: windowUrl };
  const local = {
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
      async query(query) {
        if (query?.active) return [extensionTab];
        return [sourceTab, extensionTab];
      },
      async get(tabId) {
        return tabId === sourceTab.id ? sourceTab : extensionTab;
      },
      async sendMessage(tabId) { sends.push(tabId); },
      onActivated: noOpEvent(),
      onUpdated: noOpEvent(),
      onRemoved: noOpEvent()
    }
  };

  vm.runInNewContext(executableBackgroundSource, { chrome, URL, Number, Date, Promise, console });
  runtimeMessage.emit({
    type: "POLARIS_WINDOW_READY",
    windowId: extensionTab.windowId,
    windowTabId: extensionTab.id,
    windowType: "normal"
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return sends;
}

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

test("缓存 ID 指向普通窗口时，点击扩展图标会创建新的 Polaris popup", async () => {
  const calls = await runAction({
    storedWindow: {
      id: 9,
      type: "normal",
      focused: true,
      tabs: [{ id: 42, url: "https://chatgpt.com/c/test" }]
    }
  });

  assert.equal(calls.creates.length, 1);
  assert.equal(calls.creates[0].type, "popup");
  assert.equal(calls.updates.length, 0);
});

test("有效的 Polaris popup 会恢复为正常状态并聚焦，不会重复创建", async () => {
  const calls = await runAction({
    storedWindow: {
      id: 9,
      type: "popup",
      state: "minimized",
      focused: false,
      tabs: [{ id: 42, url: "chrome-extension://test/polaris-home.html" }]
    }
  });

  assert.equal(calls.creates.length, 0);
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0].id, 9);
  assert.equal(calls.updates[0].data.state, "normal");
  assert.equal(calls.updates[0].data.focused, true);
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

test("有效窗口在聚焦竞态失败后会清理并重建", async () => {
  const calls = await runAction({
    storedWindow: {
      id: 9,
      type: "popup",
      focused: true,
      tabs: [{ id: 42, url: "chrome-extension://test/polaris-home.html" }]
    },
    updateError: new Error("window closed")
  });

  assert.equal(calls.updates.length, 1);
  assert.equal(calls.creates.length, 1);
  assert.equal(calls.creates[0].type, "popup");
});

test("缓存窗口已关闭时会清理状态并创建新的 Polaris popup", async () => {
  const calls = await runAction({
    storedWindow: { id: 9, type: "popup", tabs: [{ id: 42, url: "chrome-extension://test/polaris-home.html" }] },
    getError: new Error("window closed")
  });

  assert.equal(calls.updates.length, 0);
  assert.equal(calls.creates.length, 1);
  assert.equal(calls.creates[0].type, "popup");
});

test("复用窗口后的状态请求失败不会重复创建 popup", async () => {
  const calls = await runAction({
    storedWindow: {
      id: 9,
      type: "popup",
      tabs: [{ id: 42, url: "chrome-extension://test/polaris-home.html" }]
    },
    syncGetError: new Error("temporary storage failure")
  });

  assert.equal(calls.updates.length, 1);
  assert.equal(calls.creates.length, 0);
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

test("直接打开普通浏览器标签中的插件页面时仍请求已生成会话", async () => {
  const sends = await runWindowReady();
  assert.deepEqual(sends, [42]);
});

test("系统 side panel 就绪时不会把宿主浏览器窗口登记为 Polaris popup", async () => {
  const { local, sends } = await runSidePanelReady();
  assert.equal(local["polaris-window-id"], undefined);
  assert.equal(local["polaris-window-tab-id"], undefined);
  assert.deepEqual(sends, [42]);
});
