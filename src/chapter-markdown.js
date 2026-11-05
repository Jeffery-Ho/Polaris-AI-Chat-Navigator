const BLOCK_TAG_NAMES = new Set([
  "p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "blockquote", "table", "ul", "ol", "figure", "img"
]);

const CONTENT_TAG_NAMES = new Set([
  ...BLOCK_TAG_NAMES,
  "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "li", "figcaption",
  "strong", "em", "del", "code", "br", "a", "input"
]);

const TAG_ALIASES = Object.freeze({
  b: "strong",
  i: "em",
  s: "del",
  strike: "del"
});

const DISCARDED_TAG_NAMES = new Set([
  "script", "style", "iframe", "object", "embed", "link", "meta", "svg", "template"
]);

function normalizedTagName(tagName) {
  return String(tagName || "").toLowerCase();
}

export function chapterContentTagName(tagName) {
  const normalized = normalizedTagName(tagName);
  const tag = TAG_ALIASES[normalized] || normalized;
  return CONTENT_TAG_NAMES.has(tag) ? tag : "";
}

export function isChapterBlockTag(tagName) {
  return BLOCK_TAG_NAMES.has(normalizedTagName(tagName));
}

export const CHAPTER_BLOCK_SELECTOR = Array.from(BLOCK_TAG_NAMES).join(", ");

export function shouldDiscardChapterNode(tagName) {
  return DISCARDED_TAG_NAMES.has(normalizedTagName(tagName));
}

export function safeChapterUrl(value, baseUrl, allowedProtocols) {
  try {
    const url = new URL(String(value || ""), baseUrl);
    return allowedProtocols.includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function safeChapterLinkHref(value, baseUrl) {
  return safeChapterUrl(value, baseUrl, ["http:", "https:", "mailto:"]);
}

export function safeChapterImageSrc(value, baseUrl) {
  return safeChapterUrl(value, baseUrl, ["http:", "https:"]);
}

function markdownTableCells(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.includes("|")) {
    return null;
  }

  const content = trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "");
  const cells = [];
  let cell = "";
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === "\\" && content[index + 1] === "|") {
      cell += "|";
      index += 1;
    } else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function isMarkdownTableDelimiter(cell) {
  return /^:?-{3,}:?$/.test(cell);
}

export function parseMarkdownTable(text) {
  const lines = String(text || "").trim().split("\n");
  if (lines.length < 3 || lines.some((line) => !line.trim())) {
    return null;
  }

  const headers = markdownTableCells(lines[0]);
  const delimiters = markdownTableCells(lines[1]);
  if (!headers || !delimiters || headers.length < 2 || headers.length !== delimiters.length || !delimiters.every(isMarkdownTableDelimiter)) {
    return null;
  }

  const rows = lines.slice(2).map(markdownTableCells);
  if (rows.some((row) => !row || row.length !== headers.length)) {
    return null;
  }

  return { headers, rows };
}

function appendMarkdownText(nodes, value) {
  if (!value) {
    return;
  }
  const previous = nodes[nodes.length - 1];
  if (previous?.type === "text") {
    previous.value += value;
  } else {
    nodes.push({ type: "text", value });
  }
}

function safeRawMarkdownLink(value) {
  return !/^[a-z][a-z0-9+.-]*:/i.test(value) || /^(?:https?:|mailto:)/i.test(value);
}

function matchingInlineMarker(text, start, marker) {
  const end = text.indexOf(marker, start + marker.length);
  return end > start + marker.length ? end : -1;
}

