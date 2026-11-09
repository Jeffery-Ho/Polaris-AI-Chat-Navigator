import { hashedMarkdownHeadingLevel } from "./hashed-markdown.js";
import { safeChapterLinkHref } from "./chapter-markdown.js";
import { safeUserMessageImageUrl } from "./user-message-images.js";

const SKIP_SELECTOR = 'script, style, iframe, object, embed, svg, template, textarea, input, select, [contenteditable]:not([contenteditable="false"]), [hidden], [aria-hidden="true"], .sr-only, .visually-hidden, [class*="avatar" i], [data-testid*="avatar" i]';
const CONTROL_SELECTOR = 'button, [role="button"]';
const CARD_SELECTOR = '.attachment, .file-card, .file-card-info, [data-testid="attachment"], [data-testid="file-attachment"], [data-testid="file-card"], [data-cds="MessageAttachmentsFile"]';
const NAME_SELECTOR = '[data-file-name], [data-filename], .file-name, .filename, [data-testid="file-name"], [data-cds="MessageAttachmentsFile"] [data-cds="CardLink"][title]';
const FILE_METADATA_SELECTOR = ".file-card-info-detail, .file-ext, .file-size";
const CONTAINER_TAGS = new Set(["DIV", "SECTION", "ARTICLE", "FIGURE", "FIGCAPTION", "MAIN", "HEADER", "FOOTER"]);
const INLINE_TYPES = { STRONG: "strong", B: "strong", EM: "em", I: "em", DEL: "del", S: "del", STRIKE: "del" };
const FILE_KIND = /^(?:Markdown|MD|PDF|DOCX?|XLSX?|PPTX?|TXT|Text|CSV|TSV|JSON|XML|HTML|ZIP|RAR|7Z|文档|文件)$/i;
const FILE_SIZE = /^(?:(?:[a-z0-9]{1,12}|Markdown|文档|文件)\s*[·•|/-]?\s*)?\d+(?:[.,]\d+)?\s*(?:bytes?|[KMGT]?i?B)$/i;

function looksLikeFileName(value) {
  return value.length <= 512 && /^[^\r\n/<>]+\.[a-z0-9]{1,12}$/i.test(value);
}

function excluded(node) {
  if (node.nodeType !== 1) return false;
  if (node.matches(SKIP_SELECTOR)) return true;
  const identity = [node.getAttribute("data-testid"), node.getAttribute("data-role"), ...node.classList];
  return identity.some((value) => /^(?:think|thinking|reasoning)(?:$|[-_])/i.test(value || ""))
    || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(node.getAttribute("style") || "");
}

function excludedWithin(node, root) {
  for (let current = node; current; current = current.parentElement) {
    if (excluded(current)) return true;
    if (current === root) return false;
  }
  return false;
}

function textWithoutControls(node) {
  if (node.nodeType === 3) return node.textContent || "";
  if (node.nodeType !== 1 || excluded(node)) return "";
  return Array.from(node.childNodes).filter((child) => child.nodeType !== 1 || !child.matches(CONTROL_SELECTOR))
    .map(textWithoutControls).join("");
}

function selectIncludingRoot(root, selector) {
  return [...(root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)];
}

function fileName(node, metadata = new Set()) {
  const accessibleName = node.getAttribute("aria-label") || (node.matches('[data-cds="CardLink"]') ? node.getAttribute("title") : "") || "";
  const labelText = (current) => {
    if (current.nodeType === 3) return current.textContent || "";
    if (current.nodeType !== 1 || excluded(current) || current !== node && metadata.has(current)
      || current.matches(FILE_METADATA_SELECTOR) || current !== node && current.matches(CONTROL_SELECTOR)) return "";
    const title = current.getAttribute("title") || "";
    const visible = current.textContent.trim();
    if (looksLikeFileName(title) && /(?:\.\.\.|…)$/.test(visible) && title.startsWith(visible.replace(/(?:\.\.\.|…)$/, ""))) return title;
    return Array.from(current.childNodes).map(labelText).join("");
  };
  return (node.getAttribute("data-file-name") || node.getAttribute("data-filename")
    || node.getAttribute("download") || (looksLikeFileName(accessibleName) ? accessibleName : labelText(node))).replace(/\s+/g, " ").trim();
}

function attachmentUrl(node, baseUrl) {
  const link = node.matches("a[href]") ? node : node.querySelector("a[download][href], a[href]");
  const value = link?.getAttribute("href") || node.getAttribute("data-file-url") || "";
  if (!value) return "";
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === "https:" || url.protocol === "blob:" && url.origin === new URL(baseUrl).origin ? url.href : "";
  } catch { return ""; }
}

