import { buildConversationExport } from "./conversation-export.js";

export function createSidepanelConversationExport({ document: doc, locale, appName, onRead }) {
  const win = doc.defaultView;
  const label = (zh, en) => locale === "zh" ? zh : en;
  let sourceKey = "";
  let available = false;
  let busy = false;
  let operation = 0;
  let dialog = null;
  const toolbar = make("div", "conversation-actions");
  const status = make("span", "conversation-export-status"); status.setAttribute("role", "status");
  const trigger = make("button", "conversation-copy-button"); trigger.type = "button";
  trigger.setAttribute("aria-label", label("复制会话全文", "Copy conversation"));
  trigger.title = label("复制会话全文", "Copy conversation");
  const icon = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24"); icon.setAttribute("aria-hidden", "true");
  const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M8 8h13v13H8zM16 8V3H3v13h5"); icon.append(path); trigger.append(icon);
  toolbar.append(status, trigger);

  function make(tag, className, text = "") {
    const node = doc.createElement(tag); node.className = className; node.textContent = text; return node;
  }
  function closeDialog(restoreFocus = true) {
    if (!dialog) return;
    const current = dialog; dialog = null;
    if (current.open) current.close();
    current.remove();
    if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
  }
  function showDialog(data, scope) {
    closeDialog(false);
    const current = make("dialog", "conversation-export-dialog"); dialog = current;
    current.setAttribute("aria-labelledby", "conversation-export-title");
    const title = make("h2", "conversation-export-title", label("导出", "Export"));
    title.id = "conversation-export-title";
    const header = make("div", "conversation-export-header");
    const close = make("button", "conversation-export-close"); close.type = "button";
    close.setAttribute("aria-label", label("关闭", "Close")); close.title = label("关闭", "Close");
    const closeIcon = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    closeIcon.setAttribute("viewBox", "0 0 24 24"); closeIcon.setAttribute("aria-hidden", "true");
    const closePath = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    closePath.setAttribute("d", "m6 6 12 12M18 6 6 18"); closeIcon.append(closePath); close.append(closeIcon);
    close.addEventListener("click", () => closeDialog());
    header.append(title, close);
    current.append(header, make("p", "conversation-export-description", scope === "complete"
      ? label("包含整个会话的用户消息与 AI 回复。", "Includes every user message and AI reply in this conversation.")
      : label("包含当前已读取的用户消息与 AI 回复。", "Includes user messages and AI replies currently read from the page.")));
    const choices = make("div", "conversation-export-formats");
    choices.setAttribute("role", "group"); choices.setAttribute("aria-label", label("导出格式", "Export format"));
    let format = "md";
    const save = make("button", "conversation-export-save", label("导出 Markdown", "Export Markdown")); save.type = "button";
    for (const [value, name, hint] of [
      ["md", "Markdown", label("适合编辑、整理笔记", "For editing and notes")],
      ["html", "HTML", label("保留排版，在浏览器中打开", "Formatted for reading in a browser")]
    ]) {
      const choice = make("button", "conversation-export-format"); choice.type = "button";
      choice.dataset.format = value; choice.setAttribute("aria-pressed", String(value === format));
      const copy = make("span", "conversation-export-format-copy");
      copy.append(make("strong", "", name), make("small", "", hint));
      choice.append(make("span", "conversation-export-extension", `.${value}`), copy);
      choice.addEventListener("click", () => {
        format = value;
        choices.querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button === choice)));
        save.textContent = label(`导出 ${name}`, `Export ${name}`);
      });
      choices.append(choice);
    }
    const actions = make("div", "conversation-export-footer");
    const feedback = make("p", "conversation-export-status"); feedback.setAttribute("role", "alert"); feedback.hidden = true;
    save.addEventListener("click", () => {
      feedback.hidden = true; feedback.textContent = "";
      let objectUrl;
      try {
        const filename = `${data.filename}.${format}`;
        objectUrl = win.URL.createObjectURL(new win.Blob([format === "md" ? data.markdown : data.html], {
          type: format === "md" ? "text/markdown;charset=utf-8" : "text/html;charset=utf-8"
        }));
        const link = doc.createElement("a"); link.href = objectUrl; link.download = filename;
        link.hidden = true; doc.body.append(link); link.click(); link.remove();
      } catch { feedback.textContent = label("导出失败，请重试。", "Export failed. Try again."); feedback.hidden = false; }
      finally { if (objectUrl) win.setTimeout(() => win.URL.revokeObjectURL(objectUrl), 1000); }
    });
    actions.append(save); current.append(feedback, choices, actions);
    current.addEventListener("close", () => { if (dialog === current) closeDialog(); });
    current.addEventListener("click", (event) => {
      if (event.target !== current) return;
      const rect = current.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog();
    });
    doc.body.append(current); current.showModal();
    choices.querySelector("button").focus();
  }
  trigger.addEventListener("click", async () => {
    if (!available || busy) return;
    const job = ++operation; busy = true; trigger.disabled = true; trigger.setAttribute("aria-busy", "true");
    status.textContent = label("正在复制…", "Copying…");
    try {
      const conversation = await onRead();
      if (job !== operation) return;
      if (!conversation.messages?.length) throw new Error("No messages");
      const data = buildConversationExport({ document: doc, conversation, locale, appName });
      if (!win.navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await win.navigator.clipboard.writeText(data.text);
      if (job !== operation) return;
      status.textContent = "";
      showDialog(data, conversation.scope);
    } catch {
      if (job === operation) status.textContent = label("复制失败，请重试。", "Copy failed. Try again.");
    } finally {
      if (job === operation) { busy = false; trigger.disabled = !available; trigger.removeAttribute("aria-busy"); }
    }
  });
  return {
    element: toolbar,
    update({ key, enabled, complete = false }) {
      if (sourceKey !== key || !enabled) {
        operation++; busy = false; status.textContent = ""; trigger.removeAttribute("aria-busy"); closeDialog(false);
      }
      sourceKey = key; available = enabled;
      trigger.disabled = !available || busy;
      trigger.title = !enabled ? label("会话读取完成后可复制", "Available when the conversation is ready")
        : complete ? label("复制整个会话", "Copy entire conversation") : label("复制已读取的会话", "Copy the conversation read from this page");
    }
  };
}
