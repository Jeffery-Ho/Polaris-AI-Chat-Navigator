import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  inlineUserMessageImageSource,
  isOwnedUserAttachmentCandidate,
  safeUserMessageImageUrl,
  userMessageImageSelectorForPlatform,
  userMessageThumbnailForSources
} from "../src/user-message-images.js";

const contentSource = await readFile(new URL("../src/content.js", import.meta.url), "utf8");

test("用户消息缩略图接受安全的图片 data 地址并拒绝脚本化 SVG", () => {
  const baseUrl = "https://chatgpt.com/c/example";
  assert.equal(safeUserMessageImageUrl("", baseUrl), "");
  assert.equal(safeUserMessageImageUrl("   ", baseUrl), "");
  assert.equal(safeUserMessageImageUrl("/images/example.png", baseUrl), "https://chatgpt.com/images/example.png");
  assert.equal(safeUserMessageImageUrl("blob:https://chatgpt.com/asset", baseUrl), "blob:https://chatgpt.com/asset");
  assert.equal(safeUserMessageImageUrl("blob:https://gemini.google.com/asset", baseUrl), "");
  assert.equal(safeUserMessageImageUrl("http://example.com/image.png", baseUrl), "");
  assert.equal(safeUserMessageImageUrl("data:image/png;base64,thumbnail", baseUrl), "data:image/png;base64,thumbnail");
  assert.equal(safeUserMessageImageUrl("data:image/svg+xml,<svg></svg>", baseUrl), "");
  assert.equal(safeUserMessageImageUrl("javascript:alert(1)", baseUrl), "");
});

test("用户消息缩略图保留首图、统计去重后的图片数", () => {
  const result = userMessageThumbnailForSources([
    "https://images.example/first.png",
    "https://images.example/first.png",
    "blob:https://chatgpt.com/second"
  ], "https://chatgpt.com/c/example");
  assert.deepEqual(result, {
    imageUrls: [
      "https://images.example/first.png",
      "blob:https://chatgpt.com/second"
    ],
    thumbnailSrc: "https://images.example/first.png",
    imageCount: 2
  });
});

test("独立窗口图片会在内容页转换为可跨扩展窗口读取的 data 地址", async () => {
  const calls = [];
  const result = await inlineUserMessageImageSource("blob:https://chatgpt.com/asset", {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async blob() {
          return { type: "image/png" };
        }
      };
    },
    readBlobAsDataUrl: async (blob) => `data:${blob.type};base64,thumbnail`
  });

  assert.equal(result, "data:image/png;base64,thumbnail");
  assert.deepEqual(calls, [{
    url: "blob:https://chatgpt.com/asset",
    options: { credentials: "include" }
  }]);
});

test("跨站图片转换不携带网页凭据，避免 CDN 因凭据 CORS 失败", async () => {
  const calls = [];
  const result = await inlineUserMessageImageSource("https://cdn.example/asset.png", {
    pageUrl: "https://chatgpt.com/c/example",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async blob() {
          return { type: "image/png" };
        }
      };
    },
    readBlobAsDataUrl: async (blob) => `data:${blob.type};base64,thumbnail`
  });

  assert.equal(result, "data:image/png;base64,thumbnail");
  assert.deepEqual(calls, [{
    url: "https://cdn.example/asset.png",
    options: { credentials: "omit" }
  }]);
});

test("已经是安全 data 图片时不再发起网络请求", async () => {
  let fetchCalls = 0;
  const source = "data:image/png;base64,thumbnail";
  const result = await inlineUserMessageImageSource(source, {
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("data URL should not be fetched");
    }
  });

  assert.equal(result, source);
  assert.equal(fetchCalls, 0);
});

test("只有当前用户消息中经过验证的上传附件能成为 Maker 图片", () => {
  assert.equal(isOwnedUserAttachmentCandidate({
    platform: "chatgpt",
    ownerMatches: true,
    inAttachmentRegion: true,
    excluded: false
  }), true);
  assert.equal(isOwnedUserAttachmentCandidate({
    platform: "chatgpt",
    ownerMatches: false,
    inAttachmentRegion: true,
    excluded: false
  }), false);
  assert.equal(isOwnedUserAttachmentCandidate({
    platform: "chatgpt",
    ownerMatches: true,
    inAttachmentRegion: false,
    excluded: false
  }), false);
  assert.equal(isOwnedUserAttachmentCandidate({
    platform: "chatgpt",
    ownerMatches: true,
    inAttachmentRegion: true,
    excluded: true
  }), false);
  assert.equal(isOwnedUserAttachmentCandidate({
    platform: "claude",
    ownerMatches: true,
    inAttachmentRegion: true,
    excluded: false
  }), true);
});

