import test from "node:test";
import assert from "node:assert/strict";

import { createDiagnosticLog } from "../src/diagnostic-log.js";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
    read(key) {
      return values.get(key);
    }
  };
}

test("诊断日志只保留白名单字段并移除正文、标题、URL 与账号信息", () => {
  const log = createDiagnosticLog({ storage: createStorage() });
  log.record("drag_end", {
    kind: "list",
    reason: "blur",
    title: "不要保存",
    text: "不要保存",
    url: "https://example.com/private",
    email: "user@example.com",
    prompt: "不要保存",
    didDrag: true
  });

  const snapshot = log.snapshot({
    version: "0.49.1(199)",
    viewportWidth: 320,
    viewportHeight: 640,
    dpr: 2,
    title: "不要保存",
    href: "https://example.com/private"
  });
  const serialized = JSON.stringify(snapshot);

  assert.equal(snapshot.events.length, 1);
  assert.equal(snapshot.events[0].kind, "list");
  assert.equal(snapshot.events[0].didDrag, true);
  assert.doesNotMatch(serialized, /不要保存|example\.com|user@example\.com/);
  assert.equal(snapshot.context.version, "0.49.1(199)");
  assert.equal(snapshot.context.viewportWidth, 320);
  assert.equal(snapshot.context.dpr, undefined);
});

test("诊断日志按事件数和序列化大小限制，并可从当前标签页会话恢复", () => {
  const storage = createStorage();
  const log = createDiagnosticLog({ storage, maxEvents: 2, maxCharacters: 600 });
  log.record("first", { reason: "one" });
  log.record("second", { reason: "two" });
  log.record("third", { reason: "three" });

  const snapshot = log.snapshot();
  assert.ok(snapshot.events.length <= 2);
  assert.ok(JSON.stringify(snapshot.events).length <= 600);

  const restored = createDiagnosticLog({ storage, maxEvents: 2, maxCharacters: 600 });
  assert.deepEqual(restored.snapshot().events, snapshot.events);

  log.clear();
  assert.equal(createDiagnosticLog({ storage }).snapshot().events.length, 0);
});

test("诊断日志序列化始终输出有效 JSON", () => {
  const log = createDiagnosticLog({ storage: createStorage() });
  log.record("error", { errorName: "TypeError", stack: "secret stack" });
  const parsed = JSON.parse(log.serialize({ platform: "chatgpt" }));
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.context.platform, "chatgpt");
  assert.equal(parsed.events[0].errorName, "TypeError");
  assert.equal(parsed.events[0].stack, undefined);
});

test("分享读取诊断保留响应阶段、状态码与固定格式，不保留响应正文或凭证", () => {
  const log = createDiagnosticLog({ storage: createStorage() });
  log.record("conversation_read", { kind: "shared-data", stage: "shared-loader", httpStatus: 202, responseFormat: "script", body: "private", accessToken: "private" });
  assert.deepEqual(Object.fromEntries(Object.entries(log.snapshot().events[0]).filter(([key]) => !["timestamp", "type"].includes(key))),
    { kind: "shared-data", stage: "shared-loader", httpStatus: 202, responseFormat: "script" });
});
