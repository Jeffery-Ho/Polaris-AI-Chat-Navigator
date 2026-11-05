// Shares use a server loader response, independent of the authenticated chat
// history API. HTML streams remain a compatibility path. Decode data only.
export async function loadSharedConversation(shareId, { request = globalThis.fetch, signal } = {}) {
  if (!/^[a-zA-Z0-9-]+$/.test(shareId)) throw new Error("wrong-conversation");
  const path = `/share/${encodeURIComponent(shareId)}`;
  const routes = encodeURIComponent("routes/share.$shareId.($action)");
  const urls = [`${path}.data?_routes=${routes}`, path];
  let historicalRequests = 0;
  let stage = "shared-loader"; let httpStatus = 0; let responseFormat = "other";
  async function get(url, nextStage, headers) {
    signal?.throwIfAborted(); stage = nextStage; httpStatus = 0; responseFormat = "other";
    historicalRequests++;
    const response = await request(url, { credentials: "include", signal, ...(headers ? { headers } : {}) });
    signal?.throwIfAborted();
    httpStatus = response.status;
    const type = response.headers.get("content-type") || "";
    responseFormat = type.includes("json") ? "json" : type.includes("html") ? "html" : type.includes("x-script") ? "script" : "other";
    return response;
  }
  async function json(response) {
    if (!response.ok) throw new Error(`http-${response.status}`);
    let value;
    try { value = await response.json(); } catch { throw new Error("unsupported-format"); }
    signal?.throwIfAborted(); return value;
  }
  try {
    for (let attempt = 0; attempt < urls.length; attempt++) {
      const response = await get(urls[attempt], attempt ? "shared-html" : "shared-loader");
      if (!response.ok) {
        if (attempt === 0 && [404, 405, 501].includes(response.status)) continue;
        throw new Error(`http-${response.status}`);
      }
      const body = await response.text(); signal?.throwIfAborted();
      // The logged-in app sends a reload instruction here instead of a server
      // snapshot. Use its observed share API with the existing page session.
      if (attempt === 0 && response.status === 202 && isSharedRouteReload(body)) {
        const session = await json(await get("/api/auth/session", "shared-session"));
        if (typeof session?.accessToken !== "string" || !session.accessToken) throw new Error("http-401");
        const payload = await json(await get(`/backend-api${path}`, "shared-api", { Authorization: `Bearer ${session.accessToken}` }));
        return { payload: normalizeSharedConversation(payload, shareId), historicalRequests };
      }
      try { return { payload: readSharedConversationResponse(body, shareId), historicalRequests }; }
      catch (error) { if (attempt === 0 && error.message === "unsupported-format") continue; throw error; }
    }
    throw new Error("unsupported-format");
  } catch (error) {
    Object.assign(error, { stage, httpStatus, responseFormat }); throw error;
  }
}

function isSharedRouteReload(body) {
  try {
    const table = JSON.parse(body);
    if (!Array.isArray(table) || table[0]?.[0] !== "SingleFetchRedirect") return false;
    const fields = Object.fromEntries(Object.entries(table[table[0][1]]).map(([key, ref]) => [table[Number(key.slice(1))], table[ref]]));
    return fields.redirect === "?" && fields.status === 307 && fields.reload === true;
  } catch { return false; }
}

export function readSharedConversationHtml(html, shareId) { return readSharedConversationResponse(html, shareId); }

export function readSharedConversationResponse(body, shareId) {
  let wrongConversation = false;
  const tables = [];
  const text = body.trim();
  if (text.startsWith("[")) {
    try { tables.push(JSON.parse(text)); }
    catch { for (const line of text.split(/\r?\n/)) { try { tables.push(JSON.parse(line)); } catch { /* Skip unsupported stream records. */ } } }
  } else for (const match of text.matchAll(/\.enqueue\(("(?:[^"\\]|\\.)*")\)/g)) {
    try { tables.push(JSON.parse(JSON.parse(match[1]))); } catch { /* Other inline data is not a snapshot. */ }
  }
  for (const table of tables) {
    if (!Array.isArray(table)) continue;
    const fields = (value) => Object.fromEntries(Object.entries(value).map(([key, ref]) => [key.startsWith("_") ? table[Number(key.slice(1))] : key, ref]));
    const snapshots = table.filter((value) => value && !Array.isArray(value) && typeof value === "object")
      .map(fields).filter((value) => Object.hasOwn(value, "mapping") && Object.hasOwn(value, "current_node") && Object.hasOwn(value, "linear_conversation"));
    const candidates = snapshots.filter((value) => table[value.conversation_id] === shareId);
    if (!candidates.length) { if (snapshots.length) wrongConversation = true; continue; }
    if (candidates.length !== 1) throw new Error("unsupported-format");
    const decoded = new Map();
    function read(ref, depth = 0) {
      if (!Number.isInteger(ref) || ref < 0) return null;
      if (ref >= table.length || depth > 128) throw new Error("unsupported-format");
      if (decoded.has(ref)) return decoded.get(ref);
      const value = table[ref];
      if (!value || typeof value !== "object") return value;
      const result = Array.isArray(value) ? [] : Object.create(null); decoded.set(ref, result);
      if (Array.isArray(value)) value.forEach((item) => result.push(read(item, depth + 1)));
      else for (const [key, item] of Object.entries(fields(value))) result[key] = read(item, depth + 1);
      return result;
    }
    const candidate = candidates[0];
    const mapping = read(candidate.mapping);
    const current = read(candidate.current_node);
    if (!mapping || Array.isArray(mapping) || typeof current !== "string" || !current) throw new Error("unsupported-format");
    return normalizeSharedConversation({ conversation_id: shareId, title: read(candidate.title) || "", current_node: current, mapping }, shareId);
  }
  throw new Error(wrongConversation ? "wrong-conversation" : "unsupported-format");
}

export function normalizeSharedConversation(payload, shareId) {
  if (payload?.conversation_id !== shareId) throw new Error("wrong-conversation");
  if (!payload.mapping || Array.isArray(payload.mapping) || typeof payload.mapping !== "object"
    || typeof payload.current_node !== "string" || !payload.current_node) throw new Error("unsupported-format");
  // Copy nodes before deriving omitted parents: the host may still own and
  // render this server model, so normalizing it must never mutate React state.
  const mapping = Object.fromEntries(Object.entries(payload.mapping).map(([id, node]) => {
    if (!node || typeof node !== "object" || (node.children != null && !Array.isArray(node.children))) throw new Error("unsupported-format");
    return [id, { ...node }];
  }));
  const parents = new Map();
  for (const [id, node] of Object.entries(mapping)) for (const child of node.children || []) {
    if (parents.has(child) && parents.get(child) !== id) throw new Error("incomplete-chain");
    parents.set(child, id);
  }
  for (const [id, node] of Object.entries(mapping)) if (!Object.hasOwn(node, "parent")) node.parent = parents.get(id) || null;
  if (Object.values(mapping).filter((node) => node.parent == null).length !== 1) throw new Error("incomplete-chain");
  const seen = new Set(); let key = payload.current_node;
  while (key) {
    if (seen.has(key) || !mapping[key]) throw new Error("incomplete-chain");
    seen.add(key); key = mapping[key].parent;
  }
  return { conversation_id: shareId, title: payload.title || "", current_node: payload.current_node, mapping };
}
