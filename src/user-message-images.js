const SAFE_DATA_IMAGE_URL = /^data:image\/(?:png|apng|jpe?g|gif|webp|avif|bmp|x-icon)(?:;[^,]*)?,/i;
const CHATGPT_USER_IMAGE_SELECTOR = [
  'button[aria-haspopup="dialog"] > img[alt="User attachment" i]',
  'img[alt="已上传的图片"]',
  'img[alt="Uploaded an image" i]',
  'img[src*="/estuary/content?id=file"]',
  'img[alt*="uploaded image" i]',
  '[data-testid*="image-attachment" i] img',
  '[data-testid*="image-preview" i] img',
  '[class*="image-attachment" i] img',
  '[class*="image-preview" i] img'
].join(", ");
const GEMINI_USER_IMAGE_SELECTOR = "user-query-file-preview img, user-query-file-carousel img";
const GENERIC_USER_IMAGE_SELECTOR = "img";
const USER_IMAGE_PLATFORMS = new Set([
  "chatgpt",
  "claude",
  "gemini",
  "grok",
  "doubao",
  "kimi",
  "qianwen",
  "yuanbao",
  "xiaohongshu",
  "manus",
  "deepseek"
]);

function isSafeDataImageUrl(value) {
  return SAFE_DATA_IMAGE_URL.test(String(value || ""));
}

function readBlobAsDataUrl(blob) {
  if (typeof FileReader !== "function") {
    return Promise.resolve("");
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    }, { once: true });
    reader.addEventListener("error", () => resolve(""), { once: true });
    reader.readAsDataURL(blob);
  });
}

export function userMessageImageSelectorForPlatform(platform) {
  if (platform === "chatgpt") {
    return CHATGPT_USER_IMAGE_SELECTOR;
  }
  if (platform === "gemini") {
    return GEMINI_USER_IMAGE_SELECTOR;
  }
  return USER_IMAGE_PLATFORMS.has(platform) ? GENERIC_USER_IMAGE_SELECTOR : "";
}

export function isOwnedUserAttachmentCandidate({
  platform,
  ownerMatches,
  inAttachmentRegion,
  excluded
}) {
  return USER_IMAGE_PLATFORMS.has(platform)
    && Boolean(ownerMatches)
    && Boolean(inAttachmentRegion)
    && !excluded;
}

export async function inlineUserMessageImageSource(source, {
  fetchImpl = globalThis.fetch,
  readBlobAsDataUrl: readBlobAsDataUrlImpl = readBlobAsDataUrl,
  pageUrl = globalThis.location?.href || ""
} = {}) {
  const value = String(source || "");
  if (!value) {
    return "";
  }
  if (isSafeDataImageUrl(value)) {
    return value;
  }
  if (typeof fetchImpl !== "function") {
    return "";
  }
  try {
    let credentials = "include";
    if (pageUrl) {
      const page = new URL(pageUrl);
      const image = new URL(value, page);
      credentials = image.origin === page.origin ? "include" : "omit";
    }
    const response = await fetchImpl(value, { credentials });
    if (!response?.ok) {
      return "";
    }
    const blob = await response.blob();
    if (!blob || (blob.type && !blob.type.startsWith("image/"))) {
      return "";
    }
    const dataUrl = await readBlobAsDataUrlImpl(blob);
    return typeof dataUrl === "string" && dataUrl.startsWith("data:image/") ? dataUrl : "";
  } catch {
    return "";
  }
}

export function safeUserMessageImageUrl(value, baseUrl) {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }
  try {
    const pageUrl = new URL(baseUrl);
    const url = new URL(source, pageUrl);
    if (url.protocol === "data:") {
      return isSafeDataImageUrl(url.href) ? url.href : "";
    }
    if (url.protocol === "https:") {
      return url.href;
    }
    return url.protocol === "blob:" && url.origin === pageUrl.origin ? url.href : "";
  } catch {
    return "";
  }
}

export function userMessageThumbnailForSources(sources, baseUrl) {
  const imageUrls = [];
  const seen = new Set();
  const values = Array.isArray(sources) ? sources : [];
  for (const source of values) {
    const url = safeUserMessageImageUrl(source, baseUrl);
    if (url && !seen.has(url)) {
      seen.add(url);
      imageUrls.push(url);
    }
  }
  return {
    imageUrls,
    thumbnailSrc: imageUrls[0] || "",
    imageCount: imageUrls.length
  };
}
