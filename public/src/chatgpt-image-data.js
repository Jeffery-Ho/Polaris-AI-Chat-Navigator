// Fixed public projection shared by the page bridge and the message index.
export function publicImagePart(value) {
  if (value?.content_type !== "image_asset_pointer" || typeof value.asset_pointer !== "string") return null;
  const image = { content_type: "image_asset_pointer", asset_pointer: value.asset_pointer, alt: typeof value.alt === "string" ? value.alt : "" };
  for (const key of ["width", "height"]) if (Number.isFinite(value[key]) && value[key] > 0) image[key] = value[key];
  if (typeof value.mime_type === "string") image.mime_type = value.mime_type;
  return image;
}

export function publicImageMessage(value) {
  const role = value?.author?.role;
  if (!value?.id || !["user", "assistant", "tool"].includes(role) || value.metadata?.is_visually_hidden_from_conversation
    || value.recipient && value.recipient !== "all"
    || value.channel && !(role === "tool" ? ["final", "commentary"].includes(value.channel) : value.channel === "final")) return null;
  const parts = (Array.isArray(value.content?.parts) ? value.content.parts : []).map((part) => typeof part === "string" ? part : publicImagePart(part));
  const visible = role === "tool" ? parts.filter((part) => part?.content_type === "image_asset_pointer") : parts;
  if (role === "tool" && (!visible.length || value.content?.content_type !== "multimodal_text")) return null;
  return { id: value.id, author: { role: role === "tool" ? "assistant" : role }, create_time: value.create_time,
    content: { content_type: value.content?.content_type, parts: visible } };
}

