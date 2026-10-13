import { appendSanitizedChapterContent } from "./chapter-markdown.js";

// Split source DOM ranges, never deduplicate text: repeated sentences are content.
export function collectSidepanelChapters(containers, outline, { baseUrl, fullTextTitle = "Full text", userMessages = [], assistantToUser = null } = {}) {
  const result = [];
  const userNodes = new Map();
  const entries = [
    ...containers.map((container, containerIndex) => ({ element: container, container, containerIndex })),
    ...userMessages.map((user) => ({ element: user.element, user }))
  ];
  if (userMessages.length) entries.sort((left, right) => {
    const position = left.element.compareDocumentPosition(right.element);
    return position & 4 ? -1 : position & 2 ? 1 : 0;
  });
  let userNode = null;
  entries.forEach(({ container, containerIndex, user }) => {
    if (user) {
      userNode = { markerKey: user.markerKey, sourceKey: user.markerKey, parentKey: "", title: user.title, contents: [] };
      userNodes.set(user.element, userNode);
      result.push(userNode);
      return;
    }
    if (assistantToUser) userNode = userNodes.get(assistantToUser.get(container)) || null;
    const doc = container.ownerDocument;
    const headings = outline.filter((entry) => entry.containerKey === `assistant-${containerIndex}`);
    const byKey = new Map();
    const bounds = new Map();
    const point = (element, after = false) => {
      const range = doc.createRange();
      if (after) range.setStartAfter(element);
      else range.setStartBefore(element);
      range.collapse(true);
      return range;
    };
    const edge = (end = false) => {
      const range = doc.createRange();
      range.selectNodeContents(container);
      range.collapse(!end);
      return range;
    };
    const slice = (start, end) => {
      if (start.compareBoundaryPoints(0, end) >= 0) return null;
      const range = doc.createRange();
      range.setStart(start.startContainer, start.startOffset);
      range.setEnd(end.startContainer, end.startOffset);
      const fragment = range.cloneContents();
      fragment.querySelectorAll('button, [role="button"], [hidden], [aria-hidden="true"], script, style').forEach((el) => el.remove());
      const safe = doc.createElement("div");
      appendSanitizedChapterContent(safe, fragment, doc, baseUrl || doc.baseURI);
      const text = chapterFragmentText(safe).trim();
      return text || safe.querySelector("img") ? { type: "block", html: safe.innerHTML, text } : null;
    };
    for (const heading of headings) {
      const node = { markerKey: heading.markerKey, sourceKey: heading.markerKey, parentKey: heading.parentKey || "", title: heading.title, contents: [] };
      byKey.set(node.markerKey, node);
      const next = outline[heading.endIndex];
      let end = next?.containerKey === heading.containerKey ? point(next.element) : edge(true);
      // List items and tables own only their source element, not subsequent prose.
      if (heading.element.matches("li, table")) end = point(heading.element, true);
      bounds.set(node.markerKey, { start: point(heading.element), body: headingBodyStart(heading, doc), end });
    }
    for (const node of byKey.values()) {
      while (byKey.has(node.parentKey)) {
        const parentBounds = bounds.get(node.parentKey);
        const ownBounds = bounds.get(node.markerKey);
        if (ownBounds.start.compareBoundaryPoints(0, parentBounds.end) < 0) break;
        node.parentKey = byKey.get(node.parentKey).parentKey;
      }
    }
    const roots = headings.filter((h) => !byKey.has(byKey.get(h.markerKey).parentKey));
    function fill(node, start, end) {
      let cursor = start;
      for (const childHeading of headings.filter((h) => byKey.get(h.markerKey).parentKey === node.markerKey)) {
        const child = byKey.get(childHeading.markerKey);
        const childBounds = bounds.get(child.markerKey);
        const before = slice(cursor, childBounds.start);
        if (before) node.contents.push(before);
        node.contents.push({ type: "child", key: child.markerKey });
        fill(child, childBounds.body, childBounds.end);
        cursor = childBounds.end;
      }
      const tail = slice(cursor, end);
      if (tail) node.contents.push(tail);
    }
    let cursor = edge();
    const appendGap = (end, suffix) => {
      const block = slice(cursor, end);
      if (!block) return;
      if (userNode) userNode.contents.push(block);
      else result.push({ markerKey: `body:${containerIndex}:${suffix}`, sourceKey: "", parentKey: "", title: fullTextTitle, contents: [block], synthetic: true });
    };
    for (const heading of roots) {
      const node = byKey.get(heading.markerKey);
      const range = bounds.get(node.markerKey);
      appendGap(range.start, node.markerKey);
      if (userNode) {
        node.parentKey = userNode.markerKey;
        userNode.contents.push({ type: "child", key: node.markerKey });
      }
      fill(node, range.body, range.end);
      const append = (current) => {
        result.push(current);
        current.contents.filter((part) => part.type === "child").forEach((part) => append(byKey.get(part.key)));
      };
      append(node);
      cursor = range.end;
    }
    appendGap(edge(true), "tail");
  });
  return result;
}

function headingBodyStart(heading, doc) {
  const element = heading.element;
  const range = doc.createRange();
  // A table's generated title is a label, not a piece of its source content.
  if (element.matches("table")) {
    range.setStartBefore(element);
  } else if (/^H[1-6]$/.test(element.tagName)) {
    range.setStartAfter(element);
  } else {
    // Consume only the heading prefix at its original text-node offsets.
    const walker = doc.createTreeWalker(element, 4);
    const wanted = String(heading.title).replace(/\s/g, "");
    let consumed = "";
    let endNode = null;
    let endOffset = 0;
    outer: while (walker.nextNode()) {
      const text = walker.currentNode.textContent;
      for (let i = 0; i < text.length; i += 1) {
        if (!/\s/.test(text[i])) consumed += text[i];
        if (!wanted.startsWith(consumed)) break outer;
        if (consumed === wanted) { endNode = walker.currentNode; endOffset = i + 1; break outer; }
      }
    }
    if (endNode) range.setStart(endNode, endOffset);
    else range.setStartBefore(element);
  }
  range.collapse(true);
  return range;
}

export function chapterFragmentText(node) {
  if (node.nodeType === 3) return node.textContent || "";
  if (node.nodeType !== 1) return "";
  const tag = node.tagName.toLowerCase();
  if (tag === "img") return node.getAttribute("alt") || "[Image]";
  if (tag === "br") return "\n";
  if (tag === "input") return node.hasAttribute("checked") ? "[x] " : "[ ] ";
  const value = Array.from(node.childNodes, chapterFragmentText).join("");
  if (tag === "li") return `- ${value.trim()}\n`;
  if (tag === "td" || tag === "th") return `${value}\t`;
  if (/^(p|h[1-6]|pre|blockquote|tr|ul|ol|figure)$/.test(tag)) return `${value.trim()}\n\n`;
  return value;
}
