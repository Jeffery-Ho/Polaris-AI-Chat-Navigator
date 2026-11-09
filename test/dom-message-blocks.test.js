import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { domMessageBlocks } from "../src/dom-message-blocks.js";

function read(html, options = {}) {
  const dom = new JSDOM(`<article>${html}</article>`, { url: "https://www.kimi.com/chat/example" });
  const element = dom.window.document.querySelector("article");
  const original = element.outerHTML;
  try {
    const result = domMessageBlocks(element, options);
    assert.equal(element.outerHTML, original, "读取过程不能修改原页面");
    return result;
  } finally {
    dom.window.close();
  }
}

const text = (value) => ({ type: "text", value });
const paragraph = (value) => ({ type: "paragraph", children: [text(value)] });

test("DOM 消息保留真实标题和行内格式，剔除角色、操作控件与输入框", () => {
  assert.deepEqual(read(`
    <h2 class="sr-only">You</h2><button>复制</button><div role="button">分享</div>
    <h1>总览</h1><div role="heading" aria-level="3">子标题</div>
    <div class="Heading-title-123">散列类标题</div>
    <p> <b>关键判断</b>：<i>继续</i>，<code>const x = 1</code> <s>旧结论</s>。
      <a href="/reference">来源</a><a href="javascript:alert(1)">危险链接正文</a></p>
    <textarea>输入内容</textarea><div contenteditable="true">草稿</div><script>bad()</script>
    <div hidden>隐藏内容</div><div aria-hidden="true">重复内容</div>`), [
    { type: "heading", level: 1, children: [text("总览")] },
    { type: "heading", level: 3, children: [text("子标题")] },
    { type: "heading", level: 2, children: [text("散列类标题")] },
    { type: "paragraph", children: [
      { type: "strong", children: [text("关键判断")] }, text("："),
      { type: "em", children: [text("继续")] }, text("，"),
      { type: "code", value: "const x = 1" }, text(" "),
      { type: "del", children: [text("旧结论")] }, text("。\n      "),
      { type: "link", href: "https://www.kimi.com/reference", children: [text("来源")] },
      text("危险链接正文")
    ] }
  ]);
});

test("DOM 消息保留列表层级、任务完成状态、表格、引文与原样代码", () => {
  assert.deepEqual(read(`<ul><li><p><strong>优先级</strong>：验证</p><ol><li>第一项</li></ol></li><li><input type="checkbox" checked>完成</li></ul>
    <table><thead><tr><th>项目</th><th><b>说明</b></th></tr></thead><tbody><tr><td>A</td><td>一<br>二</td></tr></tbody></table>
    <blockquote><p>引用</p><h2>引用内标题</h2></blockquote>
    <pre><code class="language-js">const html = '&lt;h2&gt;不是标题&lt;/h2&gt;';\n</code><button>复制</button></pre><hr>`), [
    { type: "list", ordered: false, items: [
      { inline: [{ type: "strong", children: [text("优先级")] }, text("：验证")], children: [
        { type: "list", ordered: true, items: [{ inline: [text("第一项")], children: [] }] }
      ] },
      { inline: [text("完成")], children: [], checked: true }
    ] },
    { type: "table", headers: [[text("项目")], [{ type: "strong", children: [text("说明")] }]], rows: [
      [[text("A")], [text("一"), { type: "break" }, text("二")]]
    ] },
    { type: "quote", blocks: [paragraph("引用"), { type: "heading", level: 2, children: [text("引用内标题")] }] },
    { type: "codeBlock", value: "const html = '<h2>不是标题</h2>';\n", language: "js" },
    { type: "rule" }
  ]);
});

test("用户正文选择器将问题与附件标签分开，附件操作按钮不混入正文", () => {
  assert.deepEqual(read(`<div class="custom-file"><span class="file-name">分析记录.md</span><span data-mime-type="text/markdown">MD 56 KB</span><button>下载</button><a href="/files/one" download="分析记录.md">打开</a></div>
    <div class="prompt">这是问题<br>这是第二行</div><div class="toolbar">Edit Copy Share</div>`, {
    role: "user", textSelector: ".prompt", attachmentSelector: ".custom-file"
  }), [
    { type: "attachment", name: "分析记录.md", mimeType: "text/markdown", url: "https://www.kimi.com/files/one" },
    { type: "paragraph", children: [text("这是问题"), { type: "break" }, text("这是第二行")] }
  ]);
});

