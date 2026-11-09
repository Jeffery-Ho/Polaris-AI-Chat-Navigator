import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { domMessageBlocks } from "../src/dom-message-blocks.js";
import { createDOMConversationSource } from "../src/dom-conversation-source.js";
import { createDOMIndexController } from "../src/dom-index-controller.js";

const name = "分析高净值市场 (1).md";
const prompt = "This file contains my conversation. Recap the last three exchanges.";
// Structural cases from the reported cards; avoid depending on generated classes.
const cards = {
  qianwen: `<div class="native-file"><svg></svg><div><div>${name}</div><div>56KB</div></div></div>`,
  deepseek: `<div class="native-file"><svg></svg><div><div>${name}</div><div>MD 56.34KB</div></div></div>`,
  doubao: `<div class="native-file" role="button"><svg></svg><div><span title="${name}">分析高净值市场 (1)...</span><div>Markdown</div></div></div>`,
  grok: `<div class="native-file"><svg></svg><span>${name}</span></div>`
};

for (const [platform, card] of Object.entries(cards)) {
  test(`${platform} 文件标签只保留文件名，正文和原生定位仍可用`, async () => {
    const dom = new JSDOM(`<article class="user">${card}<div class="ds-collapsible-text">${prompt}</div></article>`, { url: `https://${platform}.test/chat/one` });
    const element = dom.window.document.querySelector(".user");
    const original = element.outerHTML;
    const read = createDOMConversationSource({ window: dom.window, platform, readContainers: () => ({ userContainers: [element] }) });
    const controller = createDOMIndexController({ window: dom.window, platform, readMessages: read });
    try {
      const message = read().messages[0];
      assert.deepEqual(message.blocks, [
        { type: "attachment", name },
        { type: "paragraph", children: [{ type: "text", value: prompt }] }
      ]);
      controller.configure(true); await controller.syncMounted();
      const user = controller.outline().items.find((item) => item.type === "user");
      assert.equal(user.title, prompt);
      assert.deepEqual(user.attachments.map((file) => file.name), [name]);
      const target = controller.resolveTarget(`index:${message.id}:attachment:0`);
      assert.ok(target && element.querySelector(".native-file").contains(target), "附件标签定位回自己的卡片");
      assert.equal(element.outerHTML, original, "读取不能修改原页面");
    } finally { controller.dispose(); dom.window.close(); }
  });
}

test("同名附件保留各自顺序，文件大小和格式不进入标签", async () => {
  const dom = new JSDOM(`<article>${cards.deepseek}${cards.deepseek}<p>${prompt}</p></article>`, { url: "https://deepseek.test/chat/one" });
  const element = dom.window.document.querySelector("article");
  const read = createDOMConversationSource({ window: dom.window, platform: "deepseek", readContainers: () => ({ userContainers: [element] }) });
  const controller = createDOMIndexController({ window: dom.window, platform: "deepseek", readMessages: read });
  try {
    controller.configure(true); await controller.syncMounted();
    const message = read().messages[0];
    assert.deepEqual(message.blocks.filter((block) => block.type === "attachment").map((file) => file.name), [name, name]);
    const targets = [0, 1].map((ordinal) => controller.resolveTarget(`index:${message.id}:attachment:${ordinal}`));
    assert.ok(targets.every(Boolean));
    assert.notEqual(targets[0], targets[1]);
  } finally { controller.dispose(); dom.window.close(); }
});

test("提到文件和大小的普通正文、隐藏卡片、操作按钮不被误识别为附件", () => {
  const dom = new JSDOM(`<article><p>report.md 是文件名，大小 56KB。</p><p>Markdown</p><p>请比较 notes.txt 和 report.pdf</p><button><svg></svg>下载 report.md</button><div hidden>${cards.deepseek}</div></article>`, { url: "https://grok.com/c/one" });
  try {
    const blocks = domMessageBlocks(dom.window.document.querySelector("article"), { role: "user" });
    assert.deepEqual(blocks.map((block) => block.type), ["paragraph", "paragraph", "paragraph"]);
  } finally { dom.window.close(); }
});

test("普通回复里的文件名和类型不转换为上传附件", () => {
  const dom = new JSDOM(`<article><div><div>report.md</div><div>Markdown</div></div></article>`);
  try {
    assert.equal(domMessageBlocks(dom.window.document.querySelector("article")).some((block) => block.type === "attachment"), false);
  } finally { dom.window.close(); }
});

test("正文单独列出文件名、大小和格式时仍保留为正文", () => {
  const dom = new JSDOM('<article><p>report.md</p><p>56KB</p><p>Markdown</p></article>');
  try {
    assert.deepEqual(domMessageBlocks(dom.window.document.querySelector("article"), { role: "user" }).map((block) => block.type), ["paragraph", "paragraph", "paragraph"]);
  } finally { dom.window.close(); }
});

test("文件名中的大小字样保留，只有独立元数据节点被剔除", () => {
  const dom = new JSDOM('<article><div><svg></svg><div><div>report 56KB.md</div><div><span>MD</span><span>2.5 MB</span></div></div></div><p>分析文件</p></article>');
  try {
    const blocks = domMessageBlocks(dom.window.document.querySelector("article"), { role: "user" });
    assert.equal(blocks[0].name, "report 56KB.md");
    assert.equal(blocks[1].children[0].value, "分析文件");
  } finally { dom.window.close(); }
});
