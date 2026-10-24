import { appendParsedMarkdownInline } from "./chapter-markdown.js";

export function appendIndexedChapterBlock(target, block, doc) {
  function append(parent, value) {
    const tags = { paragraph: "p", heading: `h${Math.min(6, Math.max(1, value.level || 2))}`, quote: "blockquote", rule: "hr", codeBlock: "pre", list: value.ordered ? "ol" : "ul", table: "table" };
    const node = doc.createElement(tags[value.type] || "p");
    if (value.type === "codeBlock") { const code = doc.createElement("code"); code.textContent = value.value || ""; node.append(code); }
    else if (value.type === "quote") (value.blocks || []).forEach((child) => append(node, child));
    else if (value.type === "list") for (const item of value.items || []) {
      const li = doc.createElement("li");
      appendParsedMarkdownInline(li, item.inline || [], doc, doc.baseURI);
      (item.children || []).forEach((child) => append(li, child)); node.append(li);
    }
    else if (value.type === "table") {
      const rows = [value.headers, ...(value.rows || [])];
      rows.forEach((row, index) => {
        const tr = doc.createElement("tr");
        (row || []).forEach((cell) => { const td = doc.createElement(index === 0 ? "th" : "td"); appendParsedMarkdownInline(td, cell, doc, doc.baseURI); tr.append(td); });
        node.append(tr);
      });
    } else appendParsedMarkdownInline(node, value.children || [], doc, doc.baseURI);
    parent.append(node);
  }
  append(target, block);
}