test("附件卡片和文件名节点只提取一次，但相同文件名的两份文件都保留", () => {
  assert.deepEqual(read(`<div class="attachment"><span data-file-name="report.pdf"><span class="file-name">report.pdf</span></span><a href="/files/first" download="report.pdf">下载</a></div>
    <button class="file-card" data-file-name="report.pdf" data-mime-type="application/pdf"><span class="file-name">report.pdf</span></button>
    <a href="javascript:alert(1)" download="unsafe.txt">unsafe.txt</a>`), [
    { type: "attachment", name: "report.pdf", url: "https://www.kimi.com/files/first" },
    { type: "attachment", name: "report.pdf", mimeType: "application/pdf" },
    { type: "attachment", name: "unsafe.txt" }
  ]);
});

test("同一附件组中的多个文件按节点保留，不按名字或下载地址去重", () => {
  assert.deepEqual(read(`<div class="attachment"><span class="file-name">same.md</span><span class="file-name">same.md</span></div>`), [
    { type: "attachment", name: "same.md" },
    { type: "attachment", name: "same.md" }
  ]);
});

test("用户附件图片保留位置和缩略图来源，重复 URL 的不同图片节点不丢失", () => {
  assert.deepEqual(read(`<button aria-label="Open image"><img src="/uploads/photo.webp" alt="上传照片"></button>
    <div class="prompt">查看这两张图片</div><img src="/uploads/photo.webp" alt="同一图片再次上传"><div class="toolbar">复制</div>`, {
    role: "user", textSelector: ".prompt"
  }), [
    { type: "image", src: "https://www.kimi.com/uploads/photo.webp", alt: "上传照片", imageKey: "" },
    paragraph("查看这两张图片"),
    { type: "image", src: "https://www.kimi.com/uploads/photo.webp", alt: "同一图片再次上传", imageKey: "" }
  ]);
});

test("AI 回复图片保留行内顺序与安全来源，头像、矢量图标及像素追踪图被剔除", () => {
  assert.deepEqual(read(`<p>前文<img src="https://cdn.example.com/generated.png" alt="生成图">后文</p>
    <img src="data:image/png;base64,AA==" alt="内嵌图">
    <img src="blob:https://www.kimi.com/abc" alt="本页图">
    <div class="avatar"><img src="/avatar.png"></div><img src="/favicon.ico"><img src="/icon.svg"><img src="/track.png" width="1" height="1">
    <img src="blob:https://other.example.com/abc"><img src="http://example.com/insecure.png"><img src="javascript:alert(1)">
    <img src="data:image/svg+xml,%3Csvg%3E"><img data-src="/lazy.png" width="20" height="20" alt="正常小图">`), [
    { type: "paragraph", children: [text("前文"), { type: "image", src: "https://cdn.example.com/generated.png", alt: "生成图", imageKey: "" }, text("后文")] },
    { type: "image", src: "data:image/png;base64,AA==", alt: "内嵌图", imageKey: "" },
    { type: "image", src: "blob:https://www.kimi.com/abc", alt: "本页图", imageKey: "" },
    { type: "image", src: "https://www.kimi.com/lazy.png", alt: "正常小图", imageKey: "", width: 20, height: 20 }
  ]);
});

test("思考容器按 DOM 语义排除，正常正文中的 reasoning 与 thinking 单词保留", () => {
  assert.deepEqual(read(`<div class="thinking"><h2>隐藏思考标题</h2></div><div data-testid="reasoning-content"><p>推理过程</p><img src="/hidden.png"></div>
    <p>解释 thinking 和 reasoning 的区别。</p><section><p>正常内容</p></section>`), [
    paragraph("解释 thinking 和 reasoning 的区别。"), paragraph("正常内容")
  ]);
});

test("正文选择器缺失时不退回操作栏文本，但仍识别媒体", () => {
  assert.deepEqual(read('<div class="toolbar">Copy Edit</div><span data-file-name="notes.txt"></span><img src="/one.png">', { role: "user", textSelector: ".missing" }), [
    { type: "attachment", name: "notes.txt" },
    { type: "image", src: "https://www.kimi.com/one.png", alt: "", imageKey: "" }
  ]);
});

test("嵌在行内包装中的文件不会丢失，也不会把无 href 的锚点变为链接", () => {
  assert.deepEqual(read('<p>文件前文<span><a href="/files/one" download="one.md">下载</a></span>文件后文</p><p><a name="anchor">锚点文字</a></p>'), [
    paragraph("文件前文"),
    { type: "attachment", name: "one.md", url: "https://www.kimi.com/files/one" },
    paragraph("文件后文"), paragraph("锚点文字")
  ]);
});

