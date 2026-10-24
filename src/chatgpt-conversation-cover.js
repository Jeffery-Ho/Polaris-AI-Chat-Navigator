// This cover owns a sibling of the host app, never React's conversation nodes.
// Data completion and native-list readiness are separate states.
export function createChatGptConversationCover({ window: win, logoUrl, backdropUrl, locale = "en", onRetry }) {
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
  function skip() { dismissed = true; close(); }
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
      :host{color-scheme:light;--bg:#fcfcfd;--fg:#171717;--muted:#77777c;--line:#dedee4;--button:#f0f0f4;font:16px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--fg)}
      :host([data-theme=dark]){color-scheme:dark;--bg:#181818;--fg:#f0f0f2;--muted:#a4a4ad;--line:#3c3c44;--button:#29292f}
      *{box-sizing:border-box} .surface{position:absolute;inset:0;overflow:auto;background:var(--bg);display:flex;flex-direction:column;text-align:center;outline:none}
      .backdrop{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;opacity:.5} :host([data-theme=dark]) .backdrop{opacity:.12;filter:brightness(.55)}
      .content{position:relative;width:min(100% - 48px,440px);margin:auto;padding:48px 0 40px}
      .brand{display:flex;justify-content:center;align-items:center;gap:10px;color:var(--muted);font-size:15px;font-weight:600;letter-spacing:.02em}.brand img{width:24px;height:24px;object-fit:contain}
      .title{font-size:14px;font-weight:400;color:var(--muted);white-space:nowrap;text-overflow:ellipsis;overflow:hidden;margin:12px 0 0}
      .divider{height:1px;background:var(--line);max-width:300px;margin:32px auto 24px}
      .number{font-size:clamp(64px,8vw,92px);font-weight:400;line-height:1.15;letter-spacing:-.05em;font-variant-numeric:tabular-nums}
      .caption{font-size:15px;color:var(--muted);margin-top:12px}.status{font-size:18px;line-height:1.4;font-weight:600;letter-spacing:-.025em;margin:32px 0 12px}
      .description{margin:0 auto;max-width:410px;color:var(--muted);font-size:15px;line-height:1.7}.hint{margin:16px auto 0;max-width:370px;color:var(--muted);font-size:14px;line-height:1.6}
      .actions{display:flex;justify-content:center;flex-wrap:wrap;gap:12px;margin-top:28px}button{font:inherit;font-size:15px;line-height:1.4;min-height:44px;border:1px solid var(--line);border-radius:999px;background:var(--button);color:var(--fg);padding:11px 24px;cursor:pointer}button:hover{filter:brightness(.96)}button:focus-visible{outline:2px solid #777ef8;outline-offset:4px}button[hidden]{display:none}
      footer{position:relative;padding:16px 24px 24px;color:var(--muted);font-size:13px}
      @media(max-height:620px){.content{padding:28px 0}.divider{margin:20px auto}.status{margin-top:24px}.actions{margin-top:24px}footer{padding-bottom:12px}}
      @media(prefers-reduced-motion:no-preference){.number{transition:opacity .15s}}
    `;
    const make = (tag, className, text = "") => { const node = doc.createElement(tag); node.className = className; node.textContent = text; return node; };
    const surface = make("section", "surface"); surface.setAttribute("role", "region"); surface.setAttribute("aria-label", copy("打开完整对话", "Open the full conversation"));
    surface.tabIndex = -1;
    if (backdropUrl) { const backdrop = make("img", "backdrop"); backdrop.src = backdropUrl; backdrop.alt = ""; surface.append(backdrop); }
    const content = make("div", "content"); const brand = make("div", "brand");
    if (logoUrl) { const logo = make("img", ""); logo.src = logoUrl; logo.alt = ""; brand.append(logo); }
    brand.append(make("span", "", "Polaris"));
    const title = make("p", "title"); const number = make("div", "number");
    const caption = make("p", "caption", copy("条消息已读取", "messages read"));
    const status = make("h2", "status"); status.setAttribute("role", "status");
    const description = make("p", "description"); const hint = make("p", "hint");
    const actions = make("div", "actions"); const retry = make("button", "retry", copy("重试", "Try again")); retry.type = "button";
    retry.addEventListener("click", () => onRetry?.());
    const partial = make("button", "partial", copy("先打开已加载内容", "Open partial chat instead")); partial.type = "button"; partial.addEventListener("click", skip);
    actions.append(retry, partial); content.append(brand, title, make("div", "divider"), number, caption, status, description, hint, actions);
    surface.append(content, make("footer", "", copy("已开启完整对话 · 可在 Polaris 偏好设置中更改", "Full conversation is on · Change this in Polaris preferences")));
    shadow.append(style, surface); shadow.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); skip(); } });
    doc.body.append(host); ui = { title, number, status, description, hint, retry };
    if (typeof win.ResizeObserver === "function") { observer = new win.ResizeObserver(position); observer.observe(main); }
    win.addEventListener("resize", position); win.addEventListener("scroll", position, true); position();
    surface.focus({ preventScroll: true });
    return true;
  }
  return {
    update(snapshot, theme = "light") {
      if (!snapshot) { close(); generation = ""; dismissed = false; return; }
      if (snapshot.generation !== generation) { close(); generation = snapshot.generation; dismissed = false; }
      if (dismissed || snapshot.phase === "complete" && snapshot.native?.phase === "ready") { close(); return; }
      if (host && main !== doc.querySelector("main")) close();
      if (!host && !mount()) return;
      host.dataset.theme = theme;
      const failed = ["error", "partial"].includes(snapshot.phase) || snapshot.native?.phase === "error";
      ui.title.textContent = snapshot.title || ""; ui.title.title = snapshot.title || "";
      ui.number.textContent = Number(snapshot.count || 0).toLocaleString(zh ? "zh-CN" : "en-US");
      ui.status.textContent = failed ? copy("完整对话还没准备好", "The full conversation is not ready yet") : copy("正在打开完整对话", "Opening the full conversation");
      ui.description.textContent = failed ? copy("可以重试，或先阅读已经打开的消息。", "Try again, or start with the messages already available.") : copy("准备好后，就能搜索和打开这段对话中的每一条消息。", "Getting every message ready, so you can search and open anything in this conversation.");
      ui.hint.textContent = failed ? "" : snapshot.phase === "complete" ? copy("消息已读取，正在准备正文…", "Messages have been read. Preparing the conversation…") : copy("较长的对话可能需要一点时间，无需向上翻页。", "Long conversations may take a moment. No need to scroll up.");
      ui.retry.hidden = !failed;
    },
    dispose() { close(); generation = ""; dismissed = false; }
  };
}