function parseMarkdownInline(text) {
  const source = String(text || "");
  const nodes = [];
  let recognized = false;
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    if (character === "\\" && index + 1 < source.length) {
      appendMarkdownText(nodes, source[index + 1]);
      index += 2;
      continue;
    }

    if (character === "!" && source[index + 1] === "[") {
      const labelEnd = source.indexOf("](", index + 2);
      let end = labelEnd + 2; let depth = 1;
      if (labelEnd >= 0) for (; end < source.length; end++) {
        if (source[end] === "\\") { end++; continue; }
        if (source[end] === "(") depth++;
        if (source[end] === ")" && --depth === 0) break;
      }
      if (labelEnd >= 0 && end < source.length) {
        const destination = source.slice(labelEnd + 2, end).trim();
        const src = destination.replace(/\s+["'][^"']*["']$/, "").replace(/^<([^>]+)>$/, "$1");
        nodes.push({ type: "image", src, alt: source.slice(index + 2, labelEnd) });
        recognized = true;
        index = end + 1;
        continue;
      }
    }

    if (character === "[") {
      const labelEnd = source.indexOf("](", index + 1);
      const hrefEnd = labelEnd >= 0 ? source.indexOf(")", labelEnd + 2) : -1;
      if (labelEnd > index + 1 && hrefEnd > labelEnd + 2) {
        const href = source.slice(labelEnd + 2, hrefEnd).trim();
        if (safeRawMarkdownLink(href)) {
          const label = parseMarkdownInline(source.slice(index + 1, labelEnd));
          nodes.push({ type: "link", href, children: label.nodes });
          recognized = true;
          index = hrefEnd + 1;
          continue;
        }
      }
    }

    if (character === "`") {
      const end = matchingInlineMarker(source, index, "`");
      if (end >= 0) {
        nodes.push({ type: "code", value: source.slice(index + 1, end) });
        recognized = true;
        index = end + 1;
        continue;
      }
    }

    const canUseUnderscore = character !== "_" || !/[A-Za-z0-9]/.test(source[index - 1] || "");
    const markers = (character === "*" || character === "_") && canUseUnderscore
      ? [character + character, character]
      : character === "~"
        ? ["~~"]
        : [];
    const marker = markers.find((candidate) => source.startsWith(candidate, index));
    if (marker) {
      const end = matchingInlineMarker(source, index, marker);
      if (end >= 0 && !/^\s|\s$/.test(source.slice(index + marker.length, end))) {
        const child = parseMarkdownInline(source.slice(index + marker.length, end));
        const type = marker === "~~" ? "del" : marker.length === 2 ? "strong" : "em";
        nodes.push({ type, children: child.nodes });
        recognized = true;
        index = end + marker.length;
        continue;
      }
    }

    appendMarkdownText(nodes, character);
    index += 1;
  }

  return { nodes, recognized };
}

function markdownIndent(line) {
  return (String(line || "").match(/^[ \t]*/)?.[0] || "").replace(/\t/g, "  ").length;
}

function markdownListItem(line) {
  const match = String(line || "").match(/^([ \t]*)([-+*]|\d+[.)])\s+(.+)$/);
  if (!match) {
    return null;
  }
  return {
    indent: markdownIndent(match[1]),
    ordered: /^\d/.test(match[2]),
    value: match[3]
  };
}

function markdownHeading(line) {
  const match = String(line || "").match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
  return match ? { level: match[1].length, value: match[2] } : null;
}

function isMarkdownRule(line) {
  return /^(?: {0,3}[-*_])(?:[ \t]*[-*_]){2,}[ \t]*$/.test(String(line || ""));
}

function markdownFence(line) {
  const match = String(line || "").match(/^ {0,3}(`{3,}|~{3,})[^`~]*$/);
  return match ? match[1] : "";
}

function markdownTableAt(lines, index) {
  const rows = [];
  for (let cursor = index; cursor < lines.length && lines[cursor].trim(); cursor += 1) {
    rows.push(lines[cursor]);
  }
  const table = parseMarkdownTable(rows.join("\n"));
  return table ? { table, end: index + rows.length } : null;
}

function lineStartsMarkdownBlock(lines, index) {
  const line = lines[index] || "";
  return Boolean(
    markdownHeading(line)
    || isMarkdownRule(line)
    || markdownFence(line)
    || /^ {0,3}> ?/.test(line)
    || markdownListItem(line)
    || markdownTableAt(lines, index)
  );
}

