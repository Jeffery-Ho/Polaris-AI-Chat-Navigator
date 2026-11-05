// Own only an inline status node; never disable or cover the native app.
// Data completion and native-list readiness are separate states, shown as two steps.
const ICONS = {
  active: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5a7.5 7.5 0 1 0 7.5 7.5"/></svg>',
  done: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="m6.75 10.25 2.25 2.25 4.25-4.5"/></svg>',
  error: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 6.25v4.5M10 13.5v.25"/></svg>',
  pending: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/></svg>'
};

// Polaris sidepanel palette: warm paper neutrals with a terracotta accent.
const THEME = `
  :host{color-scheme:light;--bg:#fafaf8;--elevated:#ffffff;--fg:#2a2724;--secondary:#57534c;--muted:#77726a;--line:#e0ddd7;--accent:#b85c3a;--accent-fg:#ffffff;--danger:#c2410c;font:15px/1.55 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--fg)}
  :host([data-theme=dark]){color-scheme:dark;--bg:#1a1918;--elevated:#222120;--fg:#f3f1ed;--secondary:#c4c0b8;--muted:#9a958c;--line:#3a3835;--accent:#e69a78;--accent-fg:#271812;--danger:#f87171}
  *{box-sizing:border-box}
`;

export function stepStates(snapshot) {
  const readFailed = ["error", "partial"].includes(snapshot.phase);
  const read = readFailed ? "error" : snapshot.phase === "complete" ? "done" : "active";
  const native = snapshot.native?.phase;
  const prepare = native === "ready" ? "done" : native === "error" ? "error"
    : native === "preparing" || read === "done" ? "active" : "pending";
  return { read, prepare };
}

