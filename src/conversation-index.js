import { matchesSearch } from "./window-search.js";
import { parseChapterMarkdown } from "./chapter-markdown.js";
import { CONVERSATION_SNAPSHOT_VERSION, publicConversationSnapshot } from "./conversation-snapshot.js";
import { publicImageMessage } from "../public/src/chatgpt-image-data.js";
import { visitConversationImages } from "./conversation-images.js";

export function chatGptConversationId(value) {
  try {
    const url = new URL(value);
    if (!/^(chatgpt\.com|chat\.openai\.com)$/.test(url.hostname)) return "";
    return url.pathname.match(/^\/share\/([a-zA-Z0-9-]+)\/?$/)?.[1]
      || url.pathname.match(/\/c\/([a-zA-Z0-9-]+)(?:\/|$)/)?.[1] || "";
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

function inlineText(nodes = [], imagePlaceholder = "[Image]", imageLabelsOnly = false) {
  return nodes.map((node) => {
    if (node.type === "image") return imagePlaceholder ? imageLabelsOnly ? imagePlaceholder : node.alt || imagePlaceholder : "";
    return node.value ?? inlineText(node.children, imagePlaceholder, imageLabelsOnly);
  }).join("");
}

function blockText(block, imagePlaceholder = "[Image]", imageLabelsOnly = false, includeAttachments = true) {
  if (block.type === "image") return imageLabelsOnly ? imagePlaceholder : block.alt || imagePlaceholder;
  if (block.type === "attachment") return includeAttachments ? block.name : "";
  if (block.value != null) return block.value;
  if (block.type === "table") return [block.headers, ...block.rows].map((row) => row.map((cell) => inlineText(cell, imagePlaceholder, imageLabelsOnly)).join(" | ")).join("\n");
  if (block.items) return block.items.map((item) => [inlineText(item.inline, imagePlaceholder, imageLabelsOnly), ...(item.children || []).map((child) => blockText(child, imagePlaceholder, imageLabelsOnly, includeAttachments))].join("\n")).join("\n");
  if (block.blocks) return block.blocks.map((child) => blockText(child, imagePlaceholder, imageLabelsOnly, includeAttachments)).join("\n");
  return inlineText(block.children, imagePlaceholder, imageLabelsOnly);
}

function blockAnchorText(block) {
  if (block.type === "image") return "";
  if (block.type === "attachment") return block.name;
  if (block.type === "table") return [block.headers, ...block.rows].map((row) => row.map((cell) => inlineText(cell, "")).join("")).join("");
  if (block.items) return block.items.map((item) => inlineText(item.inline, "") + (item.children || []).map(blockAnchorText).join("")).join("");
  if (block.blocks) return block.blocks.map(blockAnchorText).join("");
  return block.value ?? inlineText(block.children, "");
}

export function normalizeAnchorText(value) {
  // ChatGPT includes this memory-citation token in API text but does not paint it.
  return normalizeIndexedText(value).replace(/\uE200memcite\uE201/gu, "").replace(/\s/gu, "");
}

export function messageText(message) {
  const content = message?.content || {};
  if (!['text', 'multimodal_text'].includes(content.content_type)) return "";
  return (content.parts || []).map((part) => typeof part === "string" ? part : part?.content_type === "file_asset_pointer" ? part.file_name : "[Attachment]").join("\n");
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
  if (!needle || !matchesSearch(query, text)) return [{ text: text.slice(0, 160), match: false }];
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
  if (hit < 0) {
    const ranges = [];
    let cursor = 0;
    for (const character of needle.replace(/\s/gu, "")) {
      const at = normalized.indexOf(character, cursor);
      if (at < 0) break;
      ranges.push([offsets[at][0], offsets[at + character.length - 1][1]]);
      cursor = at + character.length;
    }
    const start = ranges[0][0];
    const limit = Math.min(text.length, start + 160);
    const parts = [];
    let position = Math.max(0, start - 40);
    if (position) parts.push({ text: "…", match: false });
    for (const [from, to] of ranges) {
      if (from >= limit) break;
      if (from > position) parts.push({ text: text.slice(position, from), match: false });
      if (to > position) parts.push({ text: text.slice(Math.max(position, from), to), match: true });
      position = Math.max(position, to);
    }
    parts.push({ text: text.slice(position, limit) + (limit < text.length ? "…" : ""), match: false });
    return parts;
  }
  const start = offsets[hit]?.[0] ?? 0;
  const end = offsets[hit + needle.length - 1]?.[1] ?? start;
  return [
    { text: `${start > 60 ? "…" : ""}${text.slice(Math.max(0, start - 60), start)}`, match: false },
    { text: text.slice(start, end), match: true },
    { text: `${text.slice(end, end + 100)}${end + 100 < text.length ? "…" : ""}`, match: false }
  ];
}

function recordFor(source, previous, parseMarkdown, imagePlaceholder) {
  const message = publicImageMessage(source);
  const role = message?.author?.role;
  if (!message) return null;
  const markdown = messageText(message);
  if (!markdown && !['text', 'multimodal_text'].includes(message.content?.content_type)) return null;
  // Compare exact source as well as its fingerprint; a hash collision must never
  // make an edited message look unchanged. A streaming patch clears the hash.
  const parts = message.content.parts;
  const hasMedia = parts.some((part) => ["image_asset_pointer", "file_asset_pointer"].includes(part?.content_type));
  const sourceText = hasMedia ? JSON.stringify(parts) : markdown;
  let hash = 2166136261;
  for (let i = 0; i < sourceText.length; i++) hash = Math.imul(hash ^ sourceText.charCodeAt(i), 16777619);
  const fingerprint = `${role}:${sourceText.length}:${hash >>> 0}`;
  if (!hasMedia && previous?.fingerprint === fingerprint && previous.markdown === markdown && previous.role === role)
    return { ...previous, time: message.create_time ?? null };
  const parse = (value) => parseMarkdown(value) || [{ type: "paragraph", children: [{ type: "text", value }] }];
  const blocks = [];
  if (hasMedia) {
    let textParts = [];
    const flush = () => { if (textParts.length) { blocks.push(...parse(textParts.join("\n"))); textParts = []; } };
    for (const part of parts) {
      if (part?.content_type === "image_asset_pointer") {
        flush(); blocks.push({ type: "image", src: part.asset_pointer, alt: part.alt || "",
          ...(part.width ? { width: part.width } : {}), ...(part.height ? { height: part.height } : {}),
          ...(part.mime_type ? { mimeType: part.mime_type } : {}) });
      } else if (part?.content_type === "file_asset_pointer") {
        flush(); blocks.push({ type: "attachment", name: part.file_name,
          ...(part.mime_type ? { mimeType: part.mime_type } : {}), ...(part.url ? { url: part.url } : {}) });
      } else textParts.push(typeof part === "string" ? part : "[Attachment]");
    }
    flush();
  } else blocks.push(...parse(markdown));
  let ordinal = 0;
  visitConversationImages(blocks, (image) => { image.imageKey = `${message.id}:image:${ordinal++}`; });
  let attachmentOrdinal = 0;
  visitAttachments(blocks, (attachment) => { attachment.attachmentKey = `${message.id}:attachment:${attachmentOrdinal++}`; });
  if (hasMedia && previous?.fingerprint === fingerprint && previous.markdown === markdown && previous.role === role
    && JSON.stringify(previous.blocks) === JSON.stringify(blocks)) return { ...previous, time: message.create_time ?? null };
  const text = blocks.map((block) => blockText(block, imagePlaceholder)).join("\n\n");
  return { id: message.id, role, time: message.create_time ?? null, markdown, text, blocks, fingerprint,
    anchorText: normalizeAnchorText(blocks.map(blockAnchorText).join("")), searchText: normalizeIndexedText(text) };
}

function visitAttachments(nodes, visit) {
  for (const node of nodes || []) {
    if (node.type === "attachment") visit(node);
    if (node.blocks) visitAttachments(node.blocks, visit);
    for (const item of node.items || []) visitAttachments(item.children, visit);
  }
}

function userMessageTitle(record, imagePlaceholder) {
  const text = record.blocks.map((block) => blockText(block, "", true, false).replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n\n");
  if (text) return text.slice(0, 160);
  const names = []; visitAttachments(record.blocks, (attachment) => names.push(attachment.name));
  if (names.length) return names.join("\n\n").slice(0, 160);
  let hasImages = false; visitConversationImages(record.blocks, () => { hasImages = true; });
  return hasImages ? imagePlaceholder : "";
}

function structuredRecordFor(source, previous, imagePlaceholder) {
  if (typeof source?.id !== "string" || !source.id || !["user", "assistant"].includes(source.role) || !Array.isArray(source.blocks)
    || source.replyTo !== undefined && typeof source.replyTo !== "string") throw new Error("unsupported-format");
  const blocks = structuredClone(source.blocks);
  let imageOrdinal = 0; let attachmentOrdinal = 0;
  visitConversationImages(blocks, (image) => { image.imageKey = `${source.id}:image:${imageOrdinal++}`; });
  visitAttachments(blocks, (attachment) => { attachment.attachmentKey = `${source.id}:attachment:${attachmentOrdinal++}`; });
  const projected = publicConversationSnapshot({ version: CONVERSATION_SNAPSHOT_VERSION, title: "", branch: "", records: [{
    id: source.id, role: source.role, time: source.time ?? null, blocks,
    markdown: typeof source.markdown === "string" ? source.markdown : "",
    text: "", anchorText: "", searchText: "", fingerprint: "structured",
    ...(typeof source.replyTo === "string" ? { replyTo: source.replyTo } : {})
  }] })?.records[0];
  if (!projected) throw new Error("unsupported-format");
  const signature = JSON.stringify([projected.role, projected.markdown, projected.blocks, projected.replyTo]);
  let hash = 2166136261;
  for (let i = 0; i < signature.length; i++) hash = Math.imul(hash ^ signature.charCodeAt(i), 16777619);
  projected.fingerprint = `structured:${signature.length}:${hash >>> 0}`;
  if (previous?.fingerprint === projected.fingerprint && previous.markdown === projected.markdown && previous.role === projected.role
    && previous.replyTo === projected.replyTo && JSON.stringify(previous.blocks) === JSON.stringify(projected.blocks))
    return previous.time === projected.time ? previous : { ...previous, time: projected.time };
  projected.text = projected.blocks.map((block) => blockText(block, imagePlaceholder)).join("\n\n");
  projected.anchorText = normalizeAnchorText(projected.blocks.map(blockAnchorText).join(""));
  projected.searchText = normalizeIndexedText(projected.text);
  return projected;
}

// A mounted window may be anywhere in the history. Existing IDs keep their
// positions; only new runs are inserted beside their known neighboring IDs.
function mergeMountedOrder(order, incoming, older) {
  const positions = new Map(order.map((id, index) => [id, index]));
  if (!incoming.some((id) => positions.has(id))) return older ? [...incoming, ...order] : [...order, ...incoming];
  const before = new Map(); const after = new Map();
  let previous = null; let pending = [];
  const place = (next) => {
    if (!pending.length) return;
    const useNext = next !== null && (previous === null || positions.get(next) > positions.get(previous));
    const map = useNext ? before : after; const anchor = useNext ? next : previous;
    map.set(anchor, [...(map.get(anchor) || []), ...pending]); pending = [];
  };
  for (const id of incoming) {
    if (positions.has(id)) { place(id); previous = id; }
    else pending.push(id);
  }
  place(null);
  return order.flatMap((id) => [...(before.get(id) || []), id, ...(after.get(id) || [])]);
}

export function createConversationIndex({ platform = "chatgpt", yieldTask = () => new Promise((resolve) => setTimeout(resolve, 0)), parseMarkdown = parseChapterMarkdown, imagePlaceholder = "[Image]" } = {}) {
  let records = new Map();
  let reusableRecords = new Map();
  let order = [];
  let title = "";
  let revision = 0;
  let phase = "loading";
  let coverage = "loaded";
  let branch = "";
  let error = "";
  const listeners = new Set();
  const notify = () => { revision++; listeners.forEach((listener) => listener(status())); };
  const status = () => ({ phase, coverage, title, count: records.size, total: phase === "complete" && coverage === "complete" ? records.size : null, revision, branch, error });

  async function ingest(payload, { older = false, replace = false, signal, complete = false } = {}) {
    const page = conversationPage(payload);
    if (replace) reusableRecords = records;
    const normalized = [];
    let budgetStart = performance.now();
    for (const message of page.messages) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const record = recordFor(message, records.get(message.id) || reusableRecords.get(message.id), parseMarkdown, imagePlaceholder);
      if (record) normalized.push(record);
      if (performance.now() - budgetStart > 8) { await yieldTask(); budgetStart = performance.now(); }
    }
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (replace) { records = new Map(); order = []; }
    const ids = []; const incoming = new Set();
    for (const record of normalized) {
      if (!incoming.has(record.id)) { ids.push(record.id); incoming.add(record.id); }
      records.set(record.id, record);
    }
    order = older ? [...ids, ...order.filter((id) => !incoming.has(id))] : [...order.filter((id) => !incoming.has(id)), ...ids];
    if (typeof payload.title === "string") title = payload.title;
    branch = replace ? page.branch : page.branch || branch;
    if (complete) reusableRecords.clear();
    phase = complete ? "complete" : "loading"; coverage = complete ? "complete" : "loaded"; error = "";
    notify();
    return page;
  }

  async function upsertMessages(messages, { complete = true, replace = false, older = false, coverage: nextCoverage = "loaded", signal } = {}) {
    if (!Array.isArray(messages)) throw new Error("unsupported-format");
    const normalized = new Map(); let budgetStart = performance.now();
    for (const message of messages) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const record = structuredRecordFor(message, normalized.get(message?.id) || records.get(message?.id), imagePlaceholder);
      normalized.set(record.id, record);
      if (performance.now() - budgetStart > 8) { await yieldTask(); budgetStart = performance.now(); }
    }
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const ids = [...normalized.keys()];
    const nextOrder = replace ? ids : mergeMountedOrder(order, ids, older);
    const nextPhase = complete ? "complete" : "loading";
    nextCoverage = nextCoverage === "complete" ? "complete" : "loaded";
    const changed = nextPhase !== phase || nextCoverage !== coverage || Boolean(error) || nextOrder.length !== order.length
      || nextOrder.some((id, index) => id !== order[index]) || [...normalized].some(([id, record]) => records.get(id) !== record);
    if (replace) { records = new Map(); reusableRecords.clear(); }
    for (const [id, record] of normalized) records.set(id, record);
    order = nextOrder; phase = nextPhase; coverage = nextCoverage; error = "";
    if (changed) notify();
    return status();
  }

  function getOutline(config = {}) {
    const items = [];
    const chapters = [];
    const targets = new Map();
    const chapterByKey = new Map();
    const replyGroups = new Set();
    let userKey = "";
    const levels = config.enabledLevelsByPlatform?.[platform] || [1, 2, 3];
    const strong = config.enabledStrongByPlatform?.[platform] !== false;
    const listTitles = config.enabledUnorderedListByPlatform?.[platform] !== false;
    const ordered = Boolean(config.enabledOrderedListByPlatform?.[platform]);
    // Explicit source relationships may refer to a user outside the incoming
    // mounted window, so roots are addressable before processing answer blocks.
    for (const id of order) {
      const record = records.get(id);
      if (record.role !== "user") continue;
      const rootKey = `index:${id}`;
      chapterByKey.set(rootKey, { markerKey: rootKey, sourceKey: rootKey, parentKey: "",
        title: userMessageTitle(record, imagePlaceholder), synthetic: true, contents: [] });
    }
    for (const id of order) {
      const record = records.get(id);
      const rootKey = `index:${id}`;
      const rootTitle = record.role === "user" ? chapterByKey.get(rootKey).title : "";
      const ownerKey = typeof record.replyTo === "string" ? record.replyTo ? `index:${record.replyTo}` : "" : userKey;
      const parent = chapterByKey.get(ownerKey);
      const groupKey = parent ? ownerKey : "";
      const root = record.role === "user" ? chapterByKey.get(rootKey)
        : { markerKey: rootKey, sourceKey: rootKey, parentKey: groupKey, title: rootTitle, synthetic: true, contents: [] };
      targets.set(rootKey, { messageId: id, role: record.role, text: record.text, anchorText: record.anchorText, title: rootTitle });
      if (record.role === "user") {
        userKey = rootKey; root.parentKey = "";
        root.synthetic = true;
        const images = []; visitConversationImages(record.blocks, (image) => images.push(image));
        const attachments = []; visitAttachments(record.blocks, (attachment) => attachments.push(attachment));
        const contents = [];
        if (images.length || attachments.length) {
          for (const block of record.blocks) contents.push({ type: "block", text: blockText(block, imagePlaceholder), ast: block });
          for (const image of images) targets.set(`index:${image.imageKey}`, { messageId: id, role: record.role,
            text: record.text, anchorText: record.anchorText, title: image.alt || imagePlaceholder, blockType: "image", imageKey: image.imageKey,
            imageOrdinal: Number(image.imageKey.split(":").at(-1)) });
          for (const attachment of attachments) targets.set(`index:${attachment.attachmentKey}`, { messageId: id, role: record.role,
            text: record.text, anchorText: record.anchorText, title: attachment.name, blockType: "attachment", attachmentKey: attachment.attachmentKey,
            attachmentOrdinal: Number(attachment.attachmentKey.split(":").at(-1)) });
        } else contents.push({ type: "block", text: record.text, ast: { type: "paragraph", children: [{ type: "text", value: record.text }] } });
        root.contents.unshift(...contents);
        const imageUrls = [...new Set(images.map((image) => image.src).filter((src) => /^(?:https:\/\/|blob:https:\/\/|data:image\/(?:png|apng|jpe?g|gif|webp|avif|bmp|x-icon)(?:;|,))/i.test(src)))];
        items.push({ key: rootKey, markerKey: rootKey, groupKey: rootKey, type: "user", title: rootTitle || "[Attachment]", preview: rootTitle, isExpanded: true,
          imageUrls, thumbnailSrc: imageUrls[0] || "", imageCount: images.length, attachments,
          isImageOnly: images.length > 0 && !attachments.length && !record.blocks.map((block) => blockText(block, "", true)).join("").trim() });
        chapters.push(root);
        continue;
      }
      if (record.text.trim() || record.blocks.length) replyGroups.add(groupKey);
      // Like DOM chapters, an answer belongs to its user's chapter, so preamble
      // and code-only answers need no untitled "Full text" wrapper. Only an
      // answer without a user message keeps its own synthetic root.
      if (!parent) chapters.push(root);
      const base = parent || root;
      let current = base;
      const stack = [];
      const anchorOrdinals = new Map();
      record.blocks.forEach((block, ordinal) => {
        const text = blockText(block, imagePlaceholder);
        const candidates = [];
        let representedByTitle = false;
        if (block.type === "heading" && levels.includes(block.level)) candidates.push({ title: text, level: block.level });
        if (strong && block.type === "paragraph" && block.children?.[0]?.type === "strong") candidates.push({ title: inlineText(block.children[0].children), level: 2 });
        if (block.type === "table") candidates.push({ title: block.headers.map((cell) => inlineText(cell, imagePlaceholder)).join(" | ").slice(0, 160), level: 3 });
        visitAttachments([block], (attachment) => candidates.push({ title: attachment.name, level: 3, attachment }));
        if (block.type === "list") for (const item of block.items || []) {
          if ((item.children || []).some((child) => ["list", "table", "codeBlock", "quote"].includes(child.type))) continue;
          const bold = item.inline?.[0];
          if (bold?.type === "strong") {
            const title = inlineText(bold.children).replace(/\s+/g, " ").trim();
            if (strong && title && title.length <= 80) candidates.push({ title, level: 2 });
            continue;
          }
          if (!(block.ordered ? ordered : listTitles)) continue;
          const value = inlineText(item.inline).replace(/\s+/g, " ").trim();
          if (!value || value.length > 180) continue;
          const separated = value.match(/^([^:：]{2,80})[:：]\s*\S/);
          const title = separated ? separated[1].trim() : value.length <= 48 && !/[。！？.!?；;，,]\s*\S/.test(value) ? value : "";
          if (title) candidates.push({ title, level: 3 });
        }
        visitConversationImages([block], (image) => candidates.push({ title: image.alt || imagePlaceholder, level: 3, image }));
        candidates.forEach((candidate, index) => {
          const key = candidate.image ? `index:${candidate.image.imageKey}` : candidate.attachment ? `index:${candidate.attachment.attachmentKey}` : `${rootKey}:${ordinal}:${index}`;
          const blockType = candidate.image ? "image" : candidate.attachment ? "attachment" : block.type;
          const occurrence = JSON.stringify([blockType, normalizeAnchorText(candidate.title)]);
          const anchorOrdinal = anchorOrdinals.get(occurrence) || 0;
          anchorOrdinals.set(occurrence, anchorOrdinal + 1);
          targets.set(key, { messageId: id, role: record.role, text: record.text, anchorText: record.anchorText, title: candidate.title,
            blockType, blockOrdinal: ordinal, ordinal: anchorOrdinal, imageKey: candidate.image?.imageKey,
            ...(candidate.image ? { imageOrdinal: Number(candidate.image.imageKey.split(":").at(-1)) } : {}),
            attachmentKey: candidate.attachment?.attachmentKey,
            ...(candidate.attachment ? { attachmentOrdinal: Number(candidate.attachment.attachmentKey.split(":").at(-1)) } : {}),
            tableCells: block.type === "table" ? block.headers.map((cell) => inlineText(cell, "")) : undefined });
          items.push({ key, markerKey: key, groupKey, type: "ai", ...candidate, preview: candidate.title });
          if (candidate.image || candidate.attachment || block.type !== "heading") return;
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
    const recognizedGroups = new Set(items.filter((item) => item.type === "ai").map((item) => item.groupKey));
    const recognitionHintGroups = [...replyGroups].filter((key) => !recognizedGroups.has(key));
    return { items, chapters, targets, recognitionHintGroups };
  }

  async function search(query, { signal, offset = 0, limit = 100 } = {}) {
    const needle = normalizeIndexedText(query);
    const items = [];
    let total = 0;
    let budgetStart = performance.now();
    for (const id of order) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const record = records.get(id);
      if (needle && matchesSearch(needle, record.searchText)) {
        if (total >= offset && items.length < limit) {
          let count = 0; let cursor = 0;
          while ((cursor = record.searchText.indexOf(needle, cursor)) >= 0) { count++; cursor += needle.length; }
          items.push({ key: `index:${id}`, markerKey: `index:${id}`, type: "result", role: record.role,
            title: record.text.slice(0, 80), parts: indexedSnippet(record.text, needle), count: Math.max(1, count) });
        }
        total++;
      }
      if (performance.now() - budgetStart > 8) { await yieldTask(); budgetStart = performance.now(); }
    }
    return { items, total, hasMore: offset + items.length < total, revision };
  }

  return {
    ingest, upsertMessages, getOutline, search, status,
    exportConversation(scope) {
      if (phase !== "complete" || order.some((id) => !records.get(id)?.fingerprint)) return null;
      return { title, scope: scope === "loaded" || coverage !== "complete" ? "loaded" : "complete", messages: order.map((id) => {
        const { role, markdown, text, blocks } = records.get(id);
        return { role, markdown, text, blocks };
      }) };
    },
    image(imageKey) {
      const messageId = typeof imageKey === "string" ? imageKey.slice(0, imageKey.lastIndexOf(":image:")) : "";
      let found = null;
      const record = records.get(messageId);
      if (record) visitConversationImages(record.blocks, (image) => { if (image.imageKey === imageKey) found = image; });
      return found;
    },
    exportSnapshot() {
      return publicConversationSnapshot({ version: CONVERSATION_SNAPSHOT_VERSION, title, branch, coverage, records: order.map((id) => records.get(id)) });
    },
    restoreSnapshot(value) {
      const snapshot = publicConversationSnapshot(value);
      if (!snapshot) return false;
      records = new Map(snapshot.records.map((record) => [record.id, record]));
      order = snapshot.records.map((record) => record.id);
      reusableRecords = new Map(); title = snapshot.title; branch = snapshot.branch;
      phase = "loading"; coverage = snapshot.coverage || "loaded"; error = ""; notify(); return true;
    },
    async reconcile(payload, options = {}) {
      const page = conversationPage(payload);
      if (page.previous || page.next) throw new Error("incomplete-chain");
      return ingest(payload, { ...options, replace: true });
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    begin() { phase = "loading"; error = ""; notify(); },
    reset() { records.clear(); reusableRecords.clear(); order = []; title = ""; branch = ""; phase = "loading"; coverage = "loaded"; error = ""; notify(); },
    finish() { reusableRecords.clear(); phase = "complete"; coverage = "complete"; error = ""; notify(); },
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
