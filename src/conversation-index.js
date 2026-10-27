import { parseChapterMarkdown } from "./chapter-markdown.js";
import { CONVERSATION_SNAPSHOT_VERSION, publicConversationSnapshot } from "./conversation-snapshot.js";

export function chatGptConversationId(value) {
  try {
    const url = new URL(value);
    if (!/^(chatgpt\.com|chat\.openai\.com)$/.test(url.hostname)) return "";
    return url.pathname.match(/\/(?:c)\/([a-zA-Z0-9-]+)(?:\/|$)/)?.[1] || "";
  } catch { return ""; }
}

export function conversationPage(payload) {
  if (!payload || typeof payload !== "object") throw new Error("unsupported-format");
  if (Array.isArray(payload.messages) && payload.page_info) {
    const info = payload.page_info;
    if (typeof info.has_previous_page !== "boolean" || typeof info.has_next_page !== "boolean") throw new Error("unsupported-format");
    return { messages: payload.messages, previous: info.has_previous_page, next: info.has_next_page,
      cursor: info.start_cursor || "", branch: payload.current_node || "", tree: false };
  }
  if (payload.mapping && payload.current_node) {
    const messages = [];
    const seen = new Set();
    let key = payload.current_node;
    while (key) {
      if (seen.has(key) || !payload.mapping[key]) throw new Error("incomplete-chain");
      seen.add(key);
      const node = payload.mapping[key];
      if (!Object.prototype.hasOwnProperty.call(node, "parent")) throw new Error("incomplete-chain");
      if (node.message) messages.push(node.message);
      key = node.parent;
    }
    return { messages: messages.reverse(), previous: false, next: false, cursor: "", branch: payload.current_node, tree: true };
  }
  throw new Error("unsupported-format");
}

function inlineText(nodes = []) {
  return nodes.map((node) => node.value ?? inlineText(node.children)).join("");
}

function blockText(block) {
  if (block.value != null) return block.value;
  if (block.type === "table") return [block.headers, ...block.rows].map((row) => row.map(inlineText).join(" | ")).join("\n");
  if (block.items) return block.items.map((item) => [inlineText(item.inline), ...(item.children || []).map(blockText)].join("\n")).join("\n");
  if (block.blocks) return block.blocks.map(blockText).join("\n");
  return inlineText(block.children);
}

function blockAnchorText(block) {
  if (block.type === "table") return [block.headers, ...block.rows].map((row) => row.map(inlineText).join("")).join("");
  if (block.items) return block.items.map((item) => inlineText(item.inline) + (item.children || []).map(blockAnchorText).join("")).join("");
  if (block.blocks) return block.blocks.map(blockAnchorText).join("");
  return block.value ?? inlineText(block.children);
}

export function normalizeAnchorText(value) {
  // ChatGPT includes this memory-citation token in API text but does not paint it.
  return normalizeIndexedText(value).replace(/\uE200memcite\uE201/gu, "").replace(/\s/gu, "");
}

export function messageText(message) {
  const content = message?.content || {};
  if (!['text', 'multimodal_text'].includes(content.content_type)) return "";
  return (content.parts || []).map((part) => typeof part === "string" ? part : "[Attachment]").join("\n");
}

export function normalizeIndexedText(value) {
  return String(value).normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
}

// Compute offsets only for returned hits, rather than retaining an offset per
// character for every message in a potentially very large conversation.
export function indexedSnippet(text, query) {
  const normalized = normalizeIndexedText(text);
  const needle = normalizeIndexedText(query);
  const hit = normalized.indexOf(needle);
  if (hit < 0 || !needle) return [{ text: text.slice(0, 160), match: false }];
  const offsets = [];
  let value = "";
  let whitespace = false;
  for (const { segment, index } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)) {
    for (const character of segment.normalize("NFKC").toLocaleLowerCase()) {
      if (/\s/u.test(character)) {
        if (!value || whitespace) continue;
        whitespace = true;
        value += " "; offsets.push([index, index + segment.length]);
      } else {
        whitespace = false;
        value += character;
        for (let unit = 0; unit < character.length; unit++) offsets.push([index, index + segment.length]);
      }
    }
  }
  const start = offsets[hit]?.[0] ?? 0;
  const end = offsets[hit + needle.length - 1]?.[1] ?? start;
  return [
    { text: `${start > 60 ? "…" : ""}${text.slice(Math.max(0, start - 60), start)}`, match: false },
    { text: text.slice(start, end), match: true },
    { text: `${text.slice(end, end + 100)}${end + 100 < text.length ? "…" : ""}`, match: false }
  ];
}

