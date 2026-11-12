// Hides programmatic scrolling of the website's message list. The list stays laid
// out (so the site's own lazy loaders still fire) but is transparent beneath a
// still cover until its original position has been restored.
export function createBackfillMask({ window: win, scroller, text = "", stopLabel = "Stop", onStop = () => {} }) {
  const doc = win.document;
  const viewportScroller = scroller === doc.scrollingElement || scroller === doc.documentElement || scroller === doc.body;
  const target = viewportScroller ? doc.body : scroller;
  const saved = { value: target.style.getPropertyValue("opacity"), priority: target.style.getPropertyPriority("opacity") };
  const rect = viewportScroller ? { left: 0, top: 0, width: win.innerWidth, height: win.innerHeight } : scroller.getBoundingClientRect();
  const background = [doc.body, doc.documentElement].map((node) => node && win.getComputedStyle(node).backgroundColor)
    .find((color) => color && !/^(?:transparent|rgba\(\s*0,\s*0,\s*0,\s*0\s*\))$/.test(color)) || "Canvas";
  const cover = doc.createElement("div");
  cover.dataset.polarisBackfill = "true";
  cover.setAttribute("role", "status"); cover.setAttribute("aria-live", "polite");
  cover.style.cssText = [
    "position:fixed", `left:${rect.left}px`, `top:${rect.top}px`, `width:${rect.width}px`, `height:${rect.height}px`,
    "z-index:2147483646", `background:${background}`, "color:CanvasText", "display:flex", "flex-direction:column",
    "align-items:center", "justify-content:center", "gap:12px", "font:14px/1.5 system-ui,-apple-system,sans-serif"
  ].join(";");
  const label = doc.createElement("span"); label.textContent = text;
  const stop = doc.createElement("button"); stop.type = "button"; stop.textContent = stopLabel;
  stop.style.cssText = "font:inherit;padding:4px 14px;border-radius:999px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer";
  stop.addEventListener("click", () => onStop());
  cover.append(label, stop);
  target.style.setProperty("opacity", "0", "important");
  (doc.body || doc.documentElement).append(cover);
  let removed = false;
  return {
    element: cover,
    update(value) { if (!removed && label.textContent !== value) label.textContent = value; },
    remove() {
      if (removed) return;
      removed = true;
      if (saved.value) target.style.setProperty("opacity", saved.value, saved.priority);
      else target.style.removeProperty("opacity");
      cover.remove();
    }
  };
}
