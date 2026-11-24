const TABLE_MARKER_TITLE_MAX_LENGTH = 160;
export const TABLE_MARKER_LEVEL = 3;

export function tableMarkerScrollTop({ scrollTop, targetTop, scrollerTop, headerHeight, gap, maxScrollTop = Infinity }) {
  if (![scrollTop, targetTop, scrollerTop, headerHeight, gap].every(Number.isFinite)) {
    return null;
  }
  const targetScrollTop = scrollTop + targetTop - scrollerTop - headerHeight - gap;
  const maximum = Number.isFinite(maxScrollTop) ? Math.max(0, maxScrollTop) : Infinity;
  return Math.min(maximum, Math.max(0, targetScrollTop));
}

// ChatGPT's virtual transcript can keep following its last message after a
// scrollTo. Notify the page of the requested direction before moving the list.
export function signalTranscriptScroll(scroller, top) {
  const deltaY = top - scroller.scrollTop;
  if (!deltaY || !scroller.matches?.("[data-app-action-timeline-scroll]")) return;
  const win = scroller.ownerDocument.defaultView;
  scroller.dispatchEvent(new win.WheelEvent("wheel", { bubbles: true, deltaY }));
}

export function scrollMarkerIntoView({ element, scrollContainer, reverseFlow = false, headerHeight, gap, behavior }) {
  if (!element || typeof element.scrollIntoView !== "function") {
    return false;
  }
  if (reverseFlow) {
    element.scrollIntoView({ behavior, block: "start" });
    return true;
  }
  if (
    !scrollContainer ||
    typeof scrollContainer.scrollTo !== "function" ||
    typeof element.getBoundingClientRect !== "function" ||
    typeof scrollContainer.getBoundingClientRect !== "function"
  ) {
    element.scrollIntoView({ behavior, block: "start" });
    return true;
  }

  const scrollTop = tableMarkerScrollTop({
    scrollTop: scrollContainer.scrollTop,
    targetTop: element.getBoundingClientRect().top,
    scrollerTop: scrollContainer.getBoundingClientRect().top,
    headerHeight,
    gap,
    maxScrollTop: scrollContainer.scrollHeight - scrollContainer.clientHeight
  });
  if (scrollTop === null) {
    element.scrollIntoView({ behavior, block: "start" });
    return true;
  }

  signalTranscriptScroll(scrollContainer, scrollTop);
  scrollContainer.scrollTo({ top: scrollTop, behavior });
  return true;
}

export function tableMarkerTitleFromCells(cells) {
  const titles = Array.from(cells || [])
    .map((cell) => String(cell || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const title = titles.join(" / ");
  return titles.length >= 2 && title.length <= TABLE_MARKER_TITLE_MAX_LENGTH ? title : "";
}

export function tableMarkerEntries(entries) {
  const seen = new Set();
  return Array.from(entries || []).flatMap(({ element, cells, fingerprint }) => {
    if (seen.has(element)) {
      return [];
    }
    seen.add(element);
    const title = tableMarkerTitleFromCells(cells);
    if (!title) {
      return [];
    }
    return fingerprint ? [{ element, title, fingerprint }] : [{ element, title }];
  });
}

export function tableMarkerEntryForTarget(entries, index, title, fingerprint) {
  const currentEntries = tableMarkerEntries(entries);
  const indexedEntry = currentEntries[index];
  if (indexedEntry && indexedEntry.title === title && (!fingerprint || indexedEntry.fingerprint === fingerprint)) {
    return indexedEntry;
  }
  const matchingEntries = currentEntries.filter((entry) => (
    entry.title === title && (!fingerprint || entry.fingerprint === fingerprint)
  ));
  if (matchingEntries.length !== 1) {
    return null;
  }
  return matchingEntries[0];
}