test("媒体按钮只保留实际图片，不将按钮文字写入索引", () => {
  assert.deepEqual(read('<button aria-label="Preview image">预览<img src="/photo.png" alt="照片"></button><button><img src="/copy.png">复制</button>'), [
    { type: "image", src: "https://www.kimi.com/photo.png", alt: "照片", imageKey: "" }
  ]);
});

test("提取根位于被隐藏或思考容器内时整段排除", () => {
  const dom = new JSDOM('<div class="thinking"><div class="markdown"><h2>思考标题</h2><p>思考正文</p></div></div>', { url: "https://www.kimi.com/" });
  try { assert.deepEqual(domMessageBlocks(dom.window.document.querySelector(".markdown")), []); }
  finally { dom.window.close(); }
});

test("图片下载链接与图片文件卡片保留实际缩略图，不降为纯文件标签", () => {
  assert.deepEqual(read('<a href="/generated.png" download="生成图片.png"><img src="/generated.png"></a><div class="file-card" data-file-name="上传照片.jpg" data-mime-type="image/jpeg"><img src="/uploaded.jpg"><span class="file-name">上传照片.jpg</span></div>'), [
    { type: "image", src: "https://www.kimi.com/generated.png", alt: "生成图片.png", imageKey: "" },
    { type: "image", src: "https://www.kimi.com/uploaded.jpg", alt: "上传照片.jpg", imageKey: "" }
  ]);
});

test("Kimi 真实用户结构分开正文与文件名、MD 类型，并排除文件类型图标", () => {
  assert.deepEqual(read(`<div class="segment segment-user"><div class="file-attachment">
    <div><img src="/file-icons/md.png" alt="md"></div>
    <div class="file-card-info">分析高净值市场 (1)<div class="file-card-info-detail"><span class="file-ext">MD</span><span class="file-size">56.34 KB</span></div></div>
    </div><div class="user-content"><div class="user-content__text">这是我和其他ai的对话记录，你先确认最后三轮对话记录</div></div>
    <div class="toolbar">Edit Copy Share</div></div>`, { role: "user", textSelector: ".user-content__text" }), [
    { type: "attachment", name: "分析高净值市场 (1)", mimeType: "MD" },
    paragraph("这是我和其他ai的对话记录，你先确认最后三轮对话记录")
  ]);
});

test("Kimi 真实回复段落保留段首与行内加粗，只提取最终回答", () => {
  assert.deepEqual(read(`<div class="segment segment-assistant"><div class="thinking-container block-container"><div class="markdown"><div class="paragraph"><strong>思考中的标题</strong></div></div></div>
    <div class="markdown-container"><div class="markdown"><div class="paragraph"><strong>第一轮</strong></div>
    <ul><li><div class="paragraph"><strong>你问</strong>：动物救助市场如何？</div></li><li><div class="paragraph"><strong>对方答</strong>：真实需求，需要确认<strong>预算</strong>。</div></li></ul>
    <div class="paragraph">以上为确认结果。</div></div></div></div>`), [
    { type: "paragraph", children: [{ type: "strong", children: [text("第一轮")] }] },
    { type: "list", ordered: false, items: [
      { inline: [{ type: "strong", children: [text("你问")] }, text("：动物救助市场如何？")], children: [] },
      { inline: [{ type: "strong", children: [text("对方答")] }, text("：真实需求，需要确认"), { type: "strong", children: [text("预算")] }, text("。")], children: [] }
    ] },
    paragraph("以上为确认结果。")
  ]);
  const dom = new JSDOM('<div class="thinking-container block-container"><div class="markdown"><p>思考正文</p></div></div>', { url: "https://www.kimi.com/" });
  try { assert.deepEqual(domMessageBlocks(dom.window.document.querySelector(".markdown")), []); }
  finally { dom.window.close(); }
});

test("同轮 MD 文件旁的真正上传图片即使 alt 相同也不被当成类型图标", () => {
  assert.deepEqual(read('<div class="files"><div class="file-card-info">notes<div class="file-card-info-detail"><span class="file-ext">MD</span></div></div></div><div class="uploaded-images"><img src="/uploads/photo.png" alt="md"></div>', { role: "user", textSelector: ".prompt" }), [
    { type: "attachment", name: "notes", mimeType: "MD" },
    { type: "image", src: "https://www.kimi.com/uploads/photo.png", alt: "md", imageKey: "" }
  ]);
});
