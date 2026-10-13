import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { collectSidepanelChapters } from "../src/sidepanel-chapter-content.js";
import { buildWindowChapterOutline } from "../src/window-chapter-outline.js";
import { chapterTreeText } from "../src/sidepanel-chapter-state.js";

function extract(html) {
  const doc = new JSDOM(html, { url: "https://chatgpt.com/c/test" }).window.document;
  const containers = [...doc.querySelectorAll("article")];
  const headings = containers.flatMap((container, index) => [...container.querySelectorAll("[data-level]")].map((element) => ({
    element, markerKey: element.id, title: element.dataset.title || element.textContent,
    level: Number(element.dataset.level), isListItem: element.matches("li"), containerKey: `assistant-${index}`
  })));
  return collectSidepanelChapters(containers, buildWindowChapterOutline(headings), { fullTextTitle: "正文" });
}

test("tree ranges keep introduction, duplicate sentences and descendants exactly once", () => {
  const nodes = extract('<article><p>开场</p><h1 id="a" data-level="1">父章</h1><p>相同句子</p><h3 id="b" data-level="3">子章</h3><p>相同句子</p><h2 id="c" data-level="2">同级</h2><p>结尾</p></article>');
  assert.equal(chapterTreeText(nodes), "开场\n\n父章\n\n相同句子\n\n子章\n\n相同句子\n\n同级\n\n结尾");
  assert.equal(nodes.find((node) => node.markerKey === "a").contents.filter((part) => part.type === "block").length, 1);
  assert.equal(chapterTreeText(nodes, "b"), "子章\n\n相同句子");
});
test("list marker body preserves suffix and unmarked nested lists, following prose stays with parent", () => {
  const nodes = extract('<article><h1 id="a" data-level="1">父章</h1><ul><li id="b" data-level="3" data-title="优势"><strong>优势</strong>：纸笔<ul><li>内层一</li><li>内层二</li></ul></li><li>普通条目</li></ul><p>父章收尾</p></article>');
  const full = chapterTreeText(nodes);
  for (const value of ["优势", "纸笔", "内层一", "内层二", "普通条目", "父章收尾"]) assert.equal(full.split(value).length - 1, 1, value);
  assert.ok(!chapterTreeText(nodes, "b").includes("父章收尾"));
  assert.match(nodes.find((node) => node.markerKey === "b").contents[0].html, /<ul>/);
});
test("table marker retains entire table and code without mixing separate AI replies", () => {
  const nodes = extract('<article><h1 id="a" data-level="1">比较</h1><table id="t" data-level="2" data-title="维度 / A"><tr><th>维度</th><th>A</th></tr><tr><td>价格</td><td>20</td></tr></table><pre>if (a &lt; b) {\n  run();\n}</pre></article><article><p>无标题回答</p></article>');
  const table = nodes.find((node) => node.markerKey === "t");
  assert.match(table.contents[0].html, /<table/);
  assert.ok(!chapterTreeText(nodes, "t").includes("run()"));
  assert.match(chapterTreeText(nodes), /if \(a < b\) \{\n  run\(\);/);
  assert.equal(chapterTreeText(nodes).split("无标题回答").length - 1, 1);
});
test("duplicate titles in different replies remain separate and unsafe HTML is removed", () => {
  const nodes = extract('<article><h1 id="a" data-level="1">总结</h1><p>一<script>bad()</script><button>复制</button><a href="javascript:bad()">链接</a></p></article><article><h1 id="b" data-level="1">总结</h1><p>二</p></article>');
  assert.equal(chapterTreeText(nodes).split("总结").length - 1, 2);
  assert.ok(nodes.every((node) => !node.parentKey));
  assert.ok(!JSON.stringify(nodes).includes("javascript:"));
  assert.ok(!chapterTreeText(nodes).includes("bad()"));
  assert.ok(!chapterTreeText(nodes).includes("复制"));
});
test("list marker following a table is not incorrectly owned by the table", () => {
  const nodes = extract('<article><h1 id="a" data-level="1">父章</h1><table id="t" data-level="3" data-title="表格"><tr><td>值</td></tr></table><ul><li id="b" data-level="3" data-title="列表">列表：内容</li></ul><p>收尾</p></article>');
  assert.equal(nodes.find((node) => node.markerKey === "b").parentKey, "a");
  const full = chapterTreeText(nodes);
  assert.equal(full.split("收尾").length - 1, 1);
  assert.equal(full.split("列表").length - 1, 1);
});

test("ChatGPT chapters display the user prompt above an answer without headings", () => {
  const doc = new JSDOM('<main><article data-message-author-role="user">可以在模拟器里面安装系统相册么</article><article data-message-author-role="assistant"><p>可以，但要区分两件事：</p><p>iOS Simulator 本身就带系统照片 App。</p></article></main>').window.document;
  const nodes = collectSidepanelChapters([doc.querySelector('[data-message-author-role="assistant"]')], [], {
    userMessages: [{ element: doc.querySelector('[data-message-author-role="user"]'), markerKey: "user-1", title: "可以在模拟器里面安装系统相册么" }]
  });
  assert.equal(nodes[0].title, "可以在模拟器里面安装系统相册么");
  assert.equal(nodes[0].markerKey, "user-1");
  assert.equal(nodes[0].sourceKey, "user-1");
  assert.equal(nodes.length, 1);
  assert.equal(chapterTreeText(nodes), "可以在模拟器里面安装系统相册么\n\n可以，但要区分两件事：\n\niOS Simulator 本身就带系统照片 App。");
});

test("ChatGPT user chapters keep headings, repeated prompts and multiple answer bodies in their own turns", () => {
  const doc = new JSDOM('<main><div id="u1">继续说明</div><article><p>引言</p><h1 id="a">父章</h1><p>第一段</p><h2 id="b">子章</h2><p>子章正文</p></article><article><p>同轮补充</p></article><div id="u2">继续说明</div><article><h1 id="c">父章</h1><p>第二轮回答</p></article><div id="u3">尚未回答的问题</div></main>').window.document;
  const containers = [...doc.querySelectorAll("article")];
  const headings = containers.flatMap((container, index) => [...container.querySelectorAll("h1, h2")].map((element) => ({
    element, markerKey: element.id, title: element.textContent,
    level: Number(element.tagName.slice(1)), containerKey: `assistant-${index}`
  })));
  const userMessages = ["u3", "u2", "u1"].map((key) => ({ element: doc.getElementById(key), markerKey: key, title: doc.getElementById(key).textContent }));
  const nodes = collectSidepanelChapters(containers, buildWindowChapterOutline(headings), { userMessages });
  assert.deepEqual(nodes.filter((node) => !node.parentKey).map((node) => node.markerKey), ["u1", "u2", "u3"]);
  assert.equal(nodes.find((node) => node.markerKey === "a").parentKey, "u1");
  assert.equal(nodes.find((node) => node.markerKey === "b").parentKey, "a");
  assert.equal(nodes.find((node) => node.markerKey === "c").parentKey, "u2");
  assert.equal(chapterTreeText(nodes, "u1"), "继续说明\n\n引言\n\n父章\n\n第一段\n\n子章\n\n子章正文\n\n同轮补充");
  assert.equal(chapterTreeText(nodes, "u2"), "继续说明\n\n父章\n\n第二轮回答");
  assert.equal(chapterTreeText(nodes, "u3"), "尚未回答的问题");
});

test("answers before the first mounted ChatGPT user retain the fallback title", () => {
  const doc = new JSDOM('<main><article><p>较早回答</p></article><div id="u">当前问题</div><article><p>当前回答</p></article></main>').window.document;
  const nodes = collectSidepanelChapters([...doc.querySelectorAll("article")], [], {
    fullTextTitle: "全文", userMessages: [{ element: doc.getElementById("u"), markerKey: "u", title: "当前问题" }]
  });
  assert.deepEqual(nodes.map((node) => node.title), ["全文", "当前问题"]);
  assert.equal(chapterTreeText(nodes), "较早回答\n\n当前问题\n\n当前回答");
});
