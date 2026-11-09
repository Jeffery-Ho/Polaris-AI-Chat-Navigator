import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createDOMConversationSource } from "../src/dom-conversation-source.js";
import { createDOMIndexController } from "../src/dom-index-controller.js";

for (const platform of ["qianwen", "yuanbao"]) {
  for (const insideBody of [true, false]) {
    test(`${platform} retains its existing native video heading (inside body: ${insideBody})`, async () => {
      const video = '<div class="native-video"><div class="item-title">原生视频标题</div></div>';
      const dom = new JSDOM(`<div class="list"><div class="user" data-message-id="u1">请找视频</div><div class="answer" data-message-id="a1"><div class="markdown"><p>介绍</p>${insideBody ? video : ""}</div>${insideBody ? "" : video}</div></div>`, { url: `https://${platform}.test/chat/one` });
      const doc = dom.window.document;
      const title = doc.querySelector(".item-title");
      const readMessages = createDOMConversationSource({ window: dom.window, platform, readContainers: () => ({
        userContainers: [doc.querySelector(".user")], assistantContainers: [doc.querySelector(".markdown")],
        extraHeadings: [{ element: title, title: title.textContent, level: 2 }]
      }) });
      const index = createDOMIndexController({ window: dom.window, platform, readMessages });
      try {
        index.configure(true); await index.syncMounted();
        const outline = index.outline({ enabledLevelsByPlatform: { [platform]: [1, 2] } });
        const videos = outline.items.filter((item) => item.title === "原生视频标题");
        assert.equal(videos.length, 1);
        assert.equal(index.resolveTarget(videos[0].markerKey, { enabledLevelsByPlatform: { [platform]: [1, 2] } }), title);
        assert.ok(outline.chapters.every((node) => node.title !== "Full text"));
      } finally { index.dispose(); dom.window.close(); }
    });
  }
}
