import {
  hashedMarkdownHeadingLevel,
  isHashedMarkdownRoot
} from "./hashed-markdown.js";

export const CHATGPT_LEGACY_ASSISTANT_SELECTOR = '[data-message-author-role="assistant"], [data-message-role="assistant"]';
export const CHATGPT_LEGACY_USER_SELECTOR = '[data-message-author-role="user"], [data-message-role="user"]';
export const CHATGPT_USER_TURN_SELECTOR = '[data-testid^="conversation-turn-"]';
export const CHATGPT_USER_SELECTOR = `${CHATGPT_LEGACY_USER_SELECTOR}, ${CHATGPT_USER_TURN_SELECTOR}, [class~="group/user-message"]`;
export const CHATGPT_PROSE_SELECTOR = ".markdown, .prose";

function attributeFor(node, name) {
  if (node?.attrs && Object.prototype.hasOwnProperty.call(node.attrs, name)) {
    return node.attrs[name];
  }
  if (typeof node?.getAttribute === "function") {
    return node.getAttribute(name);
  }
  return "";
}

function childNodesFor(node) {
  if (Array.isArray(node?.children)) {
    return node.children;
  }
  if (node?.childNodes) {
    return Array.from(node.childNodes);
  }
  return [];
}

function walk(node, visit) {
  if (!node || typeof node !== "object") {
    return;
  }
  visit(node);
  childNodesFor(node).forEach((child) => walk(child, visit));
}

function containsNode(ancestor, node) {
  if (!ancestor || ancestor === node) {
    return false;
  }
  if (typeof ancestor.contains === "function") {
    return ancestor.contains(node);
  }
  let found = false;
  childNodesFor(ancestor).forEach((child) => {
    if (!found && (child === node || containsNode(child, node))) {
      found = true;
    }
  });
  return found;
}

function textFor(node) {
  if (typeof node?.text === "string" && node.text) {
    return node.text;
  }
  if (typeof node?.textContent === "string" && node.textContent) {
    return node.textContent;
  }
  return childNodesFor(node).map((child) => textFor(child)).join(" ");
}

function hasClassToken(className, token) {
  return String(className || "").split(/\s+/).filter(Boolean).includes(token);
}

export function chatGptAuthorRole(node) {
  return String(attributeFor(node, "data-message-author-role") || attributeFor(node, "data-message-role") || "");
}

export function isChatGptProseBody(node) {
  return hasClassToken(node?.className, "markdown") || hasClassToken(node?.className, "prose");
}

function tagNameFor(node) {
  return String(node?.tagName || node?.tag || "").toUpperCase();
}

function isHeadingNode(node) {
  if (/^H[1-6]$/.test(tagNameFor(node))) {
    return true;
  }
  return String(node?.className || "").split(/\s+/).filter(Boolean).some((token) => token.startsWith("Heading-"));
}

function isUserTurnHeading(node) {
  const className = String(node?.className || "");
  const isAuxiliaryHeading = tagNameFor(node) === "H5"
    && (hasClassToken(className, "sr-only")
      || hasClassToken(className, "visually-hidden")
      || hasClassToken(className, "srOnly"));
  if (!isAuxiliaryHeading) {
    return false;
  }
  return /^(?:you said|你说|你話|你话)\s*[:：]?$/i.test(textFor(node).replace(/\s+/g, " ").trim());
}

function hasChatGptUserHeading(node) {
  if (typeof node?.querySelector === "function") {
    const heading = node.querySelector("h5.sr-only, h5.visually-hidden, h5.srOnly");
    return Boolean(heading && isUserTurnHeading(heading));
  }
  let found = false;
  const visit = (current) => {
    if (found) {
      return;
    }
    if (current !== node && isUserTurnHeading(current)) {
      found = true;
      return;
    }
    childNodesFor(current).forEach(visit);
  };
  childNodesFor(node).forEach(visit);
  return found;
}

export function stripChatGptUserRolePrefix(text) {
  return String(text || "").replace(/^\s*(?:You said|你说|你話|你话)\s*[:：]?\s*/i, "");
}

export function isChatGptUserTurnNode(node) {
  const role = chatGptAuthorRole(node);
  if (role === "user") {
    return true;
  }
  if (!role && hasClassToken(node?.className, "group/user-message")) {
    return true;
  }
  const testId = attributeFor(node, "data-testid");
  if (String(attributeFor(node, "data-turn") || "").toLowerCase() === "user") {
    return true;
  }
  if (testId && /^conversation-turn-user/.test(testId)) {
    return true;
  }
  if (!testId || !/^conversation-turn-/.test(testId)) {
    return false;
  }
  return hasChatGptUserHeading(node);
}

export function mergeChatGptAssistantNodes({ legacy = [], hashed = [], prose = [], users = [] } = {}) {
  const chosen = [];
  const accept = (node, kind) => {
    if (!node) {
      return;
    }
    if (users.some((user) => user === node || containsNode(user, node))) {
      return;
    }
    if (chosen.some((item) => item.node === node || containsNode(item.node, node) || containsNode(node, item.node))) {
      return;
    }
    chosen.push({ node, kind, role: "assistant" });
  };
  legacy.forEach((node) => accept(node, "legacy"));
  hashed.forEach((node) => accept(node, "hashed"));
  prose.forEach((node) => accept(node, "prose"));
  return chosen;
}

function sectionsInMessage(messageNode, kind) {
  const sections = [];
  walk(messageNode, (node) => {
    if (node === messageNode || isHashedMarkdownRoot(node) || !isHeadingNode(node)) {
      return;
    }
    const level = hashedMarkdownHeadingLevel(node);
    const title = textFor(node).replace(/\s+/g, " ").trim();
    if (!level || !title) {
      return;
    }
    sections.push({ level, title, messageKind: kind });
  });
  return sections;
}

export function collectChatGptConversation(root) {
  const nodes = [];
  walk(root, (node) => nodes.push(node));
  const users = nodes.filter(isChatGptUserTurnNode);
  const userMessages = users
    .filter((node) => !users.some((other) => containsNode(other, node)))
    .map((node) => ({
      role: "user",
      node,
      text: textFor(node).replace(/\s+/g, " ").trim()
    }));
  const assistantMessages = mergeChatGptAssistantNodes({
    legacy: nodes.filter((node) => chatGptAuthorRole(node) === "assistant"),
    hashed: nodes.filter((node) => isHashedMarkdownRoot(node)),
    prose: nodes.filter((node) => isChatGptProseBody(node)),
    users
  });
  return {
    userMessages,
    assistantMessages,
    sections: assistantMessages.flatMap((message) => sectionsInMessage(message.node, message.kind))
  };
}
