import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  collectManusConversation,
  manusUserMessageText,
  isManusConversationScrollTarget,
  MANUS_ASSISTANT_SELECTOR,
  MANUS_USER_CONTAINER_SELECTOR
} from "../src/manus-messages.js";
import { hasRelevantMarkerMutation } from "../src/marker-mutation-relevance.js";
import { createRuntimeMarkerKeySequence } from "../src/runtime-marker-key-sequence.js";
import { userMessageImageSelectorForPlatform, isOwnedUserAttachmentCandidate } from "../src/user-message-images.js";

import { Element } from "../test-support/dom-element.js";

const heading = (text) => new Element("h2", {}, [], text);
const ai = (text = "Answer", children = [heading(text)]) => new Element("div", { class: "manus-markdown chat-message-body" }, children);
const user = (text = "Question", attachments = []) => new Element("div", { "data-event-id": `user-${text}` }, [
  new Element("div", { "data-chat-question-bubble": "true" }, [new Element("span", { class: "chat-message-body" }, [], text)]),
  ...attachments,
  new Element("span", { class: "message-timestamp" }, [], "12:00")
]);
const turn = (id, children) => new Element("div", { "data-turn-id": id }, children);
function conversation(turns, outside = []) {
  const list = new Element("div", { "data-chat-message-list": "true" }, turns);
  const root = new Element("main", {}, [new Element("div", { id: "manus-chat-box" }, [list]), ...outside]);
  return { root, list };
}

test("Manus associates every mounted AI body with the user in the same turn", () => {
  const firstUser = user("First");
  const secondUser = user("Second");
  const process = ai("Process");
  const final = ai("Final");
  const second = ai("Final");
  const { root } = conversation([turn("one", [firstUser, process, final]), turn("two", [secondUser, second])]);
  const result = collectManusConversation(root);
  assert.deepEqual(result.userContainers, [firstUser, secondUser]);
  assert.deepEqual(result.assistantContainers, [process, final, second]);
  assert.equal(result.assistantToUser.get(process), firstUser);
  assert.equal(result.assistantToUser.get(final), firstUser);
  assert.equal(result.assistantToUser.get(second), secondUser);
  assert.equal(manusUserMessageText(firstUser), "First");
});

test("Manus excludes user Markdown, nested duplicates, tools, status, suggestions and outside previews", () => {
  const nested = ai("Nested");
  const body = ai("Outer", [heading("Outer"), nested]);
  const prompt = user("Prompt");
  prompt.querySelector(".chat-message-body").attrs.class += " manus-markdown";
  const unrelated = ["Task completed", "Upgrade", "Suggested question", "Browser tool"].map((text) => new Element("div", { class: "markdown" }, [heading(text)]));
  const { root } = conversation([turn("one", [prompt, body, ...unrelated])], [ai("Preview")]);
  assert.deepEqual(collectManusConversation(root).assistantContainers, [body]);
  assert.deepEqual(collectManusConversation(new Element("main", {}, [ai()] )).assistantContainers, []);
});

test("Manus never associates an orphan or hidden-user reply with a preceding turn", () => {
  const preceding = user("Preceding");
  const hiddenUser = user("Hidden");
  const orphan = ai("Orphan");
  const hiddenReply = ai("Hidden user reply");
  const { root } = conversation([turn("one", [preceding]), turn("two", [orphan]), turn("three", [hiddenUser, hiddenReply])]);
  const result = collectManusConversation(root, { acceptNode: (node) => node !== hiddenUser });
  assert.deepEqual(result.userContainers, [preceding]);
  assert.equal(result.assistantToUser.get(orphan), null);
  assert.equal(result.assistantToUser.get(hiddenReply), null);
});

test("Manus keeps short replies and empty pending user turns without inventing headings", () => {
  const prompt = user("Pending");
  const reply = ai("", [new Element("p", {}, [], "Short answer")]);
  const { root } = conversation([turn("one", [prompt, reply]), turn("two", [user("Waiting")])]);
  const result = collectManusConversation(root);
  assert.equal(result.userContainers.length, 2);
  assert.deepEqual(result.assistantContainers, [reply]);
  assert.equal(reply.querySelector("h2"), null);
});

test("Manus drops removed DOM, collects streamed content and assigns fresh keys on remount", () => {
  const mounted = turn("one", [user(), ai("Original")]);
  const { root, list } = conversation([mounted]);
  const keys = createRuntimeMarkerKeySequence();
  const oldBody = collectManusConversation(root).assistantContainers[0];
  const oldKey = keys.keyFor(oldBody);
  oldBody.append(heading("Streamed"));
  assert.equal(collectManusConversation(root).assistantContainers[0].querySelectorAll("h2").length, 2);
  mounted.remove();
  assert.equal(collectManusConversation(root).assistantContainers.length, 0);
  assert.equal(collectManusConversation(root).userContainers.length, 0);
  list.append(turn("one", [user(), ai("Original")]));
  assert.notEqual(keys.keyFor(collectManusConversation(root).assistantContainers[0]), oldKey);
});

