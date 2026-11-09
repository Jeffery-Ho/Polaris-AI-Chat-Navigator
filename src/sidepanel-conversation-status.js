import { stepStates } from "./conversation-reading-state.js";

const ICONS = {
  active: '<path d="M10 2.5a7.5 7.5 0 1 0 7.5 7.5"/>',
  done: '<circle cx="10" cy="10" r="7.5"/><path d="m6.75 10.25 2.25 2.25 4.25-4.5"/>',
  error: '<circle cx="10" cy="10" r="7.5"/><path d="M10 6.25v4.5M10 13.5v.25"/>',
  pending: '<circle cx="10" cy="10" r="7.5"/>'
};

export function createSidepanelConversationStatus({ document, locale, onRetry, onReadLoaded, onPreferences }) {
  const copy = (zh, en) => locale === "zh" ? zh : en;
  const make = (tag, className, text = "") => {
    const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
  };
  const element = make("section", "conversation-read-status");
  element.setAttribute("aria-label", copy("完整对话读取状态", "Conversation reading status"));
  const title = make("p", "conversation-read-title");
  const heading = make("h2", "conversation-read-heading"); heading.setAttribute("role", "status");
  const steps = make("ol", "conversation-read-steps"); steps.setAttribute("aria-label", copy("进度", "Progress"));
  function step(name, text) {
    const item = make("li", `conversation-read-step ${name}`);
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 20 20"); icon.setAttribute("aria-hidden", "true");
    item.append(icon, make("span", "", text)); steps.append(item);
    return { item, icon };
  }
  const read = step("read", copy("读取消息", "Read messages"));
  const number = make("span", "conversation-read-count"); read.item.append(number);
  const prepare = step("prepare", copy("准备正文", "Prepare the conversation"));
  const hint = make("p", "conversation-read-hint");
  const actions = make("div", "conversation-read-actions");
  const retry = make("button", "secondary-button", copy("重试", "Try again")); retry.type = "button";
  retry.addEventListener("click", onRetry);
  const partial = make("button", "secondary-button", copy("先阅读已加载内容", "Read loaded messages")); partial.type = "button";
  partial.addEventListener("click", onReadLoaded);
  actions.append(retry, partial);
  const settings = make("div", "conversation-read-settings");
  const mode = make("span", "conversation-read-mode-tag", copy("已开启完整对话", "Full conversation is on"));
  const preferences = make("button", "secondary-button conversation-read-preferences", copy("更改偏好", "Change preferences"));
  preferences.type = "button"; preferences.addEventListener("click", onPreferences);
  settings.append(mode, preferences);
  element.append(heading, title, steps, hint, actions, settings);
  return {
    element,
    update(snapshot) {
      const states = stepStates(snapshot);
      const failed = states.read === "error" || states.prepare === "error";
      for (const [step, state] of [[read, states.read], [prepare, states.prepare]]) {
        if (step.item.dataset.state === state) continue;
        step.item.dataset.state = state; step.icon.innerHTML = ICONS[state];
      }
      const headingText = failed ? copy("完整对话还没准备好", "The full conversation isn't ready yet") : copy("正在读取完整对话", "Reading the full conversation");
      if (heading.textContent !== headingText) heading.textContent = headingText;
      title.textContent = snapshot.title || ""; title.hidden = !snapshot.title;
      number.textContent = Number(snapshot.count) > 0 ? Number(snapshot.count).toLocaleString(locale === "zh" ? "zh-CN" : "en-US") : "";
      hint.textContent = failed ? copy("可以重试，或先阅读已经加载的消息。", "Try again, or read the messages already loaded.")
        : states.read === "active" ? copy("较长的对话可能需要一点时间，无需向上翻页。", "Long conversations may take a moment. No need to scroll up.") : "";
      hint.hidden = !hint.textContent;
      actions.hidden = !failed;
      retry.disabled = Date.now() < (snapshot.retryAt || 0);
      partial.hidden = !Number(snapshot.count);
    }
  };
}
