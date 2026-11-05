// Gemini's public-share and signed-in RPCs use the same turn representation.
export function geminiRoute(value) {
  try {
    const url = new URL(value);
    if (url.hostname !== 'gemini.google.com') return null;
    const match = url.pathname.match(/^\/(?:u\/(\d+)\/)?(app|share)\/([a-zA-Z0-9_-]+)\/?$/);
    return match ? { account: match[1] || '', kind: match[2], id: match[3] } : null;
  } catch { return null; }
}
export function decodeGeminiRpc(text, rpc) {
  for (const line of text.replace(/^\)\]\}'/, '').trim().split('\n')) {
    if (!line.trim().startsWith('[')) continue;
    let batch;
    try { batch = JSON.parse(line); } catch { continue; }
    for (const entry of batch) {
      if (entry?.[0] === 'wrb.fr' && entry[1] === rpc) {
        if (typeof entry[2] !== 'string') throw new Error('conversation-unavailable');
        return JSON.parse(entry[2]);
      }
    }
  }
  throw new Error('unsupported-format');
}
// Fixed media slots only: do not traverse arbitrary metadata for URLs or text.
function richField(value, index) {
  if (!Array.isArray(value)) return value?.[String(index + 1)];
  const tail = value.at(-1);
  if (tail && !Array.isArray(tail) && typeof tail === 'object' && Object.hasOwn(tail, String(index + 1))) return tail[String(index + 1)];
  return value[index];
}
function safeImage(url, alt = '', dimensions = []) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    return { content_type: 'image_asset_pointer', asset_pointer: parsed.href, alt,
      ...(Number.isFinite(dimensions?.[0]) ? { width: dimensions?.[0] } : {}),
      ...(Number.isFinite(dimensions?.[1]) ? { height: dimensions?.[1] } : {}) };
  } catch { return null; }
}
function userParts(user) {
  const parts = typeof user?.[0] === 'string' ? [user[0]] : [];
  const seen = new Set();
  function visit(value, depth = 0) {
    if (!Array.isArray(value) || depth > 20) return;
    if (typeof value[2] === 'string' && typeof value[11] === 'string' && value[11].includes('/')) {
      const signature = `${value[2]}:${value[3]}`;
      if (seen.has(signature)) return;
      seen.add(signature);
      const image = value[11].startsWith('image/') ? safeImage(value[3], value[2], value[15]) : null;
      parts.push(image || `[Attachment: ${value[2]}]`); return;
    }
    for (const child of value) visit(child, depth + 1);
  }
  visit(user?.[4]);
  return parts;
}
function answerParts(answer) {
  const parts = typeof answer?.[1]?.[0] === 'string' ? [answer[1][0]] : [];
  const rich = answer?.[12];
  const seen = new Set();
  const add = image => { if (image && !seen.has(image.asset_pointer)) { parts.push(image); seen.add(image.asset_pointer); } };
  for (const image of richField(rich, 1) || []) add(safeImage(image?.[0]?.[0]?.[0], image?.[0]?.[4] || ''));
  for (const image of richField(rich, 7)?.[0] || []) add(safeImage(image?.[0]?.[3]?.[3], image?.[0]?.[3]?.[2] || ''));
  return parts;
}
export function geminiMessages(turns, conversationId, selected = new Set(turns.map(t => t?.[1]?.[2]).filter(Boolean))) {
  const messages = []; const seen = new Set();
  for (const turn of turns) {
    const id = turn?.[0]?.[1];
    if (typeof id !== 'string' || seen.has(id)) throw new Error('unsupported-format');
    if (conversationId && turn[0][0] !== conversationId) throw new Error('wrong-conversation');
    seen.add(id);
    const candidates = turn?.[3]?.[0];
    if (candidates != null && !Array.isArray(candidates)) throw new Error('unsupported-format');
    const answer = candidates?.find(c => selected.has(c?.[0])) || candidates?.[0];
    for (const [role, parts] of [['user', userParts(turn?.[2]?.[0])], ['assistant', answerParts(answer)]]) {
      if (!parts.length) continue;
      messages.push({ id: `gemini:${id}:${role}`, author: { role },
        content: { content_type: parts.some(part => typeof part !== 'string') ? 'multimodal_text' : 'text', parts } });
    }
  }
  return messages;
}
export async function readGeminiConversation({ route, rpc, signal, onPage }) {
  const payload = (messages, title = '') => ({ messages, title, page_info: { has_previous_page: false, has_next_page: false } });
  if (route.kind === 'share') {
    const data = await rpc('ujx1Bf', [null, route.id, [4]], signal);
    const root = data?.[0];
    if (root?.[3] !== route.id) throw new Error('wrong-conversation');
    if (!Array.isArray(root[1]) || !root[1].length) throw new Error('conversation-unavailable');
    await onPage(payload(geminiMessages(root[1]), root[2]?.[1] || ''), { replace: true });
    return;
  }
  const seen = new Set(); const cursors = new Set();
  // A newer turn references the candidate selected in the adjacent older turn.
  const selected = new Set();
  let cursor = null;
  for (let page = 0; page < 1000; page++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const data = await rpc('hNvQHb', [`c_${route.id}`, 20, cursor, 1, [0], [4], null, 1], signal);
    if (!Array.isArray(data?.[0])) throw new Error('unsupported-format');
    const added = [];
    for (const turn of data[0]) {
      const id = turn?.[0]?.[1];
      if (typeof id !== 'string' || turn?.[0]?.[0] !== `c_${route.id}`) throw new Error('wrong-conversation');
      if (turn?.[1]?.[2]) selected.add(turn[1][2]);
      if (!seen.has(id)) { seen.add(id); added.push(turn); }
    }
    await onPage(payload(geminiMessages(added.reverse(), `c_${route.id}`, selected)), { replace: page === 0, older: page > 0 });
    if (data[1] == null || data[1] === '') return;
    if (typeof data[1] !== 'string') throw new Error('unsupported-format');
    cursor = data[1];
    if (!added.length || cursors.has(cursor)) throw new Error('repeated-cursor');
    cursors.add(cursor);
  }
  throw new Error('incomplete-chain');
}
