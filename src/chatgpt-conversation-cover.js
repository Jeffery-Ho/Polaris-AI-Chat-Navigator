// This cover owns a sibling of the host app, never React's conversation nodes.
// Data completion and native-list readiness are separate states, shown as two steps.
const ICONS = {
  active: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5a7.5 7.5 0 1 0 7.5 7.5"/></svg>',
  done: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="m6.75 10.25 2.25 2.25 4.25-4.5"/></svg>',
  error: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 6.25v4.5M10 13.5v.25"/></svg>',
  pending: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/></svg>'
};

// Polaris sidepanel palette: warm paper neutrals with a terracotta accent.
const THEME = `
  :host{color-scheme:light;--bg:#faf9f7;--elevated:#ffffff;--fg:#282522;--secondary:#625d57;--muted:#8b847d;--line:#e2ddd7;--accent:#b85c3a;--accent-fg:#ffffff;--danger:#c2410c;font:15px/1.55 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--fg)}
  :host([data-theme=dark]){color-scheme:dark;--bg:#191817;--elevated:#1e1c1a;--fg:#f2efeb;--secondary:#c2bbb4;--muted:#918981;--line:#38332f;--accent:#e69a78;--accent-fg:#271812;--danger:#f87171}
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

// Reading stays silent until the first message arrives; if none arrives in
// time, the chat was not found and the user is asked to refresh instead.
const STALL_MS = 6000;

export function createChatGptConversationCover({ window: win, logoUrl, locale = "en", onRetry, onDismiss, onStateChange, reload = () => win.location.reload() }) {
  const doc = win.document;
  const zh = locale === "zh";
  let host = null;
  let main = null;
  let wasInert = false;
  let busy = null;
  let previousFocus = null;
  let generation = "";
  let dismissed = false;
  let observer = null;
  let ui = null;
  let notice = null;
  let noticeKind = "";
  let noticeDismissed = false;
  let waitingSince = null;
  let stallTimer = 0;
  let stalled = false;
  let last = null;
  const copy = (cn, en) => zh ? cn : en;
  function position() {
    if (!host || !main?.isConnected) return;
    const rect = main.getBoundingClientRect();
    const left = Math.max(0, rect.left); const top = Math.max(0, rect.top);
    Object.assign(host.style, { left: `${left}px`, top: `${top}px`,
      width: `${Math.max(0, Math.min(win.innerWidth, rect.right) - left)}px`,
      height: `${Math.max(0, Math.min(win.innerHeight, rect.bottom) - top)}px` });
  }
  function close() {
    if (!host) return;
    observer?.disconnect(); observer = null;
    win.removeEventListener("resize", position); win.removeEventListener("scroll", position, true);
    const restoreFocus = host.shadowRoot.contains(doc.activeElement?.shadowRoot?.activeElement) || doc.activeElement === host;
    if (!wasInert) main?.removeAttribute("inert");
    if (busy === null) main?.removeAttribute("aria-busy"); else main?.setAttribute("aria-busy", busy);
    host.remove(); host = null; ui = null; main = null;
    if (restoreFocus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }
  function skip() { dismissed = true; close(); onDismiss?.(); }
  function mount() {
    main = doc.querySelector("main");
    if (!main) return false;
    previousFocus = doc.activeElement;
    wasInert = main.hasAttribute("inert"); busy = main.getAttribute("aria-busy");
    main.setAttribute("inert", ""); main.setAttribute("aria-busy", "true");
    host = doc.createElement("div"); host.id = "polaris-conversation-cover";
    Object.assign(host.style, { position: "fixed", zIndex: "2147483645", isolation: "isolate" });
    const shadow = host.attachShadow({ mode: "open" });
    const style = doc.createElement("style");
    style.textContent = `
      ${THEME}
      .surface{position:absolute;inset:0;overflow:auto;display:flex;flex-direction:column;outline:none;
        background:radial-gradient(ellipse 70% 45% at 50% 0%,color-mix(in srgb,var(--accent) 12%,transparent),transparent 70%) var(--bg)}
      .content{width:min(100% - 48px,400px);margin:auto;padding:48px 0 32px}
      .brand{display:flex;align-items:center;gap:8px;min-width:0;color:var(--muted);font-size:13px}.brand img{width:22px;height:22px;flex:none;object-fit:contain;border:1px solid color-mix(in srgb,var(--accent) 28%,var(--line));border-radius:6px}.brand strong{flex:none;font-weight:600;color:var(--secondary)}
      .title{min-width:0;margin:0;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.title:not(:empty)::before{content:"·";margin-right:8px}
      .status{margin:20px 0 0;font-size:22px;line-height:1.3;font-weight:600;letter-spacing:-.02em}
      .steps{list-style:none;margin:28px 0 0;padding:0;border-top:1px solid var(--line)}
      .step{display:flex;align-items:center;gap:12px;min-height:52px;border-bottom:1px solid var(--line);color:var(--fg)}
      .step svg{width:20px;height:20px;flex:none;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
      .step .icon{display:flex;color:var(--muted)}.step .label{flex:1}.step .number{color:var(--secondary);font-variant-numeric:tabular-nums}
      .step[data-state=active] .icon{color:var(--accent)}.step[data-state=done] .icon{color:var(--secondary)}.step[data-state=error] .icon{color:var(--danger)}
      .step[data-state=pending]{color:var(--muted)}
      .hint{margin:16px 0 0;color:var(--secondary);font-size:14px;line-height:1.6}.hint:empty{display:none}
      .actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px}
      button{font:inherit;font-size:14px;line-height:1.4;min-height:36px;border:1px solid var(--line);border-radius:999px;background:transparent;color:var(--fg);padding:7px 16px;cursor:pointer}
      button:hover{background:color-mix(in srgb,var(--fg) 6%,transparent)}button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}button[hidden]{display:none}
      .retry{background:var(--accent);border-color:var(--accent);color:var(--accent-fg)}.retry:hover{background:color-mix(in srgb,var(--accent) 88%,var(--fg))}
      footer{padding:16px 24px 20px;color:var(--muted);font-size:12px;text-align:center}
      @media(max-height:560px){.content{padding:24px 0}.steps{margin-top:20px}.actions{margin-top:16px}}
      @media(prefers-reduced-motion:no-preference){.step[data-state=active] svg{animation:spin .9s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}}
    `;
    const make = (tag, className, text = "") => { const node = doc.createElement(tag); node.className = className; node.textContent = text; return node; };
    const surface = make("section", "surface"); surface.setAttribute("role", "region"); surface.setAttribute("aria-label", copy("打开完整对话", "Open the full conversation"));
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
    doc.body.append(host); ui = { title, status, read, prepare, number, hint, retry };
    if (typeof win.ResizeObserver === "function") { observer = new win.ResizeObserver(position); observer.observe(main); }
    win.addEventListener("resize", position); win.addEventListener("scroll", position, true); position();
    surface.focus({ preventScroll: true });
    return true;
  }
  // Without a conversation the composer must stay usable, so this is a
  // non-modal card beside ChatGPT's chat list that points the user to it.
  function sidebarOpen() {
    return (doc.querySelector("nav")?.getBoundingClientRect().width || 0) >= 120;
  }
  function placeNotice() {
    if (!notice) return;
    const rect = doc.querySelector("main")?.getBoundingClientRect() || { left: 0, top: 0, width: win.innerWidth };
    const width = Math.min(360, Math.max(0, rect.width - 32));
    Object.assign(notice.style, { left: `${Math.max(0, rect.left) + 16}px`, top: `${Math.max(0, rect.top) + 64}px`, width: `${width}px` });
  }
  function hideNotice() {
    if (!notice) return;
    win.removeEventListener("resize", placeNotice);
    notice.remove(); notice = null; noticeKind = "";
  }
  // kind "await": no chat is open; kind "refresh": the open chat was not read.
  function showNotice(theme, kind = "await") {
    if (kind === "await" && noticeDismissed) return;
    if (notice && noticeKind !== kind) hideNotice();
    if (!notice) {
      notice = doc.createElement("div"); notice.id = "polaris-conversation-notice";
      Object.assign(notice.style, { position: "fixed", zIndex: "2147483645" });
      const shadow = notice.attachShadow({ mode: "open" });
      const style = doc.createElement("style");
      style.textContent = `
        ${THEME}
        .card{display:flex;align-items:flex-start;gap:10px;padding:12px 8px 12px 12px;border:1px solid color-mix(in srgb,var(--accent) 35%,var(--line));border-radius:12px;background:var(--elevated);box-shadow:0 4px 12px rgb(40 37 34 / .12)}
        :host([data-theme=dark]) .card{box-shadow:0 4px 16px rgb(0 0 0 / .32)}
        .arrow{display:flex;flex:none;margin-top:1px;color:var(--accent)}.arrow svg{width:20px;height:20px;stroke-width:2}
        .text{flex:1;min-width:0}.eyebrow{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:12px}.eyebrow img{width:14px;height:14px;object-fit:contain}
        strong{display:block;margin-top:2px;font-size:14px;font-weight:600}p{margin:2px 0 0;color:var(--secondary);font-size:13px;line-height:1.5}
        button{flex:none;display:flex;width:28px;height:28px;align-items:center;justify-content:center;border:0;border-radius:999px;background:transparent;color:var(--muted);cursor:pointer;padding:0}
        button:hover{background:color-mix(in srgb,var(--fg) 6%,transparent);color:var(--fg)}button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
        .reload{width:auto;height:auto;margin-top:10px;padding:6px 14px;border-radius:999px;background:var(--accent);color:var(--accent-fg);font:inherit;font-size:13px;line-height:1.4}
        .reload:hover{background:color-mix(in srgb,var(--accent) 88%,var(--fg));color:var(--accent-fg)}
        svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
        @media(prefers-reduced-motion:no-preference){.arrow{animation:nudge 1.2s var(--ease,ease-in-out) 3}@keyframes nudge{50%{transform:translateX(-4px)}}}
      `;
      const card = doc.createElement("div"); card.className = "card"; card.setAttribute("role", "status");
      const arrow = doc.createElement("span"); arrow.className = "arrow";
      arrow.innerHTML = kind === "refresh"
        ? '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 10a6 6 0 1 1-1.76-4.24M16 4v3.5h-3.5"/></svg>'
        : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 10H4m5-5-5 5 5 5"/></svg>';
      if (kind === "refresh") arrow.style.animation = "none";
      const text = doc.createElement("div"); text.className = "text";
      const eyebrow = doc.createElement("div"); eyebrow.className = "eyebrow";
      if (logoUrl) { const logo = doc.createElement("img"); logo.src = logoUrl; logo.alt = ""; eyebrow.append(logo); }
      eyebrow.append(copy("Polaris · 已开启完整对话", "Polaris · Full conversation is on"));
      const heading = doc.createElement("strong");
      heading.textContent = kind === "refresh" ? copy("没有读取到这个会话", "Couldn't read this chat") : copy("选择一个会话开始读取", "Pick a chat to start reading");
      const body = doc.createElement("p"); body.className = "body";
      text.append(eyebrow, heading, body);
      if (kind === "refresh") {
        const button = doc.createElement("button"); button.type = "button"; button.className = "reload";
        button.textContent = copy("刷新页面", "Refresh page");
        button.addEventListener("click", () => reload());
        text.append(button);
      }
      const dismiss = doc.createElement("button"); dismiss.type = "button"; dismiss.className = "dismiss";
      dismiss.setAttribute("aria-label", copy("关闭提示", "Dismiss"));
      dismiss.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg>';
      dismiss.addEventListener("click", () => { if (kind === "await") noticeDismissed = true; else dismissed = true; hideNotice(); onDismiss?.(); });
      card.append(arrow, text, dismiss); shadow.append(style, card);
      doc.body.append(notice); win.addEventListener("resize", placeNotice); noticeKind = kind;
    }
    notice.dataset.theme = theme;
    notice.shadowRoot.querySelector(".body").textContent = kind === "refresh"
      ? copy("刷新页面后，Polaris 会重新读取完整对话。", "Refresh the page and Polaris reads the full conversation again.")
      : sidebarOpen()
      ? copy("点击左侧列表中的任意会话，Polaris 会读取它的全部消息。", "Click any chat in the sidebar and Polaris reads every message in it.")
      : copy("先展开左侧边栏，再点击任意会话，Polaris 会读取它的全部消息。", "Open the sidebar, then click any chat and Polaris reads every message in it.");
    placeNotice();
  }
  const now = () => win.performance?.now?.() ?? Date.now();
  function resetWaiting() { win.clearTimeout(stallTimer); stallTimer = 0; waitingSince = null; stalled = false; }
  function paintStep({ item, icon }, state) {
    if (item.dataset.state === state) return;
    item.dataset.state = state; icon.innerHTML = ICONS[state];
  }
  return {
    awaitConversation(theme = "light") {
      close(); resetWaiting(); generation = ""; dismissed = false; showNotice(theme);
    },
    update(snapshot, theme = "light") {
      last = { snapshot, theme };
      if (!snapshot) { hideNotice(); close(); resetWaiting(); generation = ""; dismissed = false; return; }
      if (snapshot.generation !== generation) { close(); resetWaiting(); generation = snapshot.generation; dismissed = false; }
      if (dismissed || snapshot.phase === "complete" && snapshot.native?.phase === "ready") { hideNotice(); close(); resetWaiting(); return; }
      // Nothing read yet: no cover over an empty count. A failure or a quiet
      // wait means the chat was not found, so ask for a refresh instead.
      if (!Number(snapshot.count) && snapshot.phase !== "complete") {
        close();
        waitingSince ??= now();
        if (snapshot.phase === "error" || now() - waitingSince >= STALL_MS) { stalled = true; win.clearTimeout(stallTimer); stallTimer = 0; showNotice(theme, "refresh"); }
        else if (!stallTimer) stallTimer = win.setTimeout(() => { stallTimer = 0; if (last) this.update(last.snapshot, last.theme); onStateChange?.(); }, STALL_MS - (now() - waitingSince));
        return;
      }
      hideNotice(); resetWaiting();
      if (host && main !== doc.querySelector("main")) close();
      if (!host && !mount()) return;
      host.dataset.theme = theme;
      const states = stepStates(snapshot);
      const failed = states.read === "error" || states.prepare === "error";
      ui.title.textContent = snapshot.title || ""; ui.title.title = snapshot.title || "";
      ui.number.textContent = Number(snapshot.count || 0).toLocaleString(zh ? "zh-CN" : "en-US");
      paintStep(ui.read, states.read); paintStep(ui.prepare, states.prepare);
      ui.status.textContent = failed ? copy("完整对话还没准备好", "The full conversation isn't ready yet") : copy("正在打开完整对话", "Opening the full conversation");
      ui.hint.textContent = failed ? copy("可以重试，或先阅读已经加载的消息。", "Try again, or read the messages already loaded.") : states.read === "active" ? copy("较长的对话可能需要一点时间，无需向上翻页。", "Long conversations may take a moment. No need to scroll up.") : "";
      ui.retry.hidden = !failed;
    },
    isShowing: () => Boolean(host),
    // Waiting for the first message, before either the cover or a refresh notice.
    isWaiting: () => waitingSince !== null && !stalled && !dismissed,
    isStalled: () => stalled && !dismissed,
    dispose() { close(); hideNotice(); resetWaiting(); last = null; generation = ""; dismissed = false; noticeDismissed = false; }
  };
}
