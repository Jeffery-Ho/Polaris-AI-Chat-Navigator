import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { createDOMConversationSource } from "../src/dom-conversation-source.js";
import { createDOMIndexController } from "../src/dom-index-controller.js";

const content = readFileSync(new URL("../src/content.js", import.meta.url), "utf8");
const selector = content.match(/const CLAUDE_USER_MESSAGE_SELECTOR = '([^']+)'/)[1];
const name = "分析高净值市场 (1).md";
const prompt = "确认最后三轮对话";

for (const [kind, card] of [
  ["文件名卡片", `<div class="file-card"><span class="file-name">${name}</span></div>`],
  ["通过可访问名称提供扩展名的文件按钮", `<div><button aria-label="${name}"><span>分析高净值市场 (1)</span></button><span>MD</span></div>`],
  ["带文件名子节点的文件按钮", `<button aria-label="${name}"><span class="file-name">分析高净值市场 (1)</span><span>MD</span></button>`],
  ["实页 MessageAttachmentsFile 卡片", `<div data-cds="MessageAttachments"><div data-cds="MessageAttachmentsFile" data-testid="file-thumbnail"><div data-cds="Card"><span data-cds="CardLink" role="button" title="${name}"><span class="sr-only">${name}</span></span><div><span title="${name}"><bdi>${name}</bdi></span><span data-cds="Badge"><span><bdi>MD</bdi></span></span></div></div></div></div>`]
]) {
  for (const fileOnly of [false, true]) {
    test(`Claude ${kind}${fileOnly ? "仅有附件" : "位于正文旁"}时保留标签与原卡片定位`, async () => {
      const dom = new JSDOM(`<div data-cds="UserMessage"><h2 class="sr-only">You said</h2>${card}${fileOnly ? "" : `<div data-testid="user-message"><p>${prompt}</p></div>`}<div role="toolbar"><span>2 hours ago</span><button>Copy</button><button>Edit</button></div></div>`, { url: "https://claude.ai/chat/one" });
      const doc = dom.window.document;
      const original = doc.body.innerHTML;
      const read = createDOMConversationSource({ window: dom.window, platform: "claude", readContainers: () => ({ userContainers: [...doc.querySelectorAll(selector)] }) });
      const controller = createDOMIndexController({ window: dom.window, platform: "claude", readMessages: read });
      try {
        const message = read().messages[0];
        assert.ok(message, "只含附件的用户消息也要进入索引");
        assert.deepEqual(message.blocks.filter((block) => block.type === "attachment").map((block) => block.name), [name]);
        controller.configure(true); await controller.syncMounted();
        const user = controller.outline().items.find((item) => item.type === "user");
        assert.equal(user.title, fileOnly ? name : prompt);
        assert.deepEqual(user.attachments.map((file) => file.name), [name]);
        const target = controller.resolveTarget(`index:${message.id}:attachment:0`);
        assert.ok(target && doc.querySelector('.file-card, button[aria-label], [data-cds="MessageAttachmentsFile"]').contains(target), "标签定位回本轮附件卡片");
        assert.equal(target.closest('[role="toolbar"]'), null);
        assert.equal(doc.body.innerHTML, original);
      } finally { controller.dispose(); dom.window.close(); }
    });
  }
}

test("Claude 的附件顺序与同名卡片定位独立，操作按钮不能占用附件序号", async () => {
  const card = `<button aria-label="${name}"><span>分析高净值市场 (1)</span></button>`;
  const dom = new JSDOM(`<div data-cds="UserMessage"><button aria-label="Open report.md">Open</button>${card}${card}<div data-testid="user-message">${prompt}</div></div>`, { url: "https://claude.ai/chat/one" });
  const doc = dom.window.document;
  const read = createDOMConversationSource({ window: dom.window, platform: "claude", readContainers: () => ({ userContainers: [...doc.querySelectorAll(selector)] }) });
  const controller = createDOMIndexController({ window: dom.window, platform: "claude", readMessages: read });
  try {
    controller.configure(true); await controller.syncMounted();
    const message = read().messages[0];
    assert.deepEqual(message.blocks.filter((block) => block.type === "attachment").map((block) => block.name), [name, name]);
    const targets = [0, 1].map((ordinal) => controller.resolveTarget(`index:${message.id}:attachment:${ordinal}`));
    assert.deepEqual(targets, [...doc.querySelectorAll(`button[aria-label="${name}"]`)]);
  } finally { controller.dispose(); dom.window.close(); }
});
