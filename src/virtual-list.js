// Own only Polaris rows. Off-screen DOM is released; data and measured heights
// survive recycling. A focused row remains mounted outside the visible range.
export function createVirtualList({ element, createRow, updateRow = () => {}, estimateHeight = 48, gap = 8, scrollElement = null, getPinnedKeys = () => [] }) {
  const doc = element.ownerDocument;
  const win = doc.defaultView;
  const scroller = scrollElement || win;
  let items = [];
  let offsets = [0];
  const heights = new Map();
  const mounted = new Map();
  let scheduled = 0;
  let disposed = false;
  let width = 0;
  element.classList.add("is-virtual");
  element.style.overflowAnchor = "none";
  const viewHeight = () => scrollElement ? scrollElement.clientHeight || 600 : win.innerHeight || 800;
  const top = () => scrollElement ? scrollElement.scrollTop : Math.max(0, -element.getBoundingClientRect().top);
  const scrollBy = (delta) => {
    if (!delta) return;
    if (scrollElement) scrollElement.scrollTop += delta;
    else win.scrollTo({ top: Math.max(0, win.scrollY + delta), behavior: "instant" });
  };
  function rebuild() {
    offsets = [0];
    for (const item of items) offsets.push(offsets.at(-1) + (heights.get(item.key) || estimateHeight) + gap);
  }
  function atOffset(value) {
    let low = 0; let high = items.length;
    while (low < high) { const mid = (low + high) >>> 1; if (offsets[mid + 1] <= value) low = mid + 1; else high = mid; }
    return Math.min(low, Math.max(0, items.length - 1));
  }
  function anchor() {
    const index = atOffset(top());
    return { key: items[index]?.key, offset: top() - offsets[index] };
  }
  function restore(saved) {
    const index = items.findIndex((item) => item.key === saved.key);
    if (index >= 0) scrollBy(offsets[index] + saved.offset - top());
  }
  function queue() { if (!scheduled && !disposed) scheduled = win.requestAnimationFrame(() => { scheduled = 0; paint(); }); }
  const observer = typeof win.ResizeObserver === "function" ? new win.ResizeObserver((entries) => {
    const saved = anchor(); let changed = false;
    for (const entry of entries) {
      const key = entry.target.dataset.virtualKey;
      const height = entry.borderBoxSize?.[0]?.blockSize || entry.contentRect.height;
      if (height > 0 && Math.abs((heights.get(key) || estimateHeight) - height) > 0.5) { heights.set(key, height); changed = true; }
    }
    if (changed) { rebuild(); restore(saved); queue(); }
  }) : null;
  function paint() {
    if (disposed) return;
    const viewport = viewHeight();
    const y = top();
    const start = atOffset(Math.max(0, y - viewport));
    const end = Math.min(items.length, atOffset(y + viewport * 2) + 1);
    const selected = new Set();
    for (let index = start; index < end; index++) selected.add(index);
    const focused = doc.activeElement?.closest?.("[data-virtual-key]");
    const focusIndex = items.findIndex((item) => item.key === focused?.dataset.virtualKey);
    if (focusIndex >= 0) selected.add(focusIndex);
    for (const key of getPinnedKeys()) { const index = items.findIndex((item) => item.key === key); if (index >= 0) selected.add(index); }
    const indices = [...selected].sort((a, b) => a - b);
    const wanted = new Set(indices.map((index) => items[index].key));
    for (const [key, entry] of mounted) if (!wanted.has(key)) {
      observer?.unobserve(entry.row); entry.row.remove(); mounted.delete(key);
    }
    element.querySelectorAll(':scope > [data-virtual-spacer]').forEach((node) => node.remove());
    let cursor = element.firstChild;
    let previousEnd = 0;
    const place = (node) => {
      if (node === cursor) cursor = cursor.nextSibling;
      else element.insertBefore(node, cursor);
    };
    const spacer = (height) => {
      if (height <= 0) return;
      const node = doc.createElement(element.tagName === "UL" ? "li" : "div");
      node.dataset.virtualSpacer = "true"; node.setAttribute("aria-hidden", "true");
      node.style.height = `${height}px`; node.style.flexShrink = "0";
      place(node);
    };
    for (const index of indices) {
      const item = items[index];
      spacer(offsets[index] - previousEnd);
      let entry = mounted.get(item.key);
      if (!entry) {
        entry = { row: createRow(item), item };
        entry.row.dataset.virtualKey = item.key;
        entry.row.style.marginBottom = `${gap}px`;
        mounted.set(item.key, entry); observer?.observe(entry.row);
      } else if (entry.item !== item) { updateRow(entry.row, item); entry.item = item; }
      entry.row.setAttribute("aria-posinset", String(index + 1));
      entry.row.setAttribute("aria-setsize", String(items.length));
      place(entry.row);
      previousEnd = offsets[index + 1];
    }
    spacer(offsets.at(-1) - previousEnd);
  }
  function onResize() {
    const next = element.getBoundingClientRect().width;
    if (next !== width) { width = next; const saved = anchor(); heights.clear(); rebuild(); restore(saved); }
    queue();
  }
  function scrollToKey(key, { focus = false } = {}) {
    const index = items.findIndex((item) => item.key === key);
    if (index < 0) return false;
    const header = scrollElement ? 0 : doc.querySelector(".window-header")?.getBoundingClientRect().bottom || 0;
    scrollBy(offsets[index] - top() - header - 12);
    paint();
    if (focus) {
      const row = mounted.get(key)?.row;
      (row?.matches("button") ? row : row?.querySelector("button:not(:disabled), [tabindex]"))?.focus({ preventScroll: true });
    }
    return true;
  }
  function onKeydown(event) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || event.target.matches("input,textarea")) return;
    const key = event.target.closest("[data-virtual-key]")?.dataset.virtualKey;
    const index = items.findIndex((item) => item.key === key);
    if (index < 0) return;
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : index + (event.key === "ArrowDown" ? 1 : -1);
    if (items[next]) { event.preventDefault(); scrollToKey(items[next].key, { focus: true }); }
  }
  scroller.addEventListener("scroll", queue, { passive: true });
  win.addEventListener("resize", onResize);
  element.addEventListener("keydown", onKeydown);
  return {
    setItems(next) {
      const saved = anchor(); const keys = new Set(next.map((item) => item.key));
      for (const key of heights.keys()) if (!keys.has(key)) heights.delete(key);
      items = next; rebuild(); paint(); restore(saved); queue();
    },
    refresh: queue, scrollToKey,
    dispose() {
      disposed = true; win.cancelAnimationFrame(scheduled); observer?.disconnect();
      scroller.removeEventListener("scroll", queue); win.removeEventListener("resize", onResize);
      element.removeEventListener("keydown", onKeydown); mounted.clear(); heights.clear(); element.replaceChildren();
    }
  };
}
