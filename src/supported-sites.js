// Single source for every supported chat site: content script matches, host
// permissions, and web-accessible resource matches all derive from this list.
export const SUPPORTED_MATCHES = Object.freeze([
  "https://chatgpt.com/*",
  "https://chat.openai.com/*",
  "https://claude.ai/*",
  "https://gemini.google.com/*",
  "https://grok.com/*",
  "https://manus.im/*",
  "https://chat.deepseek.com/*",
  "https://www.doubao.com/*",
  "https://www.kimi.com/*",
  "https://kimi.com/*",
  "https://www.qianwen.com/*",
  "https://qianwen.com/*",
  "https://yb.tencent.com/*",
  "https://yuanbao.tencent.com/*",
  "https://diandian.xiaohongshu.com/*",
  "https://www.xiaohongshu.com/*",
  "https://www.askdiandian.com/*",
  "https://www.diandianlife.top/*"
]);
