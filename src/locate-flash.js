// Briefly tints a located source in the Polaris terracotta accent, after any
// smooth scroll settles, so users can see where a TOC or Outline jump landed.
// The tint is a separate overlay: ChatGPT bubbles and message wrappers paint
// their own backgrounds, which would hide a background on the target itself.
// A rounded accent frame with a faint fill, like a selected message card.
const COLORS = {
  light: { border: "#b85c3a", fill: "rgba(184, 92, 58, 0.08)" },
  dark: { border: "#e69a78", fill: "rgba(230, 154, 120, 0.12)" }
};
const VISIBLE_MS = 1000;
const FADE_MS = 300;
const SETTLE_LIMIT_MS = 1500;
// Timers, not animation frames: some Chromium browsers (Dia) pause page frames
// while their side panel has focus, which would stall the wait forever.
const POLL_MS = 32;
const STABLE_POLLS = 3;
const PAD = 8;

export function createLocateFlash({ window: win, onReport }) {
  const doc = win.document;
  let current = null;
  let poll = 0;
  let timer = 0;
  const now = () => win.performance?.now?.() ?? Date.now();
  function cancel() {
    win.clearTimeout(poll); win.clearTimeout(timer);
    poll = 0; timer = 0;
    current?.animation?.cancel(); current?.overlay.remove(); current = null;
  }
  function play(element, theme) {
    const rect = element.getBoundingClientRect();
    // Long messages are clipped to the viewport, where the user is looking.
    const top = Math.max(0, rect.top - PAD); const bottom = Math.min(win.innerHeight, rect.bottom + PAD);
    if (bottom <= top) { onReport?.("offscreen"); return; }
    const color = COLORS[theme] || COLORS.light;
    const overlay = doc.createElement("div");
    overlay.dataset.polarisLocateFlash = "";
    overlay.setAttribute("aria-hidden", "true");
    Object.assign(overlay.style, { position: "fixed", left: `${rect.left - PAD}px`, top: `${top}px`, width: `${rect.width + PAD * 2}px`,
      height: `${bottom - top}px`, boxSizing: "border-box", border: `2px solid ${color.border}`, borderRadius: "12px", background: color.fill,
      pointerEvents: "none", zIndex: "2147483646" });
    doc.documentElement.append(overlay);
    const reduced = Boolean(win.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    const total = VISIBLE_MS + (reduced ? 0 : FADE_MS);
    const animation = overlay.animate?.([{ opacity: 1, offset: 0 }, { opacity: 1, offset: VISIBLE_MS / total }, { opacity: 0, offset: 1 }],
      { duration: total, easing: reduced ? "step-end" : "ease-out", fill: "forwards" }) || null;
    const entry = { overlay, animation };
    current = entry;
    const finish = () => { if (current === entry) { overlay.remove(); current = null; } };
    if (animation) animation.onfinish = finish;
    else timer = win.setTimeout(finish, total);
    onReport?.("shown");
  }
  return {
    // `resolve` finds the target again when the host's virtual list remounts
    // the message during the smooth scroll and the original node is detached.
    flash(element, { theme = "light", resolve } = {}) {
      cancel();
      const target = () => element?.isConnected ? element : (element = resolve?.() || null);
      if (!target()) { onReport?.("lost"); return; }
      // Wait until the target is on screen and has stopped moving.
      const started = now();
      let lastTop = NaN; let stable = 0;
      const check = () => {
        poll = 0;
        const expired = now() - started > SETTLE_LIMIT_MS;
        if (!target()) { if (expired) onReport?.("lost"); else poll = win.setTimeout(check, POLL_MS); return; }
        const rect = element.getBoundingClientRect();
        const inView = rect.bottom > 0 && rect.top < win.innerHeight;
        stable = Math.abs(rect.top - lastTop) < 2 ? stable + 1 : 0; lastTop = rect.top;
        if (inView && stable >= STABLE_POLLS || expired) play(element, theme);
        else poll = win.setTimeout(check, POLL_MS);
      };
      poll = win.setTimeout(check, POLL_MS);
    },
    cancel
  };
}
