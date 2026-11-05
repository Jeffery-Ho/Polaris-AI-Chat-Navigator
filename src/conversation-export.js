import { appendSanitizedChapterContent, parseChapterMarkdown } from "./chapter-markdown.js";
import { appendIndexedChapterBlock } from "./indexed-chapter-content.js";
import { chapterFragmentText } from "./sidepanel-chapter-content.js";

// Export source messages, independently of the recognized chapter tree.
export function collectDOMConversation({ document: doc, containers, users, title, url }) {
  const entries = [
    ...containers.map((element) => ({ element, role: "assistant" })),
    ...users.map((user) => ({ element: user.element, role: "user" }))
  ].sort((a, b) => a.element === b.element ? 0 : a.element.compareDocumentPosition(b.element) & 4 ? -1 : 1);
  const messages = entries.map(({ element, role }) => {
    const source = element.cloneNode(true);
    source.querySelectorAll('button, [role="button"], [hidden], [aria-hidden="true"], script, style').forEach((node) => node.remove());
    const safe = doc.createElement("div");
    appendSanitizedChapterContent(safe, source, doc, url);
    return { role, html: safe.innerHTML, text: chapterFragmentText(safe).trim() };
  }).filter((message) => message.text);
  return { title, url, scope: "loaded", messages };
}

function markdownNode(node) {
  if (node.nodeType === 3) return node.textContent.replace(/([\\`*_\[\]<>])/g, "\\$1");
  if (node.nodeType !== 1) return "";
  const tag = node.tagName.toLowerCase();
  const children = () => [...node.childNodes].map(markdownNode).join("");
  const block = (value) => `\n\n${value.trim()}\n\n`;
  if (/^h[1-6]$/.test(tag)) return block(`${"#".repeat(Number(tag[1]))} ${children()}`);
  if (tag === "br") return "  \n";
  if (tag === "hr") return block("---");
  if (tag === "strong") return `**${children()}**`;
  if (tag === "em") return `*${children()}*`;
  if (tag === "del") return `~~${children()}~~`;
  if (tag === "a") return `[${children()}](<${node.getAttribute("href")}>)`;
  if (tag === "img") return `[${node.getAttribute("alt") || "Image"}]`;
  if (tag === "input") return node.hasAttribute("checked") ? "[x] " : "[ ] ";
  if (tag === "pre") {
    const code = node.textContent;
    const runs = code.match(/`+/g) || [];
    const fence = "`".repeat(Math.max(3, ...runs.map((run) => run.length + 1)));
    const language = node.querySelector("code")?.className.match(/(?:^|\s)language-([a-zA-Z0-9_+-]+)(?:\s|$)/)?.[1] || "";
    return block(`${fence}${language}\n${code}\n${fence}`);
  }
  if (tag === "code") {
    const fence = "`".repeat(Math.max(1, ...(node.textContent.match(/`+/g) || []).map((run) => run.length + 1)));
    return `${fence} ${node.textContent} ${fence}`;
  }
  if (tag === "blockquote") return block(children().trim().split("\n").map((line) => `> ${line}`).join("\n"));
  if (tag === "ul" || tag === "ol") {
    return block([...node.children].map((li, index) => {
      const content = markdownNode(li).trim().replace(/\n/g, "\n    ");
      return `${tag === "ol" ? `${index + 1}.` : "-"} ${content}`;
    }).join("\n"));
  }
  if (tag === "table") {
    const rows = [...node.querySelectorAll("tr")].map((row) => [...row.children].map((cell) => markdownNode(cell).trim().replace(/\|/g, "\\|").replace(/\n+/g, "<br>")));
    if (!rows.length) return "";
    const width = Math.max(...rows.map((row) => row.length));
    const line = (row) => `| ${Array.from({ length: width }, (_, i) => row[i] || "").join(" | ")} |`;
    return block([line(rows[0]), line(Array(width).fill("---")), ...rows.slice(1).map(line)].join("\n"));
  }
  return ["p", "div", "figure"].includes(tag) ? block(children()) : children();
}

export function buildConversationExport({ document: doc, conversation, locale = "en", appName = "" }) {
  const title = String(conversation.title || "Polaris conversation");
  const main = doc.createElement("main");
  const heading = doc.createElement("h1"); heading.textContent = title; main.append(heading);
  const markdown = [`# ${markdownNode(doc.createTextNode(title.replace(/[\r\n]+/g, " ")))}`];
  const text = [];
  for (const message of conversation.messages || []) {
    const role = message.role === "user" ? (locale === "zh" ? "用户" : "User") : (locale === "zh" ? "AI 回复" : "Assistant");
    const section = doc.createElement("section");
    const label = doc.createElement("h2"); label.textContent = role; section.append(label);
    const content = doc.createElement("div");
    const image = (target, value) => {
      const placeholder = doc.createElement("span");
      placeholder.textContent = `[${value.alt || "Image"}]`; target.append(placeholder);
    };
    if (typeof message.html === "string") {
      const source = doc.createElement("template"); source.innerHTML = message.html;
      appendSanitizedChapterContent(content, source.content, doc, conversation.url, image);
    } else {
      const blocks = message.blocks || parseChapterMarkdown(message.markdown || message.text || "")
        || [{ type: "paragraph", children: [{ type: "text", value: message.markdown || message.text || "" }] }];
      blocks.forEach((block) => appendIndexedChapterBlock(content, block, doc, image));
    }
    section.append(content); main.append(section);
    const body = [...content.childNodes].map(markdownNode).join("").trim();
    markdown.push(`## ${role}\n\n${body}`);
    text.push(`${role}\n\n${message.text || chapterFragmentText(content).trim()}`);
  }
  const footer = doc.createElement("footer");
  if (appName) {
    const name = String(appName).replace(/[\r\n]+/g, " ");
    const privacyNote = locale === "zh" ? "不上传会话内容" : "No conversation content is uploaded";
    footer.textContent = `${locale === "zh" ? `由 ${name} 本地导出` : `Exported locally by ${name}`} · ${privacyNote}`;
    const markdownName = name.replace(/([\\`*_\[\]<>])/g, "\\$1");
    markdown.push(`---\n\n${locale === "zh" ? `由 ${markdownName} 本地导出` : `Exported locally by ${markdownName}`} · ${privacyNote}`);
  }
  const htmlTitle = doc.createElement("title"); htmlTitle.textContent = title;
  const css = "body{max-width:860px;margin:48px auto;padding:0 24px;color:#2a2724;background:#fafaf8;font:16px/1.7 system-ui,sans-serif}h1,h2{line-height:1.3}section{margin:32px 0;padding-top:24px;border-top:1px solid #e0ddd7}section>h2{font-size:13px;color:#77726a}pre{padding:16px;background:#edebe7;overflow:auto;border-radius:8px}table{border-collapse:collapse;display:block;overflow:auto}td,th{border:1px solid #c9c5bd;padding:8px 12px}blockquote{margin-left:0;padding-left:16px;border-left:3px solid #c9c5bd}a{color:#984529}img{max-width:100%}code{overflow-wrap:anywhere}footer{margin-top:48px;padding-top:16px;border-top:1px solid #e0ddd7;color:#77726a;font-size:13px;text-align:center}";
  return {
    text: text.join("\n\n---\n\n"),
    markdown: `${markdown.join("\n\n")}\n`,
    html: `<!doctype html>\n<html lang="${locale === "zh" ? "zh-CN" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'">${htmlTitle.outerHTML}<style>${css}</style></head><body>${main.outerHTML}${appName ? footer.outerHTML : ""}</body></html>`,
    filename: title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/g, "").slice(0, 100) || "Polaris conversation"
  };
}