// Native cards often have only generated classes. Read their filename beside
// a document icon, with optional size/type metadata, without guessing a class.
function inferredFileCards(root, metadata) {
  const result = new Set();
  const seeds = new Set([...metadata, ...root.querySelectorAll("svg, img")].map((node) => node.parentElement));
  for (const node of selectIncludingRoot(root, CONTROL_SELECTOR)) {
    if (looksLikeFileName(node.getAttribute("aria-label") || "")) seeds.add(node);
  }
  for (const seed of seeds) {
    let owner = null; let name = "";
    for (let node = seed, depth = 0; node && root.contains(node) && depth < 4; node = node.parentElement, depth++) {
      if (excludedWithin(node, root)) break;
      const candidate = fileName(node, metadata);
      if (!candidate) continue;
      if (!looksLikeFileName(candidate) || name && candidate !== name
        || /^(?:下载|打开|复制|删除|Download|Open|Copy|Delete|Remove)\s+/i.test(candidate)) break;
      // Do not concatenate unrelated paragraphs into a plausible filename.
      if (node.getAttribute("aria-label") !== candidate && ![...node.childNodes].some((child) => child.nodeType === 3 ? child.textContent.trim() === candidate
        : child.nodeType === 1 && !metadata.has(child) && fileName(child, metadata) === candidate)) break;
      owner = node; name = candidate;
    }
    if (owner && (owner.querySelector("svg, img") || owner.matches(CONTROL_SELECTOR) && looksLikeFileName(owner.getAttribute("aria-label") || ""))) result.add(owner);
  }
  return [...result];
}

function domMessageAttachments(root, { attachmentSelector = "", baseUrl = root.ownerDocument.baseURI, role = "assistant" } = {}) {
  const metadata = new Set(selectIncludingRoot(root, "*").filter((node) => !excludedWithin(node, root)
    && !node.children.length && (FILE_KIND.test(node.textContent.trim()) || FILE_SIZE.test(node.textContent.trim()))));
  const inferred = role === "user" ? inferredFileCards(root, metadata) : [];
  const cards = selectIncludingRoot(root, [CARD_SELECTOR, attachmentSelector].filter(Boolean).join(", "))
    .filter((node) => !excludedWithin(node, root));
  cards.push(...inferred.filter((node) => !cards.includes(node)));
  const leafCards = cards.filter((card) => !cards.some((other) => other !== card && card.contains(other)));
  const standalone = selectIncludingRoot(root, `${NAME_SELECTOR}, a[download]`)
    .filter((node) => !excludedWithin(node, root) && !cards.some((card) => card.contains(node)));
  const owners = [...leafCards, ...standalone.filter((node) => !standalone.some((other) => other !== node && other.contains(node)))];
  owners.sort((left, right) => left === right ? 0 : left.compareDocumentPosition(right) & 4 ? -1 : 1);
  const result = new Map();
  for (const owner of owners) {
    const namedControl = owner.matches(CONTROL_SELECTOR) && looksLikeFileName(owner.getAttribute("aria-label") || "");
    let names = namedControl || owner.matches(`${NAME_SELECTOR}, a[download]`) ? [owner] : Array.from(owner.querySelectorAll(NAME_SELECTOR));
    if (!names.length) names = Array.from(owner.querySelectorAll("a[download]"));
    if (!names.length) names = [owner];
    names = names.filter((node) => !excludedWithin(node, root)
      && !names.some((other) => other !== node && other.contains(node)));
    const mimeNode = owner.matches("[data-mime-type], [data-file-type]")
      ? owner : owner.querySelector("[data-mime-type], [data-file-type], a[type]");
    const mimeType = mimeNode?.getAttribute("data-mime-type") || mimeNode?.getAttribute("data-file-type") || mimeNode?.getAttribute("type")
      || owner.querySelector(".file-ext")?.textContent.trim() || "";
    const url = attachmentUrl(owner, baseUrl);
    const attachments = names.map((node) => ({ type: "attachment", name: fileName(node, metadata),
      ...(mimeType ? { mimeType } : {}), ...(url ? { url } : {}) })).filter((item) => item.name);
    // A downloadable image is still an image; its wrapper must not swallow it.
    if (attachments.length === 1 && (/^image\/(?!svg)/i.test(mimeType) || /\.(?:png|jpe?g|gif|webp|avif|bmp)$/i.test(attachments[0].name))) {
      const images = Array.from(owner.querySelectorAll("img")).filter((node) => !excludedWithin(node, root))
        .map((node) => imageBlock(node, baseUrl)).filter(Boolean);
      if (images.length) {
        result.set(owner, images.map((image) => ({ ...image, alt: image.alt || attachments[0].name })));
        continue;
      }
    }
    if (attachments.length) result.set(owner, attachments);
  }
  return result;
}

