// Platform display data and tab shortcuts. Host permissions stay in supported-sites.js.
export const SUPPORTED_PLATFORMS = Object.freeze([
  { key: "chatgpt", label: "ChatGPT", favicon: "icons/platform-chatgpt.png", url: "https://chatgpt.com/", alternateHosts: ["chat.openai.com"] },
  { key: "claude", label: "Claude", favicon: "icons/platform-claude.png", url: "https://claude.ai/" },
  { key: "gemini", label: "Gemini", favicon: "icons/platform-gemini.png", url: "https://gemini.google.com/" },
  { key: "grok", label: "Grok", favicon: "icons/platform-grok.png", url: "https://grok.com/" },
  { key: "doubao", label: "Doubao", favicon: "icons/platform-doubao.png", url: "https://www.doubao.com/" },
  { key: "kimi", label: "Kimi", favicon: "icons/platform-kimi.png", url: "https://www.kimi.com/", alternateHosts: ["kimi.com"] },
  { key: "qianwen", label: "Qwen", favicon: "icons/platform-qianwen.png", url: "https://www.qianwen.com/", alternateHosts: ["qianwen.com"] },
  { key: "yuanbao", label: "Yuanbao", favicon: "icons/platform-yuanbao.png", url: "https://yuanbao.tencent.com/", alternateHosts: ["yb.tencent.com"] },
  { key: "xiaohongshu", label: "点点 AI", favicon: "icons/platform-xiaohongshu.png", url: "https://diandian.xiaohongshu.com/", alternateHosts: ["www.xiaohongshu.com", "www.askdiandian.com", "www.diandianlife.top"] },
  { key: "manus", label: "Manus", favicon: "icons/platform-manus.png", url: "https://manus.im/" },
  { key: "deepseek", label: "DeepSeek", favicon: "icons/platform-deepseek.ico", url: "https://chat.deepseek.com/" }
].map((platform) => Object.freeze(platform)));

export const LAST_USED_PLATFORM_STORAGE_KEY = "polaris-last-used-platform";

export function rememberPlatform(chrome, platformKey) {
  return chrome.storage.local.set({ [LAST_USED_PLATFORM_STORAGE_KEY]: platformKey });
}

export async function openPlatformTab(chrome, platform) {
  const hosts = [new URL(platform.url).hostname, ...(platform.alternateHosts || [])];
  const [tabs, currentWindow] = await Promise.all([
    chrome.tabs.query({ url: hosts.map((host) => `https://${host}/*`) }),
    chrome.windows.getCurrent()
  ]);
  const tab = tabs.sort((a, b) =>
    Number(b.windowId === currentWindow.id) - Number(a.windowId === currentWindow.id)
      || Number(b.active) - Number(a.active)
      || (b.lastAccessed || 0) - (a.lastAccessed || 0)
  )[0];
  if (!tab) return chrome.tabs.create({ url: platform.url, windowId: currentWindow.id, active: true });
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  return tab;
}

export function createPlatformLinks(document, chrome, { label, platforms = SUPPORTED_PLATFORMS, compact = false, lastUsedLabel = "Last used" } = {}) {
  const list = document.createElement("ul");
  list.className = compact ? "platform-links is-compact" : "platform-links";
  if (label) list.setAttribute("aria-label", label);

  function showLastUsed(platformKey) {
    for (const link of list.querySelectorAll(".platform-link")) {
      const isLastUsed = link.dataset.platform === platformKey;
      const name = link.querySelector(".platform-link-label").textContent;
      link.querySelector(".platform-link-badge").hidden = !isLastUsed;
      link.title = isLastUsed ? `${name} · ${lastUsedLabel}` : (compact ? name : "");
      link.setAttribute("aria-label", isLastUsed ? `${name} · ${lastUsedLabel}` : name);
    }
  }

  for (const platform of platforms) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.className = "platform-link";
    link.href = platform.url;
    link.dataset.platform = platform.key;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      void openPlatformTab(chrome, platform).then(() => {
        showLastUsed(platform.key);
        return rememberPlatform(chrome, platform.key);
      }).catch((error) => console.warn("[Polaris] Platform shortcut could not be completed.", error));
    });
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
    const badge = document.createElement("span");
    badge.className = "platform-link-badge";
    badge.textContent = lastUsedLabel;
    badge.hidden = true;
    badge.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.className = "platform-link-label";
    name.textContent = platform.label;
    link.append(icon, name, badge);
    item.appendChild(link);
    list.appendChild(item);
  }
  void chrome.storage.local.get(LAST_USED_PLATFORM_STORAGE_KEY).then((stored) => {
    showLastUsed(stored[LAST_USED_PLATFORM_STORAGE_KEY]);
  }).catch((error) => console.warn("[Polaris] Last-used platform could not be read.", error));
  return list;
}
