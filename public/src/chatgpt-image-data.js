// Fixed public projection shared by the page bridge and the message index.
export function publicImagePart(value) {
  if (value?.content_type !== "image_asset_pointer" || typeof value.asset_pointer !== "string") return null;
  const image = { content_type: "image_asset_pointer", asset_pointer: value.asset_pointer, alt: typeof value.alt === "string" ? value.alt : "" };
  for (const key of ["width", "height"]) if (Number.isFinite(value[key]) && value[key] > 0) image[key] = value[key];
  if (typeof value.mime_type === "string") image.mime_type = value.mime_type;
  return image;
}

export function publicFilePart(value) {
  if (value?.content_type !== "file_asset_pointer" || typeof value.file_name !== "string" || !value.file_name.trim()) return null;
  const file = { content_type: "file_asset_pointer", file_name: value.file_name };
  if (typeof value.mime_type === "string") file.mime_type = value.mime_type;
  try {
    const url = new URL(value.url || value.asset_pointer);
    if (url.protocol === "https:" && !url.username && !url.password) file.url = url.href;
  } catch { /* Private file pointers are labels, never public download links. */ }
  return file;
}

export function publicImageMessage(value) {
  const role = value?.author?.role;
  if (!value?.id || !["user", "assistant", "tool"].includes(role) || value.metadata?.is_visually_hidden_from_conversation
    || value.recipient && value.recipient !== "all"
    || value.channel && !(role === "tool" ? ["final", "commentary"].includes(value.channel) : value.channel === "final")) return null;
  const parts = (Array.isArray(value.content?.parts) ? value.content.parts : []).map((part) => typeof part === "string" ? part : publicImagePart(part) || publicFilePart(part));
  const visible = role === "tool" ? parts.filter((part) => ["image_asset_pointer", "file_asset_pointer"].includes(part?.content_type)) : parts;
  if (role === "tool" && (!visible.length || value.content?.content_type !== "multimodal_text")) return null;
  return { id: value.id, author: { role: role === "tool" ? "assistant" : role }, create_time: value.create_time,
    content: { content_type: value.content?.content_type, parts: visible } };
}