function recordFor(message, previous, parseMarkdown) {
  const role = message?.author?.role;
  if (!message?.id || !["user", "assistant"].includes(role)
    || message.metadata?.is_visually_hidden_from_conversation
    || (message.channel && message.channel !== "final")
    || (message.recipient && message.recipient !== "all")) return null;
  const markdown = messageText(message);
  if (!markdown && !['text', 'multimodal_text'].includes(message.content?.content_type)) return null;
  // Compare exact source as well as its fingerprint; a hash collision must never
  // make an edited message look unchanged. A streaming patch clears the hash.
  let hash = 2166136261;
  for (let i = 0; i < markdown.length; i++) hash = Math.imul(hash ^ markdown.charCodeAt(i), 16777619);
  const fingerprint = `${role}:${markdown.length}:${hash >>> 0}`;
  if (previous?.fingerprint === fingerprint && previous.markdown === markdown && previous.role === role)
    return { ...previous, time: message.create_time ?? null };
  const blocks = parseMarkdown(markdown) || [{ type: "paragraph", children: [{ type: "text", value: markdown }] }];
  const text = blocks.map(blockText).join("\n\n");
  return { id: message.id, role, time: message.create_time ?? null, markdown, text, blocks, fingerprint,
    anchorText: normalizeAnchorText(blocks.map(blockAnchorText).join("")), searchText: normalizeIndexedText(text) };
}

