// Bump when the public-record projection or Markdown parser changes.
export const CONVERSATION_SNAPSHOT_VERSION = 1;

function inlineNodes(nodes, depth) {
  if (!Array.isArray(nodes) || depth > 128) throw new Error("invalid-ast");
  return nodes.map((node) => {
    if (["text", "code"].includes(node?.type) && typeof node.value === "string") return { type: node.type, value: node.value };
    if (node?.type === "break") return { type: "break" };
    if (["strong", "em", "del", "link"].includes(node?.type)) {
      const result = { type: node.type, children: inlineNodes(node.children, depth + 1) };
      if (node.type === "link") { if (typeof node.href !== "string") throw new Error("invalid-ast"); result.href = node.href; }
      return result;
    }
    throw new Error("invalid-ast");
  });
}

function blocks(nodes, depth = 0) {
  if (!Array.isArray(nodes) || depth > 128) throw new Error("invalid-ast");
  return nodes.map((node) => {
    if (node?.type === "paragraph" || node?.type === "heading" && Number.isInteger(node.level) && node.level >= 1 && node.level <= 6)
      return { type: node.type, ...(node.type === "heading" ? { level: node.level } : {}), children: inlineNodes(node.children, depth + 1) };
    if (node?.type === "rule") return { type: "rule" };
    if (node?.type === "codeBlock" && typeof node.value === "string") return { type: node.type, value: node.value };
    if (node?.type === "quote") return { type: node.type, blocks: blocks(node.blocks, depth + 1) };
    if (node?.type === "table" && Array.isArray(node.headers) && Array.isArray(node.rows))
      return { type: node.type, headers: node.headers.map((cell) => inlineNodes(cell, depth + 1)), rows: node.rows.map((row) => {
        if (!Array.isArray(row)) throw new Error("invalid-ast"); return row.map((cell) => inlineNodes(cell, depth + 1));
      }) };
    if (node?.type === "list" && typeof node.ordered === "boolean" && Array.isArray(node.items)) return {
      type: node.type, ordered: node.ordered, items: node.items.map((item) => ({ inline: inlineNodes(item.inline, depth + 1),
        children: blocks(item.children, depth + 1), ...(typeof item.checked === "boolean" ? { checked: item.checked } : {}) }))
    };
    throw new Error("invalid-ast");
  });
}

export function validConversationSnapshot(snapshot) {
  if (snapshot?.version !== CONVERSATION_SNAPSHOT_VERSION || typeof snapshot.title !== "string"
    || typeof snapshot.branch !== "string" || !Array.isArray(snapshot.records)) return false;
  const ids = new Set();
  for (const record of snapshot.records) {
    if (!record || typeof record.id !== "string" || !record.id || ids.has(record.id)
      || !["user", "assistant"].includes(record.role)
      || !["markdown", "text", "anchorText", "searchText", "fingerprint"].every((key) => typeof record[key] === "string")
      || !record.fingerprint || !Array.isArray(record.blocks)
      || !record.blocks.every((block) => block && typeof block.type === "string")) return false;
    ids.add(record.id);
  }
  return true;
}

// Persist a fixed public projection, never arbitrary API response fields.
export function publicConversationSnapshot(snapshot) {
  if (!validConversationSnapshot(snapshot)) return null;
  try {
    return {
      version: snapshot.version, title: snapshot.title, branch: snapshot.branch,
      records: snapshot.records.map(({ id, role, time, markdown, text, blocks: ast, anchorText, searchText, fingerprint }) =>
        ({ id, role, time: typeof time === "number" ? time : null, markdown, text, blocks: blocks(ast), anchorText, searchText, fingerprint }))
    };
  } catch { return null; }
}
