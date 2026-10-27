// Paint the located reply only after scrolling settles, inside the conversation
// viewport, then use the Outline accent hold and fade.
const COLORS = {
  light: { border: "#b85c3a", fill: "rgba(184, 92, 58, 0.08)" },
  dark: { border: "#e69a78", fill: "rgba(230, 154, 120, 0.12)" }
};
const VISIBLE_MS = 1000;
const FADE_MS = 300;
const SETTLE_MS = 150;
const SETTLE_LIMIT_MS = 3000;
const FOLLOW_MS = 50;
const PAD = 8;

function targetRect(element) {
  const rect = element.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return rect;
  // display:contents wrappers have no box, although their children are visible.
  const boxes = [...element.querySelectorAll("*")].map((node) => node.getBoundingClientRect())
    .filter((box) => box.width > 0 && box.height > 0);
  if (!boxes.length) return null;
  const top = Math.min(...boxes.map((box) => box.top));
  const left = Math.min(...boxes.map((box) => box.left));
  const bottom = Math.max(...boxes.map((box) => box.bottom));
  const right = Math.max(...boxes.map((box) => box.right));
  return { top, left, bottom, right, width: right - left, height: bottom - top };
}

export function createLocateFlash({ window: win, onReport }) {
  const doc = win.document;
  let current = null;
  let timer = 0;
  let removeScrollListener = null;
  const now = () => win.performance?.now?.() ?? Date.now();
  function cancel() {
    win.clearTimeout(timer); timer = 0;
    removeScrollListener?.(); removeScrollListener = null;
    current?.remove(); current = null;
  }
  return {
    flash(element, { theme = "light", resolve, getViewport } = {}) {
      cancel();
      const color = COLORS[theme] || COLORS.light;
      const reduced = Boolean(win.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
      const started = now();
      let visibleAt = null; let restingAt = started; let previous = null;
      const moving = () => {
        restingAt = now(); visibleAt = null;
        if (current) current.style.visibility = "hidden";
      };
      win.addEventListener("scroll", moving, true);
      removeScrollListener = () => win.removeEventListener("scroll", moving, true);
      const check = () => {
        timer = 0;
        if (!element?.isConnected) { element = resolve?.() || null; previous = null; moving(); }
        const rect = element && targetRect(element);
        const time = now();
        const viewport = getViewport?.(element);
        const top = rect && Math.max(0, viewport?.top ?? 0, rect.top - PAD);
        const bottom = rect && Math.min(win.innerHeight, viewport?.bottom ?? win.innerHeight, rect.bottom + PAD);
        const left = rect && Math.max(0, viewport?.left ?? 0, rect.left - PAD);
        const right = rect && Math.min(win.innerWidth, viewport?.right ?? win.innerWidth, rect.right + PAD);
        if (time - started > SETTLE_LIMIT_MS + VISIBLE_MS + FADE_MS) { cancel(); onReport?.("unsettled"); return; }
        if (!rect || bottom <= top || right <= left) {
          previous = null; moving();
          if (time - started > SETTLE_LIMIT_MS) { cancel(); onReport?.(element ? "offscreen" : "lost"); return; }
        } else {
          // Raw bounds must settle too: a long reply's clipped frame can fill
          // the viewport and stay unchanged throughout the entire scroll.
          const geometry = [rect.top, rect.left, rect.bottom, rect.right, top, left, bottom, right];
          if (!previous || geometry.some((value, index) => Math.abs(value - previous[index]) >= 1)) moving();
          previous = geometry;
          if (time - restingAt >= SETTLE_MS) {
            if (!current) {
              current = doc.createElement("div");
              current.dataset.polarisLocateFlash = "";
              current.setAttribute("aria-hidden", "true");
              Object.assign(current.style, { position: "fixed", boxSizing: "border-box", border: `2px solid ${color.border}`,
                borderRadius: "12px", background: color.fill, pointerEvents: "none", zIndex: "2147483646", opacity: "1" });
              (doc.body || doc.documentElement).append(current);
              onReport?.("shown");
            }
            visibleAt ??= time;
            const elapsed = time - visibleAt;
            if (elapsed >= VISIBLE_MS + (reduced ? 0 : FADE_MS)) { cancel(); return; }
            Object.assign(current.style, { visibility: "visible", left: `${left}px`, top: `${top}px`,
              width: `${right - left}px`, height: `${bottom - top}px`,
              transition: reduced ? "none" : `opacity ${FADE_MS}ms ease-out`, opacity: elapsed >= VISIBLE_MS ? "0" : "1" });
          }
        }
        // Timers also run when Dia pauses page animation frames for sidepanel focus.
        timer = win.setTimeout(check, FOLLOW_MS);
      };
      check();
    },
    cancel
  };
}