test("支持的平台均能扫描当前用户消息中的图片附件", () => {
  const platforms = [
    "chatgpt",
    "claude",
    "gemini",
    "grok",
    "doubao",
    "kimi",
    "qianwen",
    "yuanbao",
    "xiaohongshu",
    "manus"
  ];
  const chatgptSelector = userMessageImageSelectorForPlatform("chatgpt");
  assert.match(chatgptSelector, /uploaded image/);
  assert.match(chatgptSelector, /image-attachment/);
  assert.equal(userMessageImageSelectorForPlatform("gemini"), "user-query-file-preview img, user-query-file-carousel img");
  platforms.forEach((platform) => {
    assert.notEqual(userMessageImageSelectorForPlatform(platform), "");
  });
  assert.equal(userMessageImageSelectorForPlatform("claude"), "img");
  assert.equal(userMessageImageSelectorForPlatform("grok"), "img");
  assert.equal(userMessageImageSelectorForPlatform("doubao"), "img");
  assert.equal(userMessageImageSelectorForPlatform("kimi"), "img");
  assert.equal(userMessageImageSelectorForPlatform("qianwen"), "img");
  assert.equal(userMessageImageSelectorForPlatform("yuanbao"), "img");
  assert.equal(userMessageImageSelectorForPlatform("xiaohongshu"), "img");
  assert.equal(userMessageImageSelectorForPlatform("default"), "");
  assert.notEqual(chatgptSelector.trim(), "img");

  assert.match(contentSource, /userMessageImageSelectorForPlatform\(currentPlatformKey\(\)\)/);
  assert.match(contentSource, /isOwnedUserAttachmentCandidate/);
  assert.doesNotMatch(contentSource, /const USER_MESSAGE_IMAGE_SELECTOR = "img";/);
  assert.match(contentSource, /imageUrls,\s*thumbnailSrc,\s*imageCount,\s*isImageOnly,/);
  assert.match(contentSource, /signature: markerRenderSignature\(\["user",[\s\S]*?user\.imageUrls,[\s\S]*?user\.thumbnailSrc, user\.imageCount, user\.isImageOnly\]\)/);
});

test("图片地址属性变化会触发用户 Maker 刷新", () => {
  assert.match(contentSource, /const USER_MESSAGE_IMAGE_ATTRIBUTE_FILTER = \["src", "srcset", "data-src", "data-original", "data-url"\];/);
  assert.match(contentSource, /state\.observer\.observe\(document\.documentElement, \{[\s\S]*?attributes: true,[\s\S]*?attributeFilter:[\s\S]*?USER_MESSAGE_IMAGE_ATTRIBUTE_FILTER,[\s\S]*?childList: true,/);
  assert.match(contentSource, /function syncOpenImagePreviewForThumbnail\(labelThumbnail\) \{[\s\S]*?state\.imagePreviewUrls = urls;[\s\S]*?syncImagePreviewOverlay\(overlay\)/);
});

test("用户图片可从延迟加载属性读取地址并避免失败图重复显示", () => {
  assert.match(contentSource, /function firstImageSrcsetUrl\(image\)/);
  assert.match(contentSource, /function userMessageImageSource\(image\) \{[\s\S]*?const candidates = \[[\s\S]*?getAttribute\("src"\)[\s\S]*?firstImageSrcsetUrl\(image\)[\s\S]*?getAttribute\("data-src"\)[\s\S]*?getAttribute\("data-original"\)[\s\S]*?getAttribute\("data-url"\)[\s\S]*?candidates\.find\(\(candidate\) => safeUserMessageImageUrl\(candidate, window\.location\.href\)\)/);
  assert.doesNotMatch(contentSource, /function userMessageImageSource\(image\) \{[\s\S]*?image\.(?:currentSrc|src),[\s\S]*?\n  \}/);
  assert.match(contentSource, /thumbnail\.dataset\.failedSrc/);
  assert.match(contentSource, /labelThumbnail\.removeAttribute\("src"\)/);
  assert.match(contentSource, /thumbnail\.removeAttribute\("src"\)/);
});

test("独立窗口快照不会直接传递网页上下文的 blob 图片地址", () => {
  assert.match(contentSource, /inlineUserMessageImageSource/);
  assert.match(contentSource, /thumbnailSrc: standaloneWindowImageSource\(item\.thumbnailSrc\)/);
  assert.match(contentSource, /imageUrls: await Promise\.all/);
});
