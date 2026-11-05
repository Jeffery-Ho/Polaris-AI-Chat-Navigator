// Structural fixture from the supplied share: values and ids are synthetic.
export const imagePart = (id = "one", extra = {}) => ({ content_type: "image_asset_pointer",
  asset_pointer: `sediment://file_${id}`, width: 2570, height: 612, mime_type: "image/png", ...extra });
export const imageMessage = (id = "picture", extra = {}) => ({ id, author: { role: "tool", name: "image-tool" }, channel: "final", recipient: "all",
  content: { content_type: "multimodal_text", parts: [imagePart()] }, ...extra });
export const imagePage = (messages) => ({ conversation_id: "one", title: "Image test", messages,
  page_info: { has_previous_page: false, has_next_page: false } });

// Exact protocol-only response observed in Dia WORK: HTTP 202, no chat content.
export const sharedReloadData = '[["SingleFetchRedirect",1],{"_2":3,"_4":5,"_6":7,"_8":9,"_10":7},"redirect","?","status",307,"revalidate",false,"reload",true,"replace"]';

export function sharedData(payload) {
  const table = [];
  function encode(value) {
    if (value == null) return -1;
    const index = table.length; table.push(null);
    table[index] = Array.isArray(value) ? value.map(encode) : typeof value === "object"
      ? Object.fromEntries(Object.entries(value).map(([key, item]) => [`_${encode(key)}`, encode(item)])) : value;
    return index;
  }
  encode({ loaderData: { share: payload } });
  return JSON.stringify(table);
}

export function sharedHtml(payload) {
  return `<script>window.__reactRouterContext.streamController.enqueue(${JSON.stringify(sharedData(payload))});</script>`;
}

export function sharedImagePayload() {
  return { title: "Shared image test", conversation_id: "share-one", current_node: "picture", linear_conversation: [], mapping: {
    root: { id: "root", children: ["u"] },
    u: { id: "u", children: ["picture", "alternate"], message: { id: "u", author: { role: "user" }, content: { content_type: "text", parts: ["Shared question"] } } },
    picture: { id: "picture", children: [], message: imageMessage() },
    alternate: { id: "alternate", children: [], message: imageMessage("alternate") }
  } };
}