test("Manus source mutations include new turns and message-owned image changes", () => {
  const prompt = user();
  const reply = ai();
  const mounted = turn("one", [prompt, reply]);
  const { root, list } = conversation([mounted]);
  const options = { knownContainers: [], sourceSelectors: [MANUS_ASSISTANT_SELECTOR, MANUS_USER_CONTAINER_SELECTOR] };
  assert.equal(hasRelevantMarkerMutation({ ...options, mutations: [{ type: "childList", target: list, addedNodes: [mounted], removedNodes: [] }] }), true);
  const unrelated = new Element("div", {}, [heading("Upgrade")]);
  assert.equal(hasRelevantMarkerMutation({ ...options, mutations: [{ type: "childList", target: root, addedNodes: [unrelated], removedNodes: [] }] }), false);
  assert.equal(hasRelevantMarkerMutation({ ...options, knownContainers: [prompt, reply], mutations: [{ type: "characterData", target: reply.children[0], addedNodes: [], removedNodes: [] }] }), true);
});

test("Manus user images use their own event container and existing attachment filters", () => {
  const image = new Element("img", { src: "https://example.com/image.png" });
  const prompt = user("Image", [image]);
  const { root } = conversation([turn("one", [prompt, ai()])]);
  const owner = collectManusConversation(root).userContainers[0];
  assert.equal(image.closest(MANUS_USER_CONTAINER_SELECTOR), owner);
  assert.equal(userMessageImageSelectorForPlatform("manus"), "img");
  assert.equal(isOwnedUserAttachmentCandidate({ platform: "manus", ownerMatches: true, inAttachmentRegion: true, excluded: false }), true);
  assert.equal(isOwnedUserAttachmentCandidate({ platform: "manus", ownerMatches: true, inAttachmentRegion: true, excluded: true }), false);
  assert.equal(manusUserMessageText(owner), "Image");
});

test("Manus scroll handling accepts only its inner SimpleBar conversation scroller", () => {
  const scroller = new Element("div", { class: "simplebar-content-wrapper" });
  const viewport = new Element("div", { id: "manus-chat-scroll-viewport" }, [scroller]);
  assert.equal(isManusConversationScrollTarget(scroller), true);
  assert.equal(isManusConversationScrollTarget(viewport), false);
  assert.equal(isManusConversationScrollTarget(new Element("div", { class: "simplebar-content-wrapper" })), false);
  assert.equal(isManusConversationScrollTarget(null), false);
});

test("Production grouping honors Manus associations even when another user precedes an orphan", () => {
  const source = readFileSync(new URL("../src/content.js", import.meta.url), "utf8");
  const start = source.indexOf("  function assistantContainerForHeading(");
  const end = source.indexOf("  function dedupeAdjacentGroupHeadings(", start);
  const prompt = user("First");
  const answer = ai("Same title");
  const orphan = ai("Same title");
  const { root } = conversation([turn("one", [prompt, answer]), turn("two", [orphan])]);
  const result = collectManusConversation(root);
  const order = root.querySelectorAll("*");
  const group = runInNewContext(`${source.slice(start, end)}; collectMarkerGroups`, {
    HTMLElement: Element,
    makeUserMarkerItem: (element) => ({ element, title: manusUserMessageText(element), markerKey: "user-key" }),
    compareConversationPosition: (a, b) => order.indexOf(a) - order.indexOf(b),
    isXiaohongshuMainChatPage: () => false
  });
  const headings = [answer, orphan].map((element) => ({ element: element.children[0], title: "Same title" }));
  const groups = group(result.userContainers, result.assistantContainers, headings, null, result.assistantToUser);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].headings.length, 1);
  assert.equal(groups[0].hasAssistantMessage, true);
  assert.equal(groups[1].user, null);
  assert.equal(groups[1].headings[0], headings[1]);
});

test("Manus integration uses its scoped adapter, associations, defaults and scroll lifecycle", () => {
  const source = readFileSync(new URL("../src/content.js", import.meta.url), "utf8");
  const manifest = JSON.parse(readFileSync(new URL("../manifest.build.json", import.meta.url), "utf8"));
  const background = readFileSync(new URL("../src/background.js", import.meta.url), "utf8");
  assert.match(source, /return window\.location\.hostname === "manus\.im"/);
  assert.match(source, /if \(isManusPage\(\)\) \{\s*return "manus"/);
  assert.match(source, /return \[MANUS_ASSISTANT_SELECTOR\]/);
  assert.match(source, /return \[MANUS_USER_CONTAINER_SELECTOR\]/);
  assert.match(source, /collectMarkerGroups\(userContainers, assistantContainers, headings, scanContext, conversation\?\.assistantToUser\)/);
  assert.match(source, /manus: \[1, 2, 3\]/);
  assert.match(source, /DEFAULT_UNORDERED_LIST_BY_PLATFORM[\s\S]*?manus: true/);
  assert.match(source, /DEFAULT_ENABLED_ORDERED_LIST_BY_PLATFORM[\s\S]*?manus: false/);
  assert.match(source, /DEFAULT_ENABLED_STRONG_BY_PLATFORM[\s\S]*?manus: true/);
  assert.match(source, /lifecycle\.listen\(document, "scroll", handleManusConversationScroll, \{ capture: true, passive: true \}\)/);
  assert.match(source, /document\.removeEventListener\("scroll", handleManusConversationScroll, true\)/);
  assert.match(source, /isInsideNavigationRoot\(event\.target\)[\s\S]*?isManusConversationScrollTarget\(event\.target\)/);
  assert.match(background, /"manus\.im"/);
  assert.ok(manifest.host_permissions.includes("https://manus.im/*"));
  assert.ok(manifest.content_scripts[0].matches.includes("https://manus.im/*"));
  assert.ok(manifest.web_accessible_resources[0].matches.includes("https://manus.im/*"));
  assert.ok(manifest.web_accessible_resources[0].resources.includes("icons/platform-manus.png"));
});