export function createConversationIndex({ yieldTask = () => new Promise((resolve) => setTimeout(resolve, 0)), parseMarkdown = parseChapterMarkdown } = {}) {
  let records = new Map();
  let reusableRecords = new Map();
  let order = [];
  let title = "";
  let revision = 0;
  let phase = "loading";
  let branch = "";
  let error = "";
  const listeners = new Set();
  const notify = () => { revision++; listeners.forEach((listener) => listener(status())); };
  const status = () => ({ phase, title, count: records.size, total: phase === "complete" ? records.size : null, revision, branch, error });

  async function ingest(payload, { older = false, replace = false, signal, complete = false } = {}) {
    const page = conversationPage(payload);
    if (replace) reusableRecords = records;
    const normalized = [];
    let budgetStart = performance.now();
    for (const message of page.messages) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const record = recordFor(message, records.get(message.id) || reusableRecords.get(message.id), parseMarkdown);
      if (record) normalized.push(record);
      if (performance.now() - budgetStart > 8) { await yieldTask(); budgetStart = performance.now(); }
    }
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (replace) { records = new Map(); order = []; }
    const ids = [];
    for (const record of normalized) {
      ids.push(record.id);
      records.set(record.id, record);
    }
    const incoming = new Set(ids);
    order = older ? [...ids, ...order.filter((id) => !incoming.has(id))] : [...order.filter((id) => !incoming.has(id)), ...ids];
    if (typeof payload.title === "string") title = payload.title;
    branch = replace ? page.branch : page.branch || branch;
    if (complete) reusableRecords.clear();
    phase = complete ? "complete" : "loading"; error = "";
    notify();
    return page;
  }

  function getOutline(config = {}) {
    const items = [];
    const chapters = [];
    const targets = new Map();
    const chapterByKey = new Map();
    let userKey = "";
    const levels = config.enabledLevelsByPlatform?.chatgpt || [1, 2, 3];
    const strong = config.enabledStrongByPlatform?.chatgpt !== false;
    const listTitles = config.enabledUnorderedListByPlatform?.chatgpt !== false;
    const ordered = Boolean(config.enabledOrderedListByPlatform?.chatgpt);
    for (const id of order) {
      const record = records.get(id);
      const rootKey = `index:${id}`;
      const rootTitle = record.role === "user" ? record.text.slice(0, 160) : "";
      const root = { markerKey: rootKey, sourceKey: rootKey, parentKey: userKey, title: rootTitle, synthetic: record.role === "assistant", contents: [] };
      targets.set(rootKey, { messageId: id, role: record.role, text: record.text, anchorText: record.anchorText, title: rootTitle });
      if (record.role === "user") {
        userKey = rootKey; root.parentKey = "";
        root.synthetic = true;
        root.contents.push({ type: "block", text: record.text, ast: { type: "paragraph", children: [{ type: "text", value: record.text }] } });
        items.push({ key: rootKey, markerKey: rootKey, groupKey: rootKey, type: "user", title: rootTitle || "[Attachment]", preview: rootTitle, isExpanded: true });
        chapters.push(root);
        chapterByKey.set(rootKey, root);
        continue;
      }
      // Like DOM chapters, an answer belongs to its user's chapter, so preamble
      // and code-only answers need no untitled "Full text" wrapper. Only an
      // answer without a user message keeps its own synthetic root.
      const parent = chapterByKey.get(userKey);
      if (!parent) chapters.push(root);
      const base = parent || root;
      let current = base;
      const stack = [];
      record.blocks.forEach((block, ordinal) => {
        const text = blockText(block);
        const candidates = [];
        let representedByTitle = false;
        if (block.type === "heading" && levels.includes(block.level)) candidates.push({ title: text, level: block.level });
        if (strong && block.type === "paragraph" && block.children?.[0]?.type === "strong") candidates.push({ title: inlineText(block.children[0].children), level: 2 });
        if (block.type === "table") candidates.push({ title: block.headers.map(inlineText).join(" | ").slice(0, 160), level: 3 });
        if (block.type === "list") for (const item of block.items || []) {
          const bold = item.inline?.[0];
          const value = inlineText(item.inline);
          if (strong && bold?.type === "strong") candidates.push({ title: inlineText(bold.children), level: 2 });
          else if ((block.ordered ? ordered : listTitles) && value.length <= 80) candidates.push({ title: value.split(/[:：]/)[0], level: 3 });
        }
        candidates.forEach((candidate, index) => {
          const key = `${rootKey}:${ordinal}:${index}`;
          targets.set(key, { messageId: id, role: record.role, text: record.text, anchorText: record.anchorText, title: candidate.title,
            blockType: block.type, tableCells: block.type === "table" ? block.headers.map(inlineText) : undefined });
          items.push({ key, markerKey: key, groupKey: userKey, type: "ai", ...candidate, preview: candidate.title });
          if (block.type !== "heading") return;
          while (stack.length && stack.at(-1).level >= candidate.level) stack.pop();
          const parentNode = stack.at(-1)?.node || base;
          const node = { markerKey: key, sourceKey: key, parentKey: parentNode.markerKey, title: candidate.title, contents: [] };
          parentNode.contents.push({ type: "child", key });
          chapters.push(node); stack.push({ level: candidate.level, node }); current = node;
          representedByTitle = true;
        });
        if (!representedByTitle) current.contents.push({ type: "block", text, ast: block });
      });
    }
    return { items, chapters, targets };
  }

  async function search(query, { signal, offset = 0, limit = 100 } = {}) {
    const needle = normalizeIndexedText(query);
    const items = [];
    let total = 0;
    let budgetStart = performance.now();
    for (const id of order) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const record = records.get(id);
      if (needle && record.searchText.includes(needle)) {
        if (total >= offset && items.length < limit) {
          let count = 0; let cursor = 0;
          while ((cursor = record.searchText.indexOf(needle, cursor)) >= 0) { count++; cursor += needle.length; }
          items.push({ key: `index:${id}`, markerKey: `index:${id}`, type: "result", role: record.role,
            title: record.text.slice(0, 80), parts: indexedSnippet(record.text, needle), count });
        }
        total++;
      }
      if (performance.now() - budgetStart > 8) { await yieldTask(); budgetStart = performance.now(); }
    }
    return { items, total, hasMore: offset + items.length < total, revision };
  }

  return {
    ingest, getOutline, search, status,
    exportSnapshot() {
      return publicConversationSnapshot({ version: CONVERSATION_SNAPSHOT_VERSION, title, branch, records: order.map((id) => records.get(id)) });
    },
    restoreSnapshot(value) {
      const snapshot = publicConversationSnapshot(value);
      if (!snapshot) return false;
      records = new Map(snapshot.records.map((record) => [record.id, record]));
      order = snapshot.records.map((record) => record.id);
      reusableRecords = new Map(); title = snapshot.title; branch = snapshot.branch;
      phase = "loading"; error = ""; notify(); return true;
    },
    async reconcile(payload, options = {}) {
      const page = conversationPage(payload);
      if (page.previous || page.next) throw new Error("incomplete-chain");
      return ingest(payload, { ...options, replace: true });
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    begin() { phase = "loading"; error = ""; notify(); },
    reset() { records.clear(); reusableRecords.clear(); order = []; title = ""; branch = ""; phase = "loading"; error = ""; notify(); },
    finish() { reusableRecords.clear(); phase = "complete"; error = ""; notify(); },
    fail(reason) { error = reason; phase = records.size ? "partial" : "error"; notify(); },
    setTitle(value) { if (value && title !== value) { title = value; notify(); } },
    updateMessage(id, text) {
      const record = records.get(id);
      if (!record || record.text === text) return;
      records.set(id, { ...record, fingerprint: "", text, anchorText: normalizeAnchorText(text), searchText: normalizeIndexedText(text) }); notify();
    },
    dispose() { records.clear(); reusableRecords.clear(); order = []; listeners.clear(); }
  };
}