function imageBlock(node, baseUrl) {
  const dimension = (name) => Number(node.getAttribute(name));
  const width = dimension("width"); const height = dimension("height");
  if (width === 1 && height === 1) return null;
  const alt = node.getAttribute("alt") || "";
  if (/^[a-z0-9]{1,12}$/i.test(alt) && !/^(?:png|jpe?g|gif|webp|avif|bmp)$/i.test(alt)) {
    // Kimi's file-type image sits beside its file-card-info, not inside it.
    let owner = node.parentElement;
    for (let depth = 0; owner && depth < 3; depth++, owner = owner.parentElement) {
      const info = owner.matches(".file-card-info") ? owner : Array.from(owner.children).find((child) => child.matches(".file-card-info"));
      if (info?.querySelector(".file-ext")?.textContent.trim().toLowerCase() === alt.toLowerCase()) return null;
    }
  }
  const sources = [node.currentSrc, node.getAttribute("src"), node.getAttribute("data-src"), node.getAttribute("data-original"),
    (node.getAttribute("srcset") || "").split(",")[0].trim().split(/\s+/)[0]];
  const src = sources.map((value) => safeUserMessageImageUrl(value, baseUrl)).find(Boolean);
  if (!src) return null;
  const path = new URL(src).pathname;
  if (/\.svg(?:$|\?)/i.test(path) || /(?:^|\/)(?:favicon(?:[.\-_]|$)|apple-touch-icon)/i.test(path)) return null;
  return { type: "image", src, alt, imageKey: "",
    ...(width > 0 ? { width } : {}), ...(height > 0 ? { height } : {}) };
}

function trimInline(nodes) {
  while (nodes[0]?.type === "text") {
    nodes[0].value = nodes[0].value.trimStart();
    if (nodes[0].value) break;
    nodes.shift();
  }
  while (nodes.at(-1)?.type === "text") {
    nodes.at(-1).value = nodes.at(-1).value.trimEnd();
    if (nodes.at(-1).value) break;
    nodes.pop();
  }
  return nodes;
}