function parseMarkdownList(lines, start, indent = markdownListItem(lines[start]).indent) {
  const first = markdownListItem(lines[start]);
  const list = { type: "list", ordered: first.ordered, items: [] };
  let index = start;

  while (index < lines.length) {
    const item = markdownListItem(lines[index]);
    if (!item || item.indent !== indent || item.ordered !== list.ordered) {
      break;
    }

    const task = item.value.match(/^\[([ xX])\]\s+(.*)$/);
    const entry = {
      children: [],
      inline: parseMarkdownInline(task ? task[2] : item.value).nodes
    };
    if (task) {
      entry.checked = task[1].toLowerCase() === "x";
    }
    list.items.push(entry);
    index += 1;

    const continuation = [];
    while (index < lines.length) {
      const next = markdownListItem(lines[index]);
      if (next && next.indent <= indent) {
        break;
      }
      if (next && next.indent > indent) {
        const nested = parseMarkdownList(lines, index, next.indent);
        entry.children.push(nested.list);
        index = nested.end;
        continue;
      }
      if (!lines[index].trim()) {
        break;
      }
      continuation.push(lines[index].trim());
      index += 1;
    }
    if (continuation.length) {
      entry.inline.push({ type: "break" }, ...parseMarkdownInline(continuation.join("\n")).nodes);
    }
  }

  return { list, end: index };
}

function parseMarkdownBlocks(lines) {
  const blocks = [];
  let recognized = false;
  let index = 0;

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }

    const fence = markdownFence(lines[index]);
    if (fence) {
      const end = lines.findIndex((line, cursor) => cursor > index && line.trimStart().startsWith(fence));
      if (end > index) {
        const language = lines[index].trimStart().slice(fence.length).trim().match(/^[a-zA-Z0-9_+-]+$/)?.[0];
        blocks.push({ type: "codeBlock", value: lines.slice(index + 1, end).join("\n"), ...(language ? { language } : {}) });
        recognized = true;
        index = end + 1;
        continue;
      }
    }

    const heading = markdownHeading(lines[index]);
    if (heading) {
      blocks.push({ type: "heading", level: heading.level, children: parseMarkdownInline(heading.value).nodes });
      recognized = true;
      index += 1;
      continue;
    }

    if (isMarkdownRule(lines[index])) {
      blocks.push({ type: "rule" });
      recognized = true;
      index += 1;
      continue;
    }

    if (/^ {0,3}> ?/.test(lines[index])) {
      const quoteLines = [];
      while (index < lines.length && /^ {0,3}> ?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^ {0,3}> ?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", blocks: parseMarkdownBlocks(quoteLines).blocks });
      recognized = true;
      continue;
    }

    const listItem = markdownListItem(lines[index]);
    if (listItem) {
      const parsed = parseMarkdownList(lines, index, listItem.indent);
      blocks.push(parsed.list);
      recognized = true;
      index = parsed.end;
      continue;
    }

    const markdownTable = markdownTableAt(lines, index);
    if (markdownTable) {
      blocks.push({
        type: "table",
        headers: markdownTable.table.headers.map((cell) => parseMarkdownInline(cell).nodes),
        rows: markdownTable.table.rows.map((row) => row.map((cell) => parseMarkdownInline(cell).nodes))
      });
      recognized = true;
      index = markdownTable.end;
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !lineStartsMarkdownBlock(lines, index)) {
      paragraph.push(lines[index]);
      index += 1;
    }
    const inline = parseMarkdownInline(paragraph.join("\n"));
    blocks.push({ type: "paragraph", children: inline.nodes });
    recognized ||= inline.recognized;
  }

  return { blocks, recognized };
}

export function parseChapterMarkdown(text) {
  const source = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!source) {
    return null;
  }
  const parsed = parseMarkdownBlocks(source.split("\n"));
  return parsed.recognized ? parsed.blocks : null;
}

function containsMarkdownImage(nodes) {
  return nodes.some((node) => node.type === "image" || node.children && containsMarkdownImage(node.children));
}

export function appendParsedMarkdownInline(target, nodes, ownerDocument, baseUrl, appendImage) {
  nodes.forEach((node) => {
    if (node.type === "image") {
      if (appendImage) appendImage(target, node);
      else {
        const source = ownerDocument.createElement("img");
        source.setAttribute("src", node.src); source.setAttribute("alt", node.alt || "");
        appendSanitizedChapterNode(target, source, ownerDocument, baseUrl);
      }
      return;
    }
    if (node.type === "text") {
      target.appendChild(ownerDocument.createTextNode(node.value));
      return;
    }
    if (node.type === "break") {
      target.appendChild(ownerDocument.createElement("br"));
      return;
    }
    if (node.type === "code") {
      const code = ownerDocument.createElement("code");
      code.textContent = node.value;
      target.appendChild(code);
      return;
    }
    if (node.type === "link") {
      // Image labels keep their own navigation instead of nesting anchors.
      if (containsMarkdownImage(node.children)) {
        appendParsedMarkdownInline(target, node.children, ownerDocument, baseUrl, appendImage); return;
      }
      const href = safeChapterLinkHref(node.href, baseUrl);
      if (!href) {
        appendParsedMarkdownInline(target, node.children, ownerDocument, baseUrl, appendImage);
        return;
      }
      const link = ownerDocument.createElement("a");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      appendParsedMarkdownInline(link, node.children, ownerDocument, baseUrl, appendImage);
      target.appendChild(link);
      return;
    }
    const element = ownerDocument.createElement(node.type);
    appendParsedMarkdownInline(element, node.children, ownerDocument, baseUrl, appendImage);
    target.appendChild(element);
  });
}

