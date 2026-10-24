import { appendSanitizedChapterContent } from "./chapter-markdown.js";
import { appendIndexedChapterBlock } from "./indexed-chapter-content.js";
import { createVirtualList } from "./virtual-list.js";
import {
  createChapterReaderState, updateChapterReader, enterChapter, searchChapterReader,
  chapterAncestors, chapterReaderVisibility, chapterTreeText
} from "./sidepanel-chapter-state.js";

export function createSidepanelChapterReader({ document: doc, locale, onLocate, onCopy, onQueryChange, onLoadChapter }) {
  const win = doc.defaultView;
  const zh = locale === "zh";
  const label = (cn, en) => zh ? cn : en;
  const sessions = new Map();
  let currentKey = "";
  let state = createChapterReaderState();
  let signature = "";
  let active = false;
  let hoveredKey = "";
  let pendingRender = false;
  let scrollRestorePending = false;
  let virtualized = false;
  let virtualList = null;
  let virtualRowRenderer = null;
  let contentRevision = 0;
  const loadingChapters = new Set();
  const loadedChapters = new Map();
  const root = make("div", "chapter-tree-reader");
  const menu = make("div", "chapter-node-menu");
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", label("章节操作", "Chapter actions"));

  function make(tag, className = "", text = "") {
    const node = doc.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  }
  function button(className, text, action) {
    const node = make("button", className, text);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  }
  function bullet(key) {
    return [...root.querySelectorAll(".chapter-node-dot")].find((node) => node.dataset.key === key);
  }
  function restoreScroll() {
    const session = state;
    const y = session.scrollY;
    scrollRestorePending = true;
    win.requestAnimationFrame(() => {
      if (session === state && active) win.scrollTo(0, y);
      scrollRestorePending = false;
    });
  }
  function closeMenu(restoreFocus = true) {
    const key = state.menu;
    state.menu = "";
    menu.remove();
    root.querySelectorAll(".is-menu-open").forEach((row) => row.classList.remove("is-menu-open"));
    const trigger = bullet(key);
    trigger?.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger?.focus({ preventScroll: true });
  }
  function positionMenu() {
    const trigger = bullet(state.menu);
    if (!trigger?.isConnected || !menu.isConnected) return;
    const rect = trigger.getBoundingClientRect();
    const size = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, win.innerWidth - size.width - 8));
    const top = rect.bottom + size.height + 8 <= win.innerHeight
      ? rect.bottom + 4 : Math.max(8, rect.top - size.height - 4);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }
  function navigate(key) {
    closeMenu(false);
    enterChapter(state, key, win.scrollY);
    onQueryChange(state.query);
    paint();
    restoreScroll();
    win.requestAnimationFrame(() => root.querySelector(".chapter-node-title, .chapter-path button")?.focus({ preventScroll: true }));
  }
  function openMenu(node, focusFirst = true) {
    closeMenu(false);
    state.menu = node.markerKey;
    bullet(node.markerKey)?.setAttribute("aria-expanded", "true");
    bullet(node.markerKey)?.closest(".chapter-node-row")?.classList.add("is-menu-open");
    menu.replaceChildren();
    const status = make("div", "chapter-menu-status");
    status.setAttribute("role", "status");
    const action = (text, handler, disabled = false) => {
      const item = button("chapter-menu-item", text, async () => {
        item.disabled = true;
        try {
          await handler();
        } catch {
          if (state.menu === node.markerKey) status.textContent = label("操作失败，请重试", "Action failed. Try again.");
        } finally { item.disabled = disabled; }
      });
      item.setAttribute("role", "menuitem");
      item.disabled = disabled;
      menu.appendChild(item);
    };
    if (state.focus !== node.markerKey) action(label("进入当前节点", "Focus this chapter"), () => navigate(node.markerKey));
    action(label("定位原文", "Locate in conversation"), async () => {
      await onLocate(node.sourceKey);
      closeMenu();
    }, !node.sourceKey);
    const copy = async (key) => {
      await onCopy(virtualized && onLoadChapter ? (await onLoadChapter(key, "text")).text : chapterTreeText(state.nodes, key));
      if (state.menu === node.markerKey) status.textContent = label("已复制", "Copied");
    };
    action(label("复制本章", "Copy chapter"), () => copy(node.markerKey));
    action(label("复制全文", "Copy full text"), () => copy(""));
    menu.appendChild(status);
    doc.body.appendChild(menu);
    positionMenu();
    if (focusFirst) menu.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
  }
  function paint() {
    signature = "";
    const visibility = chapterReaderVisibility(state);
    const byKey = new Map(state.nodes.map((node) => [node.markerKey, node]));
    const children = [];
    if (state.focus) {
      const path = make("nav", "chapter-path");
      path.setAttribute("aria-label", label("章节路径", "Chapter path"));
      path.appendChild(button("", label("全部章节", "All chapters"), () => navigate("")));
      chapterAncestors(state.nodes, state.focus).forEach((key) => {
        path.appendChild(make("span", "chapter-path-separator", "/"));
        const item = key === state.focus ? make("span", "", byKey.get(key).title) : button("", byKey.get(key).title, () => navigate(key));
        if (key === state.focus) item.setAttribute("aria-current", "page");
        path.appendChild(item);
      });
      children.push(path);
    }
    const list = virtualized && virtualList ? root.querySelector(":scope > .chapter-tree-list") || make("ul", "chapter-tree-list") : make("ul", "chapter-tree-list");
    list.setAttribute("aria-label", label("章节", "Chapters"));
    function contentFor(part, node, partIndex, depth) {
      const content = make("div", "chapter-content chapter-tree-content");
      content.style.setProperty("--tree-depth", Math.min(depth, 3));
      if (part.lazy) {
        content.textContent = label("正在读取内容…", "Reading content…");
        content.setAttribute("aria-busy", "true");
        const key = `${currentKey}:${node.markerKey}`;
        if (!loadingChapters.has(key) && onLoadChapter) {
          loadingChapters.add(key);
          const session = state;
          void onLoadChapter(node.markerKey).then((result) => {
            if (state !== session || !active) return;
            const current = state.nodes.find((item) => item.markerKey === node.markerKey);
            if (!current) return;
            loadedChapters.set(node.markerKey, result.contents);
            current.contents = result.contents;
            signature = ""; paint();
          }).catch(() => {
            if (state !== session) return;
            content.removeAttribute("aria-busy");
            content.textContent = label("读取失败，重新展开以重试", "Could not load. Collapse and expand to retry.");
          }).finally(() => loadingChapters.delete(key));
        }
        return content;
      }
      if (part.ast) appendIndexedChapterBlock(content, part.ast, doc);
      else {
        const parsed = new win.DOMParser().parseFromString(part.html || "", "text/html");
        appendSanitizedChapterContent(content, parsed.body, doc, doc.baseURI);
        if (!part.html) content.textContent = part.text || "";
      }
      content.querySelectorAll("table, pre").forEach((element) => {
        const wrap = make("div", "chapter-table-wrap"); wrap.tabIndex = 0;
        wrap.setAttribute("role", "region"); wrap.setAttribute("aria-label", label("可横向滚动的内容", "Scrollable content"));
        element.replaceWith(wrap); wrap.appendChild(element);
      });
      return content;
    }
    function appendNode(node, parent, depth, shallow = false) {
      if (!node || !visibility.visible.has(node.markerKey)) return;
      const item = make("li", "chapter-tree-node");
      item.dataset.key = node.markerKey;
      item.style.setProperty("--tree-depth", Math.min(depth, 3));
      const row = make("div", "chapter-node-row");
      if (hoveredKey === node.markerKey) row.classList.add("is-controls-visible");
      row.addEventListener("pointerleave", () => {
        if (hoveredKey === node.markerKey) hoveredKey = "";
        row.classList.remove("is-controls-visible");
      });
      const hasContents = node.contents.length > 0;
      const expanded = state.expanded.has(node.markerKey);
      const showChildren = expanded || (state.query && visibility.ancestors.has(node.markerKey) && !state.searchCollapsed.has(node.markerKey));
      const toggle = () => {
        state.scrollY = win.scrollY;
        closeMenu(false);
        if (showChildren) {
          state.expanded.delete(node.markerKey);
          if (state.query) state.searchCollapsed.add(node.markerKey);
        } else {
          state.expanded.add(node.markerKey);
          state.searchCollapsed.delete(node.markerKey);
        }
        paint();
        restoreScroll();
        [...root.querySelectorAll(".chapter-node-title")].find((el) => el.dataset.key === node.markerKey)?.focus({ preventScroll: true });
      };
      const disclosure = hasContents ? button("chapter-node-toggle", "", toggle) : make("span", "chapter-node-toggle");
      if (hasContents) {
        const actionLabel = showChildren ? label("折叠", "Collapse") : label("展开", "Expand");
        disclosure.title = actionLabel;
        disclosure.setAttribute("aria-label", `${actionLabel} ${node.title}`);
        disclosure.setAttribute("aria-expanded", String(Boolean(showChildren)));
        const icon = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("viewBox", "0 0 10 10");
        icon.setAttribute("aria-hidden", "true");
        icon.setAttribute("focusable", "false");
        const triangle = doc.createElementNS("http://www.w3.org/2000/svg", "path");
        triangle.setAttribute("d", "M0 0 10 5 0 10Z");
        icon.appendChild(triangle);
        disclosure.appendChild(icon);
      }
      const dot = button("chapter-node-dot", "", () => state.menu === node.markerKey ? closeMenu() : openMenu(node));
      dot.dataset.key = node.markerKey;
      dot.addEventListener("pointerenter", () => {
        hoveredKey = node.markerKey;
        row.classList.add("is-controls-visible");
      });
      dot.setAttribute("aria-label", `${label("章节操作", "Actions for")} ${node.title}`);
      dot.setAttribute("aria-haspopup", "menu");
      dot.setAttribute("aria-expanded", "false");
      const title = button("chapter-node-title", node.title, toggle);
      title.dataset.key = node.markerKey;
      if (hasContents) title.setAttribute("aria-expanded", String(Boolean(showChildren)));
      else title.disabled = true;
      row.append(disclosure, dot, title);
      item.appendChild(row);
      if (showChildren && !shallow) {
        for (const [partIndex, part] of node.contents.entries()) {
          if (part.type === "child") {
            const nested = make("ul", "chapter-tree-list chapter-tree-children");
            appendNode(byKey.get(part.key), nested, depth + 1);
            if (nested.childElementCount) item.appendChild(nested);
          } else if (expanded) {
            item.appendChild(contentFor(part, node, partIndex, depth));
          }
        }
      }
      parent.appendChild(item);
    }
    if (virtualized) {
      const rows = [];
      function flatten(node, depth) {
        if (!node || !visibility.visible.has(node.markerKey)) return;
        rows.push({ key: `title:${node.markerKey}`, node, depth, signature: JSON.stringify([node.title, depth, state.expanded.has(node.markerKey), state.query, [...state.searchCollapsed]]) });
        const expanded = state.expanded.has(node.markerKey);
        if (!expanded && !(state.query && visibility.ancestors.has(node.markerKey) && !state.searchCollapsed.has(node.markerKey))) return;
        node.contents.forEach((part, partIndex) => {
          if (part.type === "child") flatten(byKey.get(part.key), depth + 1);
          else if (expanded) rows.push({ key: `block:${node.markerKey}:${partIndex}`, node, part, partIndex, depth, signature: JSON.stringify(part) });
        });
      }
      visibility.roots.forEach((node) => flatten(node, 0));
      virtualRowRenderer = (item) => {
        if (item.part) { const li = make("li", "chapter-tree-node"); li.append(contentFor(item.part, item.node, item.partIndex, item.depth)); return li; }
        const temporary = make("ul"); appendNode(item.node, temporary, item.depth, true); return temporary.firstChild;
      };
      if (!virtualList) virtualList = createVirtualList({ element: list, gap: 0, estimateHeight: 48,
        getPinnedKeys: () => state.menu ? [`title:${state.menu}`] : [],
        createRow(item) { const row = virtualRowRenderer(item); row.chapterSignature = item.signature; return row; },
        updateRow(row, item) {
          if (row.chapterSignature === item.signature) return;
          const next = virtualRowRenderer(item); row.replaceChildren(...next.childNodes); row.chapterSignature = item.signature;
        }
      });
      virtualList.setItems(rows);
    } else visibility.roots.forEach((node) => appendNode(node, list, 0));
    if (!list.childElementCount) {
      const empty = make("div", "empty-search", state.query ? label("没有匹配的章节", "No matching chapters") : label("当前对话没有章节", "No chapters in this conversation"));
      if (state.query) empty.appendChild(button("secondary-button", label("清除搜索", "Clear search"), () => {
        searchChapterReader(state, "", win.scrollY);
        onQueryChange("");
        paint(); restoreScroll();
      }));
      children.push(empty);
    } else children.push(list);
    const focusedKey = doc.activeElement?.classList.contains("chapter-node-dot") ? doc.activeElement.dataset.key : "";
    root.replaceChildren(...children);
    if (focusedKey) bullet(focusedKey)?.focus({ preventScroll: true });
    if (state.menu && byKey.has(state.menu)) {
      bullet(state.menu)?.setAttribute("aria-expanded", "true");
      bullet(state.menu)?.closest(".chapter-node-row")?.classList.add("is-menu-open");
      positionMenu();
    } else menu.remove();
  }
  doc.addEventListener("pointerdown", (event) => {
    if (active && state.menu && !menu.contains(event.target) && !event.target.closest(".chapter-node-dot")) closeMenu(false);
  });
  doc.addEventListener("keydown", (event) => {
    if (!active || !state.menu) return;
    if (event.key === "Escape") { event.preventDefault(); closeMenu(); return; }
    if (!menu.contains(event.target)) return;
    const items = [...menu.querySelectorAll("button:not(:disabled)")];
    const index = items.indexOf(doc.activeElement);
    let next;
    if (event.key === "ArrowDown") next = items[(index + 1) % items.length];
    if (event.key === "ArrowUp") next = items[(index - 1 + items.length) % items.length];
    if (event.key === "Home") next = items[0];
    if (event.key === "End") next = items.at(-1);
    if (next) { event.preventDefault(); next.focus(); }
    if (event.key === "Tab") closeMenu();
  });
  win.addEventListener("scroll", () => { if (active && !scrollRestorePending) state.scrollY = win.scrollY; positionMenu(); }, { passive: true });
  win.addEventListener("resize", positionMenu);
  doc.addEventListener("selectionchange", () => {
    if (active && pendingRender && doc.getSelection()?.isCollapsed) {
      pendingRender = false;
      paint(); restoreScroll();
    }
  });
  return {
    element: root,
    update({ conversationKey, nodes, preferredKey, query, ready, virtualized: nextVirtualized = false, contentRevision: nextRevision = 0 }) {
      const resumed = !active || currentKey !== conversationKey;
      active = true;
      if (virtualized !== nextVirtualized) { virtualList?.dispose(); virtualList = null; signature = ""; }
      virtualized = nextVirtualized;
      if (contentRevision !== nextRevision) { contentRevision = nextRevision; loadedChapters.clear(); signature = ""; }
      if (currentKey !== conversationKey) {
        if (virtualized) sessions.clear();
        closeMenu(false);
        pendingRender = false;
        hoveredKey = "";
        currentKey = conversationKey;
        loadedChapters.clear(); loadingChapters.clear();
        virtualList?.dispose(); virtualList = null;
        state = sessions.get(currentKey) || createChapterReaderState();
        sessions.set(currentKey, state);
        signature = "";
        onQueryChange(state.query);
        query = state.query;
      }
      if (state.query !== query) searchChapterReader(state, query, win.scrollY);
      if (!ready) {
        if (!state.initialized) root.textContent = label("正在读取章节内容…", "Reading chapters…");
        else if (resumed) { paint(); restoreScroll(); }
        return root;
      }
      if (virtualized) nodes = nodes.map((node) => loadedChapters.has(node.markerKey) ? { ...node, contents: loadedChapters.get(node.markerKey) } : node);
      const nextSignature = JSON.stringify([conversationKey, nodes, query, state.focus, [...state.expanded]]);
      if (nextSignature !== signature) {
        updateChapterReader(state, nodes, preferredKey);
        const selection = doc.getSelection();
        if (!resumed && selection && !selection.isCollapsed && root.contains(selection.anchorNode)) pendingRender = true;
        else { paint(); restoreScroll(); }
        signature = nextSignature;
      }
      if (resumed) restoreScroll();
      return root;
    },
    suspend() {
      if (!active) return;
      state.scrollY = win.scrollY;
      closeMenu(false);
      active = false;
      virtualList?.dispose(); virtualList = null;
    }
  };
}
