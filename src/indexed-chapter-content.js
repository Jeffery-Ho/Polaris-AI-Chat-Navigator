import { appendParsedMarkdownInline, safeChapterUrl } from "./chapter-markdown.js";

export function appendIndexedChapterBlock(target, block, doc, appendImage) {
  function append(parent, value) {
    if (value.type === "image") { appendParsedMarkdownInline(parent, [value], doc, doc.baseURI, appendImage); return; }
    if (value.type === "attachment") {
      const node = doc.createElement("p"); node.className = "chapter-attachment";
      const href = typeof value.url === "string" && value.url.trim() ? safeChapterUrl(value.url, doc.baseURI, ["http:", "https:"]) : "";
      const label = doc.createElement(href ? "a" : "span"); label.textContent = value.name;
      if (href) { label.href = href; label.target = "_blank"; label.rel = "noopener noreferrer"; }
      node.append(label);
      if (value.mimeType) { const type = doc.createElement("small"); type.textContent = ` · ${value.mimeType}`; node.append(type); }
      parent.append(node); return;
    }
    const tags = { paragraph: "p", heading: `h${Math.min(6, Math.max(1, value.level || 2))}`, quote: "blockquote", rule: "hr", codeBlock: "pre", list: value.ordered ? "ol" : "ul", table: "table" };
    const node = doc.createElement(tags[value.type] || "p");
    if (value.type === "codeBlock") { const code = doc.createElement("code"); code.textContent = value.value || ""; if (/^[a-zA-Z0-9_+-]+$/.test(value.language || "")) code.className = `language-${value.language}`; node.append(code); }
    else if (value.type === "quote") (value.blocks || []).forEach((child) => append(node, child));
    else if (value.type === "list") for (const item of value.items || []) {
      const li = doc.createElement("li");
      appendParsedMarkdownInline(li, item.inline || [], doc, doc.baseURI, appendImage);
      (item.children || []).forEach((child) => append(li, child)); node.append(li);
    }
    else if (value.type === "table") {
      const rows = [value.headers, ...(value.rows || [])];
      rows.forEach((row, index) => {
        const tr = doc.createElement("tr");
        (row || []).forEach((cell) => { const td = doc.createElement(index === 0 ? "th" : "td"); appendParsedMarkdownInline(td, cell, doc, doc.baseURI, appendImage); tr.append(td); });
        node.append(tr);
      });
    } else appendParsedMarkdownInline(node, value.children || [], doc, doc.baseURI, appendImage);
    parent.append(node);
  }
  append(target, block);
}