export function appendSanitizedChapterContent(target, source, ownerDocument, baseUrl, appendImage) {
  source.childNodes.forEach((node) => appendSanitizedChapterNode(target, node, ownerDocument, baseUrl, appendImage));
}

export function appendSanitizedChapterNode(target, source, ownerDocument, baseUrl, appendImage) {
  if (source.nodeType === 3) {
    target.appendChild(ownerDocument.createTextNode(source.textContent || ""));
    return;
  }

  if (source.nodeType !== 1) {
    return;
  }

  if (shouldDiscardChapterNode(source.tagName)) {
    return;
  }

  const tagName = chapterContentTagName(source.tagName);
  if (!tagName) {
    appendSanitizedChapterContent(target, source, ownerDocument, baseUrl, appendImage);
    return;
  }

  if (tagName === "br") {
    target.appendChild(ownerDocument.createElement("br"));
    return;
  }

  if (tagName === "a") {
    if (appendImage && source.querySelector("img")) { appendSanitizedChapterContent(target, source, ownerDocument, baseUrl, appendImage); return; }
    const href = safeChapterLinkHref(source.getAttribute("href"), baseUrl);
    if (!href) {
      appendSanitizedChapterContent(target, source, ownerDocument, baseUrl, appendImage);
      return;
    }
    const link = ownerDocument.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    appendSanitizedChapterContent(link, source, ownerDocument, baseUrl, appendImage);
    target.appendChild(link);
    return;
  }

  if (tagName === "img") {
    if (appendImage) { appendImage(target, { type: "image", alt: source.getAttribute("alt") || "" }); return; }
    const src = safeChapterImageSrc(source.getAttribute("src") || source.getAttribute("data-src"), baseUrl);
    if (!src) {
      return;
    }
    const image = ownerDocument.createElement("img");
    image.className = "gpt-paragraph-nav__explosion-image";
    image.src = src;
    image.alt = source.getAttribute("alt") || "";
    image.loading = "lazy";
    image.decoding = "async";
    if (target.tagName === "A") {
      image.addEventListener("error", () => image.remove());
      target.appendChild(image);
      return;
    }
    const link = ownerDocument.createElement("a");
    link.className = "gpt-paragraph-nav__explosion-image-link";
    link.href = src;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    image.addEventListener("error", () => link.remove());
    link.appendChild(image);
    target.appendChild(link);
    return;
  }

  if (tagName === "input") {
    if (String(source.getAttribute("type") || "").toLowerCase() !== "checkbox") {
      return;
    }
    const checkbox = ownerDocument.createElement("input");
    checkbox.className = "gpt-paragraph-nav__explosion-task-checkbox";
    checkbox.type = "checkbox";
    checkbox.checked = source.hasAttribute("checked") || Boolean(source.checked);
    checkbox.disabled = true;
    checkbox.setAttribute("aria-hidden", "true");
    target.appendChild(checkbox);
    return;
  }

  const element = ownerDocument.createElement(tagName);
  if (tagName === "li" && source.querySelector('input[type="checkbox"]')) {
    element.className = "gpt-paragraph-nav__explosion-task-item";
  }
  if (tagName === "td" || tagName === "th") {
    const colspan = Number.parseInt(source.getAttribute("colspan") || "", 10);
    const rowspan = Number.parseInt(source.getAttribute("rowspan") || "", 10);
    if (colspan > 1) {
      element.colSpan = colspan;
    }
    if (rowspan > 1) {
      element.rowSpan = rowspan;
    }
  }
  appendSanitizedChapterContent(element, source, ownerDocument, baseUrl, appendImage);
  target.appendChild(element);
}