export function createChatGptConversationCover({ window: win, logoUrl, locale = "en", onRetry, onDismiss }) {
  const doc = win.document;
  const zh = locale === "zh";
  let host = null;
  let main = null;
  let previousFocus = null;
  let generation = "";
  let dismissed = false;
  let observer = null;
  let ui = null;
  let waiting = false;
  let stalled = false;
  const copy = (cn, en) => zh ? cn : en;
  function place() {
    if (!host) return;
    main = doc.querySelector("main");
    if (!main) { host.remove(); return; }
    const turn = main.querySelector('.conversation-container, [data-testid^="conversation-turn-"], article[data-turn]');
    // Gemini exposes the final history list before native messages mount.
    // Reading progress must not wait for the body it is helping prepare.
    const list = win.location.hostname === "gemini.google.com"
      ? main.querySelector("infinite-scroller.chat-history") : turn?.parentElement || main;
    if (!list) { host.remove(); return; }
    if (host.parentElement === list) return;
    const header = list.querySelector(":scope > header");
    if (header) header.after(host);
    else list.prepend(host);
  }
  function close() {
    if (!host) return;
    observer?.disconnect(); observer = null;
    const restoreFocus = host.shadowRoot.contains(doc.activeElement?.shadowRoot?.activeElement) || doc.activeElement === host;
    host.remove(); host = null; ui = null; main = null;
    if (restoreFocus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }
  function skip() { dismissed = true; close(); onDismiss?.(); }
  function mount() {
    previousFocus = doc.activeElement;
    host = doc.createElement("polaris-conversation-status"); host.id = "polaris-conversation-cover";
    const shadow = host.attachShadow({ mode: "open" });
    const style = doc.createElement("style");
    style.textContent = `
      ${THEME}
      :host{display:block;position:sticky;top:48px;flex:0 0 auto;width:calc(100% - 32px);max-width:560px;margin:48px auto 24px;font-size:14px;animation:none!important;transition:none!important}
      .surface{border:1px solid var(--line);border-radius:12px;background:var(--bg);outline:none}
      .content{padding:24px}
      .brand{display:flex;align-items:center;gap:8px;min-width:0;color:var(--muted);font-size:12px}.brand img{width:20px;height:20px;flex:none;object-fit:contain}.brand strong{flex:none;font-weight:600;color:var(--secondary)}
      .title{min-width:0;margin:0;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.title:not(:empty)::before{content:"·";margin-right:8px}
      .status{margin:12px 0 0;font-size:16px;line-height:1.4;font-weight:600;letter-spacing:-.02em}
      .steps{display:flex;flex-wrap:wrap;gap:8px 24px;list-style:none;margin:12px 0 0;padding:0}
      .step{display:flex;align-items:center;gap:8px;min-height:28px;color:var(--fg);font-size:13px}
      .step svg{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
      .step .icon{display:flex;color:var(--muted)}.step .number{color:var(--secondary);font-variant-numeric:tabular-nums}
      .step[data-state=active] .icon{color:var(--accent)}.step[data-state=done] .icon{color:var(--secondary)}.step[data-state=error] .icon{color:var(--danger)}
      .step[data-state=pending]{color:var(--muted)}
      .hint{margin:8px 0 0;color:var(--secondary);font-size:13px;line-height:1.6}.hint:empty{display:none}
      .actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
      .actions[hidden]{display:none}
      button{font:inherit;font-size:13px;line-height:1.4;min-height:36px;border:1px solid var(--line);border-radius:6px;background:var(--elevated);color:var(--fg);padding:8px 12px;cursor:pointer}
      button:hover{background:color-mix(in srgb,var(--fg) 6%,var(--elevated))}button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}button[hidden]{display:none}
      .retry{background:var(--accent);border-color:var(--accent);color:var(--accent-fg)}.retry:hover{background:color-mix(in srgb,var(--accent) 88%,var(--fg))}
      footer{padding:16px 24px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
      @media(prefers-reduced-motion:no-preference){.step[data-state=active] svg{animation:spin .9s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}}
    `;
    const make = (tag, className, text = "") => { const node = doc.createElement(tag); node.className = className; node.textContent = text; return node; };
    const surface = make("section", "surface"); surface.setAttribute("role", "region"); surface.setAttribute("aria-label", copy("完整对话读取状态", "Conversation reading status"));
    surface.tabIndex = -1;
    const content = make("div", "content"); const brand = make("div", "brand");
    if (logoUrl) { const logo = make("img", ""); logo.src = logoUrl; logo.alt = ""; brand.append(logo); }
    const title = make("p", "title"); brand.append(make("strong", "", "Polaris"), title);
    const status = make("h2", "status"); status.setAttribute("role", "status");
    const steps = make("ol", "steps"); steps.setAttribute("aria-label", copy("进度", "Progress"));
    const step = (name, label) => {
      const item = make("li", `step ${name}`); const icon = make("span", "icon");
      item.append(icon, make("span", "label", label)); steps.append(item); return { item, icon };
    };
    const read = step("read", copy("读取消息", "Read messages")); const number = make("span", "number"); read.item.append(number);
    const prepare = step("prepare", copy("准备正文", "Prepare the conversation"));
    const hint = make("p", "hint");
    const actions = make("div", "actions"); const retry = make("button", "retry", copy("重试", "Try again")); retry.type = "button";
    retry.addEventListener("click", () => onRetry?.());
    const partial = make("button", "partial", copy("先阅读已加载内容", "Read loaded messages")); partial.type = "button"; partial.addEventListener("click", skip);
    actions.append(retry, partial); content.append(brand, status, steps, hint, actions);
    surface.append(content, make("footer", "", copy("已开启完整对话 · 可在 Polaris 偏好设置中更改", "Full conversation is on · Change this in Polaris preferences")));
    shadow.append(style, surface); shadow.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); skip(); } });
    ui = { title, status, read, prepare, number, hint, retry, partial, actions };
    place();
    observer = new win.MutationObserver(place);
    observer.observe(doc.documentElement, { childList: true, subtree: true });
    return true;
  }
  function resetWaiting() { waiting = false; stalled = false; }
  function paintStep({ item, icon }, state) {
    if (item.dataset.state === state) return;
    item.dataset.state = state; icon.innerHTML = ICONS[state];
  }
  return {
    update(snapshot, theme = "light") {
      if (!snapshot) { close(); resetWaiting(); generation = ""; dismissed = false; return; }
      if (snapshot.generation !== generation) { close(); resetWaiting(); generation = snapshot.generation; dismissed = false; }
      if (dismissed || snapshot.refreshing && snapshot.native?.phase === 'ready' || snapshot.phase === "complete" && snapshot.native?.phase === "ready") { close(); resetWaiting(); return; }
      const states = stepStates(snapshot);
      const failed = states.read === "error" || states.prepare === "error";
      const count = Number(snapshot.count) || 0;
      // Mounted native messages also confirm the conversation while its first
      // history request is pending. Do not wait for the final API batch to show progress.
      const nativeContent = !failed && !count && [...doc.querySelectorAll('main [data-message-author-role="user"], main [data-message-author-role="assistant"], main user-query .query-text, main user-query .query-content, main model-response message-content')]
        .some(node => node.textContent.trim() || node.querySelector('img'));
      if (!count && !nativeContent) {
        close(); waiting = !failed; stalled = failed;
        return;
      }
      resetWaiting(); waiting = !failed;
      if (!host && !mount()) return;
      host.dataset.theme = theme;
      ui.title.textContent = snapshot.title || ""; ui.title.title = snapshot.title || "";
      ui.number.textContent = count ? count.toLocaleString(zh ? "zh-CN" : "en-US") : "";
      paintStep(ui.read, states.read); paintStep(ui.prepare, states.prepare);
      ui.status.textContent = failed ? copy("完整对话还没准备好", "The full conversation isn't ready yet") : copy("正在读取完整对话", "Reading the full conversation");
      ui.hint.textContent = failed ? copy("可以重试，或先阅读已经加载的消息。", "Try again, or read the messages already loaded.") : states.read === "active" ? copy("较长的对话可能需要一点时间，无需向上翻页。", "Long conversations may take a moment. No need to scroll up.") : "";
      ui.retry.hidden = !failed;
      ui.partial.hidden = !failed || !Number(snapshot.count);
      ui.actions.hidden = !failed;
    },
    isShowing: () => Boolean(host?.isConnected),
    isWaiting: () => waiting && !dismissed,
    // A failed empty read, never an elapsed-time guess.
    isStalled: () => stalled && !dismissed,
    dispose() { close(); resetWaiting(); generation = ""; dismissed = false; }
  };
}
