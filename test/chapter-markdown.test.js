import test from "node:test";
import assert from "node:assert/strict";

import {
  appendSanitizedChapterNode,
  chapterContentTagName,
  isChapterBlockTag,
  parseChapterMarkdown,
  parseMarkdownTable,
  safeChapterImageSrc,
  safeChapterLinkHref,
  shouldDiscardChapterNode
} from "../src/chapter-markdown.js";

class FakeNode {
  constructor(tagName, attributes = {}, childNodes = []) {
    this.nodeType = tagName === "#text" ? 3 : 1;
    this.tagName = tagName === "#text" ? "" : tagName.toUpperCase();
    this.textContent = tagName === "#text" ? attributes.text || "" : "";
    this.attributes = attributes;
    this.childNodes = childNodes;
    this.parentNode = null;
    this.listeners = new Map();
    childNodes.forEach((child) => {
      child.parentNode = this;
    });
  }

  appendChild(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  hasAttribute(name) {
    return Object.hasOwn(this.attributes, name);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  remove() {
    if (!this.parentNode) {
      return;
    }
    this.parentNode.childNodes = this.parentNode.childNodes.filter((child) => child !== this);
    this.parentNode = null;
  }

  querySelector(selector) {
    const isTaskCheckbox = selector === 'input[type="checkbox"]';
    const isImage = selector === "img";
    for (const child of this.childNodes) {
      if (child.nodeType !== 1) {
        continue;
      }
      if ((isTaskCheckbox && child.tagName === "INPUT" && child.getAttribute("type") === "checkbox") || (isImage && child.tagName === "IMG")) {
        return child;
      }
      const nested = child.querySelector(selector);
      if (nested) {
        return nested;
      }
    }
    return null;
  }
}

const fakeDocument = {
  createElement(tagName) {
    return new FakeNode(tagName);
  },
  createTextNode(text) {
    return new FakeNode("#text", { text });
  }
};

function element(tagName, attributes, childNodes) {
  return new FakeNode(tagName, attributes, childNodes);
}

function text(value) {
  return new FakeNode("#text", { text: value });
}

test("白名单保留 Markdown 标题、复杂表格、列表和图片节点", () => {
  assert.equal(chapterContentTagName("h3"), "h3");
  assert.equal(chapterContentTagName("table"), "table");
  assert.equal(chapterContentTagName("tbody"), "tbody");
  assert.equal(chapterContentTagName("li"), "li");
  assert.equal(chapterContentTagName("input"), "input");
  assert.equal(chapterContentTagName("img"), "img");
  assert.equal(isChapterBlockTag("blockquote"), true);
  assert.equal(isChapterBlockTag("figure"), true);
});

test("白名单归一化强调和删除线，并排除可执行或嵌入节点", () => {
  assert.equal(chapterContentTagName("b"), "strong");
  assert.equal(chapterContentTagName("i"), "em");
  assert.equal(chapterContentTagName("strike"), "del");
  assert.equal(chapterContentTagName("script"), "");
  assert.equal(chapterContentTagName("style"), "");
  assert.equal(chapterContentTagName("iframe"), "");
  assert.equal(shouldDiscardChapterNode("script"), true);
  assert.equal(shouldDiscardChapterNode("style"), true);
  assert.equal(shouldDiscardChapterNode("iframe"), true);
});

test("链接仅允许网页和邮件协议，图片仅允许网页协议", () => {
  const baseUrl = "https://chatgpt.com/c/example";
  assert.equal(safeChapterLinkHref("/share/example", baseUrl), "https://chatgpt.com/share/example");
  assert.equal(safeChapterLinkHref("mailto:feedback@example.com", baseUrl), "mailto:feedback@example.com");
  assert.equal(safeChapterLinkHref("javascript:alert(1)", baseUrl), "");
  assert.equal(safeChapterLinkHref("data:text/html,unsafe", baseUrl), "");
  assert.equal(safeChapterImageSrc("/images/example.png", baseUrl), "https://chatgpt.com/images/example.png");
  assert.equal(safeChapterImageSrc("data:image/png;base64,unsafe", baseUrl), "");
  assert.equal(safeChapterImageSrc("javascript:alert(1)", baseUrl), "");
});

test("解析列数一致的原始 Markdown 管道表格", () => {
  const table = parseMarkdownTable(`| 优先级验证项验证目标 |            |                          |
| ---------- | ---------- | ------------------------ |
| P0         | 发射与供球可靠性   | 球速、旋转、落点稳定；连续发球不卡球       |
| P2         | 接球、回球、自动捡球 | 作为后续产品路线，不进入首代范围         |`);

  assert.deepEqual(table, {
    headers: ["优先级验证项验证目标", "", ""],
    rows: [
      ["P0", "发射与供球可靠性", "球速、旋转、落点稳定；连续发球不卡球"],
      ["P2", "接球、回球、自动捡球", "作为后续产品路线，不进入首代范围"]
    ]
  });
});

test("保留转义竖线并拒绝不完整的原始 Markdown 表格", () => {
  assert.deepEqual(
    parseMarkdownTable("| 名称 | 备注 |\n| --- | --- |\n| A\\|B | 可用 |"),
    { headers: ["名称", "备注"], rows: [["A|B", "可用"]] }
  );
  assert.equal(parseMarkdownTable("| 名称 | 备注 |\n| --- | --- |\n| 只有一列 |"), null);
  assert.equal(parseMarkdownTable("普通文本\n| --- | --- |"), null);
});

test("解析原始 Markdown 的混排行内格式并保留 Emoji 与 Unicode", () => {
  const blocks = parseChapterMarkdown("# 训练计划 🎯\n\n🎯 **P0**：~~旧项~~、`70%`，详见 [说明](https://example.com/plan)。");

  assert.deepEqual(blocks, [
    {
      type: "heading",
      level: 1,
      children: [{ type: "text", value: "训练计划 🎯" }]
    },
    {
      type: "paragraph",
      children: [
        { type: "text", value: "🎯 " },
        { type: "strong", children: [{ type: "text", value: "P0" }] },
        { type: "text", value: "：" },
        { type: "del", children: [{ type: "text", value: "旧项" }] },
        { type: "text", value: "、" },
        { type: "code", value: "70%" },
        { type: "text", value: "，详见 " },
        { type: "link", href: "https://example.com/plan", children: [{ type: "text", value: "说明" }] },
        { type: "text", value: "。" }
      ]
    }
  ]);
});

test("解析嵌套任务列表、引用、代码块和带混排单元格的原始表格", () => {
  const blocks = parseChapterMarkdown(`- [x] 🎯 已完成
  1. 子项 *强调*
  2. [ ] 待办

> 引用 ~~旧内容~~

\`\`\`js
const emoji = "🎯";
\`\`\`

| 优先级 | 验证目标 |
| --- | --- |
| **P0** | ~~旧项~~ 与 \`70%\` |`);

  assert.equal(blocks[0].type, "list");
  assert.equal(blocks[0].items[0].checked, true);
  assert.equal(blocks[0].items[0].children[0].ordered, true);
  assert.equal(blocks[0].items[0].children[0].items[0].inline[1].type, "em");
  assert.equal(blocks[0].items[0].children[0].items[1].checked, false);
  assert.equal(blocks[1].type, "quote");
  assert.equal(blocks[2].type, "codeBlock");
  assert.equal(blocks[2].value, "const emoji = \"🎯\";");
  assert.equal(blocks[3].type, "table");
  assert.equal(blocks[3].rows[0][0][0].type, "strong");
  assert.equal(blocks[3].rows[0][1][0].type, "del");
  assert.equal(blocks[3].rows[0][1][2].type, "code");
});

test("图片进入 AST，HTML 与未闭合 Markdown 保持普通文本", () => {
  assert.deepEqual(parseChapterMarkdown("![示例](https://example.com/image.png)"), [{ type: "paragraph", children: [{ type: "image", src: "https://example.com/image.png", alt: "示例" }] }]);
  assert.equal(parseChapterMarkdown("<script>alert(1)</script>"), null);
  assert.equal(parseChapterMarkdown("未闭合 **强调"), null);
  assert.equal(parseChapterMarkdown("链接 [说明](javascript:alert(1))"), null);
});

test("安全重建嵌套任务列表、代码、引用、删除线和复杂表格", () => {
  const source = element("div", {}, [
    element("blockquote", {}, [element("p", {}, [text("引用 "), element("del", {}, [text("旧内容")])])]),
    element("ul", {}, [
      element("li", {}, [
        element("input", { type: "checkbox", checked: "" }),
        text("任务"),
        element("ul", {}, [element("li", {}, [element("code", {}, [text("嵌套代码")])])])
      ])
    ]),
    element("table", {}, [
      element("thead", {}, [element("tr", {}, [element("th", { colspan: "2" }, [text("表头")])])]),
      element("tbody", {}, [element("tr", {}, [element("td", { rowspan: "2" }, [text("单元格")])])])
    ])
  ]);
  const target = element("div", {}, []);

  appendSanitizedChapterNode(target, source, fakeDocument, "https://chatgpt.com/c/example");

  const [quote, list, table] = target.childNodes;
  assert.equal(quote.tagName, "BLOCKQUOTE");
  assert.equal(quote.childNodes[0].childNodes[1].tagName, "DEL");
  assert.equal(list.childNodes[0].className, "gpt-paragraph-nav__explosion-task-item");
  assert.equal(list.childNodes[0].childNodes[0].disabled, true);
  assert.equal(list.childNodes[0].childNodes[2].childNodes[0].childNodes[0].tagName, "CODE");
  assert.equal(table.childNodes[0].childNodes[0].childNodes[0].colSpan, 2);
  assert.equal(table.childNodes[1].childNodes[0].childNodes[0].rowSpan, 2);
});

test("重建图片并在加载失败时移除预览，禁止节点不泄露文本", () => {
  const target = element("div", {}, []);
  appendSanitizedChapterNode(target, element("img", { src: "/image.png", alt: "示例图" }), fakeDocument, "https://chatgpt.com/c/example");
  appendSanitizedChapterNode(target, element("script", {}, [text("unsafe()")]), fakeDocument, "https://chatgpt.com/c/example");
  appendSanitizedChapterNode(target, element("style", {}, [text("body { display: none; }")]), fakeDocument, "https://chatgpt.com/c/example");
  appendSanitizedChapterNode(target, element("iframe", {}, [text("embedded")]), fakeDocument, "https://chatgpt.com/c/example");

  const imageLink = target.childNodes[0];
  const image = imageLink.childNodes[0];
  assert.equal(imageLink.tagName, "A");
  assert.equal(imageLink.href, "https://chatgpt.com/image.png");
  assert.equal(image.alt, "示例图");
  assert.deepEqual(target.childNodes, [imageLink]);
  image.listeners.get("error")();
  assert.equal(target.childNodes.length, 0);
});
