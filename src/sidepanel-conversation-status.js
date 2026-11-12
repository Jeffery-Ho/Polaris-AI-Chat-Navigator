import { stepStates } from "./conversation-reading-state.js";

const ICONS = {
  active: '<path d="M10 2.5a7.5 7.5 0 1 0 7.5 7.5"/>',
  done: '<circle cx="10" cy="10" r="7.5"/><path d="m6.75 10.25 2.25 2.25 4.25-4.5"/>',
  error: '<circle cx="10" cy="10" r="7.5"/><path d="M10 6.25v4.5M10 13.5v.25"/>',
  pending: '<circle cx="10" cy="10" r="7.5"/>'
};

export function createSidepanelConversationStatus({ document, locale, onRetry, onResume = () => {}, onPreferences, onChange = () => {} }) {
  const win = document.defaultView;
  let currentKey = "";
  let wasReading = false;
  let completionTimer = 0;
  const copy = (zh, en) => locale === "zh" ? zh : en;
  const make = (tag, className, text = "") => {
    const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
  };
  const element = make("section", "conversation-read-status");
  element.setAttribute("aria-label", copy("已加载对话整理进度", "Loaded conversation progress"));
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
  const read = step("read", copy("读取已加载消息", "Read loaded messages"));
  const number = make("span", "conversation-read-count"); read.item.append(number);
  const prepare = step("prepare", copy("生成目录", "Build the outline"));
  const hint = make("p", "conversation-read-hint");
  const actions = make("div", "conversation-read-actions");
  const retry = make("button", "secondary-button", copy("重试", "Try again")); retry.type = "button";
  retry.addEventListener("click", onRetry);
  const resume = make("button", "secondary-button", copy("继续补齐", "Continue loading")); resume.type = "button";
  resume.addEventListener("click", onResume); actions.append(retry, resume);
  const settings = make("div", "conversation-read-settings");
  const mode = make("span", "conversation-read-mode-tag", copy("长对话模式", "Long conversation mode"));
  const preferences = make("button", "secondary-button conversation-read-preferences", copy("更改偏好", "Change preferences"));
  preferences.type = "button"; preferences.addEventListener("click", onPreferences);
  settings.append(mode, preferences);
  element.append(heading, title, steps, hint, actions, settings);
  return {
    element,
    update(snapshot, { key, enabled } = {}) {
      const unseenIndex = key !== currentKey;
      if (!enabled || unseenIndex) {
        win.clearTimeout(completionTimer); completionTimer = 0;
        // A newly opened sidepanel can receive only the final snapshot.
        wasReading = Boolean(enabled && unseenIndex && snapshot.phase === "complete" && snapshot.count > 0);
        currentKey = key;
      }
      if (!enabled) return false;
      const backfill = snapshot.backfill?.phase || "";
      const backfilling = backfill === "running";
      const paused = backfill === "stopped" || backfill === "timeout";
      if (snapshot.phase === "loading" || backfilling) {
        win.clearTimeout(completionTimer); completionTimer = 0;
        wasReading = true;
      } else if (snapshot.phase === "complete" && snapshot.count > 0 && wasReading) {
        if (!completionTimer) completionTimer = win.setTimeout(() => {
          completionTimer = 0; wasReading = false; onChange();
        }, 800);
      } else {
        win.clearTimeout(completionTimer); completionTimer = 0; wasReading = false;
      }
      const completed = snapshot.phase === "complete";
      const failed = stepStates(snapshot).read === "error";
      if (!(snapshot.phase === "loading" || backfilling || paused && !failed
        || snapshot.phase === "error" && !Number(snapshot.count) || completed && wasReading)) return false;
      const states = failed ? stepStates(snapshot) : backfilling ? { read: "active", prepare: "pending" }
        : paused ? { read: "done", prepare: "done" } : stepStates(snapshot);
      for (const [step, state] of [[read, states.read], [prepare, states.prepare]]) {
        if (step.item.dataset.state === state) continue;
        step.item.dataset.state = state; step.icon.innerHTML = ICONS[state];
      }
      const headingText = failed ? copy("已加载对话暂时无法读取", "Couldn't read the loaded messages")
        : backfilling ? copy("正在补齐更早消息", "Loading earlier messages")
        : paused ? copy("已暂停补齐更早消息", "Paused loading earlier messages")
        : completed ? copy("已加载对话整理完成", "Loaded messages are ready")
        : copy("正在整理已加载对话", "Preparing loaded messages");
      if (heading.textContent !== headingText) heading.textContent = headingText;
      title.textContent = snapshot.title || ""; title.hidden = !snapshot.title;
      const format = value => Number(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
      const progress = snapshot.progress;
      number.textContent = progress?.total > 0 ? `${format(progress.count)} / ${format(progress.total)}`
        : Number(snapshot.count) > 0 ? format(snapshot.count) : "";
      hint.textContent = failed ? copy("请重试，或在页面内容加载后重新读取。", "Try again, or re-read after the page content loads.")
        : backfilling ? copy("正在通过网页自身的加载方式读取更早消息，网页位置会保持不变。操作网页可随时停止。",
          "Earlier messages are loading through the page itself. Your place on the page stays the same; interact with the page to stop.")
        : backfill === "stopped" ? copy("已在你操作网页时暂停，已读取的内容可正常使用。", "Paused when you used the page. Messages already read are ready to use.")
        : backfill === "timeout" ? copy("本次已读取一部分更早消息，可继续补齐。", "Some earlier messages were read. You can continue loading.")
        : completed ? copy("可在目录或大纲中阅读已加载内容。", "Browse loaded messages in the Table of Contents or Outline.")
        : copy("仅整理页面已加载的内容，较长的对话可能需要一点时间。", "Only messages loaded by the page are processed. Long conversations may take a moment.");
      actions.hidden = !failed && !paused;
      retry.hidden = !failed; resume.hidden = failed || !paused;
      retry.disabled = Date.now() < (snapshot.retryAt || 0);
      return true;
    }
  };
}
