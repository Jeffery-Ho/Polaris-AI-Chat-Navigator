// Platform display data for the sidepanel. Host matching stays in supported-sites.js.
export const SUPPORTED_PLATFORMS = Object.freeze([
  { key: "chatgpt", label: "ChatGPT", favicon: "icons/platform-chatgpt.png", url: "https://chatgpt.com/" },
  { key: "claude", label: "Claude", favicon: "icons/platform-claude.png", url: "https://claude.ai/" },
  { key: "gemini", label: "Gemini", favicon: "icons/platform-gemini.png", url: "https://gemini.google.com/" },
  { key: "grok", label: "Grok", favicon: "icons/platform-grok.png", url: "https://grok.com/" },
  { key: "doubao", label: "Doubao", favicon: "icons/platform-doubao.png", url: "https://www.doubao.com/" },
  { key: "kimi", label: "Kimi", favicon: "icons/platform-kimi.png", url: "https://www.kimi.com/" },
  { key: "qianwen", label: "Qwen", favicon: "icons/platform-qianwen.png", url: "https://www.qianwen.com/" },
  { key: "yuanbao", label: "Yuanbao", favicon: "icons/platform-yuanbao.png", url: "https://yuanbao.tencent.com/" },
  { key: "xiaohongshu", label: "点点 AI", favicon: "icons/platform-xiaohongshu.png", url: "https://diandian.xiaohongshu.com/" },
  { key: "manus", label: "Manus", favicon: "icons/platform-manus.png", url: "https://manus.im/" },
  { key: "deepseek", label: "DeepSeek", favicon: "icons/platform-deepseek.ico", url: "https://chat.deepseek.com/" }
].map((platform) => Object.freeze(platform)));

export function createPlatformLinks(document, chrome, { label, platforms = SUPPORTED_PLATFORMS, compact = false } = {}) {
  const list = document.createElement("ul");
  list.className = compact ? "platform-links is-compact" : "platform-links";
  if (label) list.setAttribute("aria-label", label);
  for (const platform of platforms) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.className = "platform-link";
    link.href = platform.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.dataset.platform = platform.key;
    if (compact) {
      link.title = platform.label;
      link.setAttribute("aria-label", platform.label);
    }
    const icon = document.createElement("img");
    icon.className = "platform-link-icon";
    icon.src = chrome.runtime.getURL(platform.favicon);
    icon.alt = "";
    icon.width = 20;
    icon.height = 20;
    icon.loading = "lazy";
    const name = document.createElement("span");
    name.className = "platform-link-label";
    name.textContent = platform.label;
    link.append(icon, name);
    item.appendChild(link);
    list.appendChild(item);
  }
  return list;
}