// Read semantic DOM directly: innerText cannot retain headings, lists or files.
export function domMessageBlocks(element, { baseUrl = element.ownerDocument.baseURI, role = "assistant", attachmentSelector = "", textSelector = "", headingFor = null, onHeading = null, onAttachment = null } = {}) {
  if (excludedWithin(element, element.ownerDocument.documentElement)) return [];
  const attachments = domMessageAttachments(element, { attachmentSelector, baseUrl, role });
  const textRoots = textSelector ? selectIncludingRoot(element, textSelector) : [element];
  const includesText = (node) => !(node.nodeType === 1 ? node : node.parentElement)?.closest(CONTROL_SELECTOR)
    && textRoots.some((root) => root === node || root.contains(node));
  const containsAttachment = (node) => Array.from(attachments.keys()).some((owner) => owner !== node && node.contains(owner));
  const mediaButton = (node) => node.matches(CONTROL_SELECTOR)
    && /(?:open|view|preview)\s+(?:image|attachment)|查看图片|预览图片|打开附件/i.test(node.getAttribute("aria-label") || "");
  const isControl = (node) => node.nodeType === 1 && node.matches(CONTROL_SELECTOR) && !mediaButton(node);
  const appendInline = (target, values) => {
    for (const value of values) {
      const previous = target.at(-1);
      if (value.type === "text" && previous?.type === "text") previous.value += value.value;
      else target.push(value);
    }
  };

  function inline(node) {
    if (node.nodeType === 3) return includesText(node) ? [{ type: "text", value: node.textContent || "" }] : [];
    if (node.nodeType !== 1 || excluded(node) || isControl(node) || attachments.has(node)) return [];
    if (node.tagName === "IMG") { const image = imageBlock(node, baseUrl); return image ? [image] : []; }
    if (node.tagName === "BR") return includesText(node) ? [{ type: "break" }] : [];
    if (node.tagName === "CODE") return includesText(node) ? [{ type: "code", value: textWithoutControls(node) }] : [];
    const children = [];
    for (const child of node.childNodes) appendInline(children, inline(child));
    if (INLINE_TYPES[node.tagName]) return children.length ? [{ type: INLINE_TYPES[node.tagName], children }] : [];
    if (node.tagName === "A") {
      const href = node.hasAttribute("href") ? safeChapterLinkHref(node.getAttribute("href"), baseUrl) : "";
      if (href && children.length) return [{ type: "link", href, children }];
    }
    return children;
  }

  function childrenOf(node) {
    const result = []; let pending = [];
    const flush = () => {
      const children = trimInline(pending); pending = [];
      if (children.length) result.push({ type: "paragraph", children });
    };
    for (const child of node.childNodes) {
      if (child.nodeType === 1 && (attachments.has(child) || isBlock(child))) {
        flush(); result.push(...block(child));
      } else appendInline(pending, inline(child));
    }
    flush(); return result;
  }

  function isBlock(node) {
    return CONTAINER_TAGS.has(node.tagName) || /^(?:P|PRE|BLOCKQUOTE|UL|OL|TABLE|HR|IMG)$/.test(node.tagName)
      || headingLevel(node) > 0 || mediaButton(node) || containsAttachment(node);
  }

  function headingLevel(node) {
    const semantic = headingFor?.(node);
    const explicit = typeof semantic === "object" ? semantic?.level : semantic;
    if (Number.isInteger(explicit) && explicit >= 1 && explicit <= 6) return explicit;
    if (node.getAttribute("role") === "heading") {
      const level = Number(node.getAttribute("aria-level"));
      return Number.isInteger(level) && level >= 1 && level <= 6 ? level : 2;
    }
    return hashedMarkdownHeadingLevel(node);
  }

  function block(node) {
    if (excluded(node)) return [];
    if (attachments.has(node)) {
      const blocks = attachments.get(node);
      for (const value of blocks) if (value.type === "attachment") onAttachment?.(value, node);
      return blocks;
    }
    if (isControl(node)) return [];
    if (node.tagName === "IMG") { const image = imageBlock(node, baseUrl); return image ? [image] : []; }
    const level = headingLevel(node);
    if (level || node.tagName === "P") {
      if (containsAttachment(node)) return childrenOf(node);
      const semanticTitle = level ? headingFor?.(node)?.title : "";
      const children = semanticTitle ? [{ type: "text", value: semanticTitle }] : trimInline(inline(node));
      if (!children.length) return [];
      const result = { type: level ? "heading" : "paragraph", ...(level ? { level } : {}), children };
      if (level) onHeading?.(result, node);
      return [result];
    }
    if (node.tagName === "HR") return includesText(node) ? [{ type: "rule" }] : [];
    if (node.tagName === "PRE") {
      if (!includesText(node)) return [];
      const code = node.querySelector("code") || node;
      const language = code.className.match(/(?:^|\s)language-([a-zA-Z0-9_+-]+)(?:\s|$)/)?.[1];
      return [{ type: "codeBlock", value: textWithoutControls(code), ...(language ? { language } : {}) }];
    }
    if (node.tagName === "BLOCKQUOTE") {
      const blocks = childrenOf(node); return blocks.length ? [{ type: "quote", blocks }] : [];
    }
    if (node.tagName === "UL" || node.tagName === "OL") {
      const items = Array.from(node.children).filter((child) => child.tagName === "LI" && !excluded(child)).map((item) => {
        const children = childrenOf(item);
        const first = children[0];
        const inline = first?.type === "paragraph" ? children.shift().children : [];
        const checkbox = item.querySelector('input[type="checkbox"]');
        return { inline, children, ...(checkbox ? { checked: checkbox.checked } : {}) };
      }).filter((item) => item.inline.length || item.children.length);
      return items.length ? [{ type: "list", ordered: node.tagName === "OL", items }] : [];
    }
    if (node.tagName === "TABLE") {
      const rows = Array.from(node.querySelectorAll("tr")).filter((row) => row.closest("table") === node && !excluded(row))
        .map((row) => Array.from(row.children).filter((cell) => /^(TH|TD)$/.test(cell.tagName)).map((cell) => trimInline(inline(cell))));
      return rows.length ? [{ type: "table", headers: rows[0], rows: rows.slice(1) }] : [];
    }
    // Unknown wrappers remain transparent; attachment/image siblings keep order.
    return childrenOf(node);
  }

  // `role` is part of the shared reader contract; both roles preserve media.
  return element?.nodeType === 1 && ["user", "assistant"].includes(role) ? block(element) : [];
}
