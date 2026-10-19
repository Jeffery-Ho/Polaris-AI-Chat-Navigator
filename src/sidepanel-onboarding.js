import { SUPPORTED_PLATFORMS, createPlatformLinks } from "./supported-platforms.js";

export const ONBOARDING_STORAGE_KEY = "polaris-onboarding-version";
export const ONBOARDING_VERSION = 1;
const RELEASE_NOTICE_STORAGE_KEY = "polaris-release-notice-version";
const STEP_KEYS = ["platforms", "open", "source", "jump", "outline", "search", "copy"];
const LOOP_REST_MS = 1600;
const CURSOR_TRAVEL_MS = 480;

export function createSidepanelOnboarding({ document, chrome, locale, t, platforms = SUPPORTED_PLATFORMS }) {
  const window = document.defaultView;
  const manifest = chrome.runtime.getManifest();
  const label = (zh, en) => (locale === "zh" ? zh : en);
  let dialog = null;
  let pending = false;
  let dismissedInSession = false;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svg(paths, className = "") {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    if (className) icon.setAttribute("class", className);
    for (const d of paths) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      icon.appendChild(path);
    }
    return icon;
  }

  function prefersReducedMotion() {
    return Boolean(window?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  }

  function lines(widths, className = "") {
    return widths.map((width) => {
      const line = element("span", `ob-line ${className}`.trim());
      line.style.width = `${width}%`;
      return line;
    });
  }

  function demo(node, key) {
    node.dataset.ob = key;
    return node;
  }

  function chip(text, key, extra = "") {
    return demo(element("span", `ob-chip ${extra}`.trim(), text), key);
  }

  function platformIcon(key) {
    const platform = platforms.find((item) => item.key === key);
    const icon = element("img", "ob-favicon");
    icon.src = chrome.runtime.getURL(platform.favicon);
    icon.alt = "";
    return icon;
  }

  // Each figure returns static demo markup plus a script of [delayMs, op, target, ...args].
  const figures = {
    platforms(figure) {
      figure.appendChild(createPlatformLinks(document, chrome, { compact: true, platforms, label: t("onboarding.platformsLabel") }));
      return [
        [500, "move", '[data-platform="chatgpt"]'], [0, "hover", '[data-platform="chatgpt"]'],
        [700, "move", '[data-platform="claude"]'], [0, "hover", '[data-platform="claude"]'],
        [700, "move", '[data-platform="deepseek"]'], [0, "hover", '[data-platform="deepseek"]'],
        [500, "press", '[data-platform="deepseek"]']
      ];
    },
    open(figure) {
      const toolbar = element("div", "ob-card ob-toolbar");
      const polaris = demo(element("span", "ob-tool ob-tool-polaris"), "polaris");
      const logo = element("img", "");
      logo.src = chrome.runtime.getURL("icons/gpt-voyager-icon-32.png");
      logo.alt = "";
      polaris.appendChild(logo);
      toolbar.append(element("span", "ob-line ob-address"), demo(element("span", "ob-tool"), "puzzle"), polaris);
      toolbar.children[1].appendChild(svg(["M4 7h3a1 1 0 0 0 1-1V5a2 2 0 0 1 4 0v1a1 1 0 0 0 1 1h3a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h1a2 2 0 0 1 0 4h-1a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-1a2 2 0 0 0-4 0v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a2 2 0 0 0 0-4H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1"]));
      const viewport = element("div", "ob-viewport");
      const page = element("div", "ob-card ob-page");
      page.append(...lines([70, 100, 55, 85]));
      const panel = demo(element("div", "ob-card ob-panel"), "panel");
      panel.append(...lines([100, 70, 85], "is-soft"));
      viewport.append(page, panel);
      figure.append(toolbar, viewport);
      return [
        [600, "move", "[data-ob=polaris]"], [0, "hover", "[data-ob=polaris]"],
        [500, "press", "[data-ob=polaris]"], [120, "add", "[data-ob=panel]", "is-open"]
      ];
    },
    source(figure) {
      const tabs = element("div", "ob-tabs");
      const docTab = chip(label("文档", "Docs"), "tab-doc", "ob-card is-active");
      const chatTab = chip("ChatGPT", "tab-chatgpt", "ob-card");
      chatTab.prepend(platformIcon("chatgpt"));
      const claudeTab = chip("Claude", "tab-claude", "ob-card");
      claudeTab.prepend(platformIcon("claude"));
      tabs.append(docTab, chatTab, claudeTab);
      const viewport = element("div", "ob-viewport");
      const page = element("div", "ob-card ob-page");
      page.append(...lines([60, 100, 80, 45]));
      const panel = demo(element("div", "ob-card ob-panel is-open ob-source-panel"), "panel");
      const empty = element("span", "ob-panel-empty", label("等待会话…", "Waiting…"));
      const ready = element("div", "ob-panel-ready");
      const head = element("span", "ob-panel-head");
      head.append(platformIcon("chatgpt"), element("span", "ob-line"));
      ready.append(head, ...lines([100], "is-strong"), ...lines([100, 70]));
      panel.append(empty, ready);
      viewport.append(page, panel);
      figure.append(tabs, viewport);
      return [
        [600, "move", "[data-ob=tab-chatgpt]"], [0, "hover", "[data-ob=tab-chatgpt]"],
        [500, "press", "[data-ob=tab-chatgpt]"],
        [120, "remove", "[data-ob=tab-doc]", "is-active"], [0, "add", "[data-ob=tab-chatgpt]", "is-active"],
        [160, "add", "[data-ob=panel]", "is-ready"]
      ];
    },
    jump(figure) {
      const page = element("div", "ob-card ob-page ob-jump-page");
      const scroll = demo(element("div", "ob-scroll"), "scroll");
      const first = demo(element("span", "ob-line is-strong"), "heading-a");
      first.style.width = "55%";
      const second = demo(element("span", "ob-line is-heading"), "heading-b");
      second.style.width = "42%";
      scroll.append(first, ...lines([100, 85, 70]), second, ...lines([100, 65, 90]));
      page.appendChild(scroll);
      const arrow = svg(["M19 12H5m6-6-6 6 6 6"], "ob-arrow");
      const makers = element("div", "ob-makers");
      makers.append(
        chip(label("背景说明", "Background"), "maker-a", "ob-card is-active"),
        chip(label("关键步骤", "Key steps"), "maker-b", "ob-card"),
        chip(label("注意事项", "Notes"), "maker-c", "ob-card")
      );
      figure.classList.add("is-row");
      figure.append(page, arrow, makers);
      return [
        [600, "move", "[data-ob=maker-b]"], [0, "hover", "[data-ob=maker-b]"],
        [500, "press", "[data-ob=maker-b]"],
        [120, "remove", "[data-ob=maker-a]", "is-active"], [0, "add", "[data-ob=maker-b]", "is-active"],
        [0, "add", "[data-ob=scroll]", "is-jumped"],
        [0, "remove", "[data-ob=heading-a]", "is-strong"], [0, "add", "[data-ob=heading-b]", "is-strong"]
      ];
    },
    outline(figure) {
      const tabs = element("div", "ob-segment");
      tabs.append(chip(t("tab.navigation"), "tab-navigation", "is-active"), chip(t("tab.chapters"), "tab-chapters"));
      const view = demo(element("div", "ob-card ob-outline"), "view");
      const list = element("div", "ob-outline-list");
      list.append(...lines([80, 60, 70]));
      const tree = element("div", "ob-outline-tree");
      const first = demo(element("span", "ob-tree-row", label("1. 背景", "1. Background")), "row-a");
      const second = demo(element("span", "ob-tree-row", label("2. 方案", "2. Approach")), "row-b");
      const body = demo(element("span", "ob-tree-body"), "body-b");
      body.append(...lines([90, 70]));
      tree.append(first, second, body, element("span", "ob-tree-row", label("3. 风险", "3. Risks")));
      view.append(list, tree);
      figure.append(tabs, view);
      return [
        [600, "move", "[data-ob=tab-chapters]"], [0, "hover", "[data-ob=tab-chapters]"],
        [450, "press", "[data-ob=tab-chapters]"],
        [120, "remove", "[data-ob=tab-navigation]", "is-active"], [0, "add", "[data-ob=tab-chapters]", "is-active"],
        [0, "add", "[data-ob=view]", "is-tree"],
        [700, "move", "[data-ob=row-b]"], [0, "hover", "[data-ob=row-b]"],
        [450, "press", "[data-ob=row-b]"], [120, "add", "[data-ob=row-b]", "is-open"], [0, "add", "[data-ob=body-b]", "is-open"]
      ];
    },
    search(figure) {
      const query = label("部署", "deploy");
      const box = demo(element("div", "ob-card ob-search"), "search");
      const text = demo(element("span", "ob-search-text"), "query");
      text.dataset.placeholder = t("search.markers.placeholder");
      box.append(svg(["M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14", "m20 20-3.5-3.5"]), text, element("span", "ob-caret"));
      const results = element("div", "ob-results");
      const match = demo(element("span", "ob-card ob-result"), "match");
      const [before, after] = label("如何{q}到生产环境", "How to {q} to production").split("{q}");
      match.append(before, element("mark", "ob-mark", query), after);
      results.append(match, demo(element("span", "ob-card ob-result", label("性能对比", "Performance")), "other-a"));
      const keys = element("div", "ob-keys");
      keys.append(element("kbd", "ob-kbd", "⌘/Ctrl F"), element("span", "", "Maker"), element("kbd", "ob-kbd", "⇧⌘/Ctrl F"), element("span", "", t("tab.chapters")));
      figure.append(box, results, keys);
      return [
        [600, "move", "[data-ob=search]"], [0, "hover", "[data-ob=search]"],
        [450, "press", "[data-ob=search]"], [80, "add", "[data-ob=search]", "is-focus"],
        [300, "type", "[data-ob=query]", query],
        [200, "add", "[data-ob=other-a]", "is-dim"], [0, "add", "[data-ob=match]", "is-match"]
      ];
    },
    copy(figure) {
      const row = element("div", "ob-card ob-chapter");
      row.append(demo(element("span", "ob-dot"), "dot"), element("span", "", label("2. 方案", "2. Approach")));
      const menu = demo(element("div", "ob-card ob-menu"), "menu");
      menu.append(
        element("span", "ob-menu-item", label("进入当前节点", "Focus this chapter")),
        element("span", "ob-menu-item", label("定位原文", "Locate in conversation")),
        demo(element("span", "ob-menu-item", label("复制本章", "Copy chapter")), "copy"),
        element("span", "ob-menu-item", label("复制全文", "Copy full text")),
        demo(element("span", "ob-menu-status", label("已复制", "Copied")), "status")
      );
      figure.classList.add("is-row");
      figure.append(row, menu);
      return [
        [600, "move", "[data-ob=dot]"], [0, "hover", "[data-ob=dot]"],
        [450, "press", "[data-ob=dot]"], [120, "add", "[data-ob=menu]", "is-open"],
        [600, "move", "[data-ob=copy]"], [0, "hover", "[data-ob=copy]"],
        [450, "press", "[data-ob=copy]"], [120, "add", "[data-ob=status]", "is-visible"]
      ];
    }
  };

  function createDemo(figure, stepKey) {
    const timers = new Set();
    let paused = false;
    let cursor = null;
    figure.style.setProperty("--ob-cursor-travel-duration", `${CURSOR_TRAVEL_MS}ms`);

    function schedule(callback, delay) {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        callback();
      }, delay);
      timers.add(timer);
    }

    function clearTimers() {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    }

    function find(selector) {
      return selector ? figure.querySelector(selector) : null;
    }

    function moveCursor(target) {
      if (!cursor || !target) return;
      const area = figure.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const x = rect.left - area.left + rect.width * 0.6;
      const y = rect.top - area.top + rect.height * 0.55;
      cursor.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      cursor.classList.add("is-visible");
    }

    function apply([, op, selector, value]) {
      const target = find(selector);
      if (op === "move") moveCursor(target);
      else if (op === "hover") {
        figure.querySelectorAll(".is-demo-hover").forEach((node) => node.classList.remove("is-demo-hover"));
        target?.classList.add("is-demo-hover");
      } else if (op === "press") {
        if (!target) return;
        target.classList.add("is-demo-press");
        cursor?.classList.add("is-pressed");
        schedule(() => {
          target.classList.remove("is-demo-press");
          cursor?.classList.remove("is-pressed");
        }, 160);
      } else if (op === "add") target?.classList.add(value);
      else if (op === "remove") target?.classList.remove(value);
      else if (op === "type" && target) {
        if (!cursor) target.textContent = value;
        else [...value].forEach((_char, index) => {
          schedule(() => { target.textContent = value.slice(0, index + 1); }, index * 140);
        });
      }
    }

    function build() {
      figure.replaceChildren();
      figure.className = `onboarding-figure ob-figure-${stepKey}`;
      const script = figures[stepKey](figure);
      cursor = null;
      if (!prefersReducedMotion()) {
        cursor = element("span", "ob-cursor");
        cursor.setAttribute("aria-hidden", "true");
        cursor.appendChild(svg(["M5 3l14 8-6.2 1.6L10 19z"]));
        figure.appendChild(cursor);
      }
      return script;
    }

    function run(script, index = 0) {
      if (paused || !figure.isConnected) return;
      if (index >= script.length) {
        schedule(() => run(build()), LOOP_REST_MS);
        return;
      }
      // Hover lands once the cursor transition has arrived.
      const [delay, op] = script[index];
      const wait = op === "hover" && script[index - 1]?.[1] === "move" ? Math.max(delay, CURSOR_TRAVEL_MS) : delay;
      schedule(() => {
        apply(script[index]);
        run(script, index + 1);
      }, wait);
    }

    function pause() {
      paused = true;
      clearTimers();
      cursor?.classList.remove("is-visible", "is-pressed");
      figure.querySelectorAll(".is-demo-hover, .is-demo-press").forEach((node) => node.classList.remove("is-demo-hover", "is-demo-press"));
    }

    function resume() {
      if (!paused || !figure.isConnected) return;
      paused = false;
      run(build());
    }

    const script = build();
    if (prefersReducedMotion()) {
      // Show the end state without motion.
      for (const action of script) if (!["move", "hover", "press"].includes(action[1])) apply(action);
    } else {
      if (figure.matches(":hover")) pause();
      else run(script);
      figure.addEventListener("pointerenter", pause);
      figure.addEventListener("pointerleave", resume);
    }
    return { stop() {
      pause();
      figure.removeEventListener("pointerenter", pause);
      figure.removeEventListener("pointerleave", resume);
    } };
  }

  function open({ automatic = false } = {}) {
    if (dialog?.open) return;
    const returnFocus = document.activeElement;
    let index = 0;
    let activeDemo = null;
    const currentDialog = element("dialog", "onboarding-dialog");
    dialog = currentDialog;
    currentDialog.dataset.automatic = String(automatic);
    currentDialog.setAttribute("aria-labelledby", "onboarding-title");
    currentDialog.setAttribute("aria-describedby", "onboarding-body");
    const header = element("header", "onboarding-header");
    const eyebrow = element("p", "onboarding-eyebrow");
    const close = element("button", "release-notice-close onboarding-close");
    close.appendChild(svg(["M6 6l12 12M18 6 6 18"]));
    close.type = "button";
    close.setAttribute("aria-label", t("onboarding.close"));
    close.addEventListener("click", () => dismiss());
    header.append(eyebrow, close);
    const figure = element("div", "onboarding-figure");
    const card = element("div", "onboarding-card");
    const title = element("h2", "onboarding-title");
    title.id = "onboarding-title";
    const body = element("p", "onboarding-body");
    body.id = "onboarding-body";
    card.append(title, body);
    const footer = element("footer", "onboarding-footer");
    const dots = element("div", "onboarding-dots");
    dots.setAttribute("role", "group");
    dots.setAttribute("aria-label", t("onboarding.progress"));
    STEP_KEYS.forEach((_key, stepIndex) => {
      const dot = element("button", "onboarding-dot");
      dot.type = "button";
      dot.setAttribute("aria-label", t("onboarding.goToStep", { step: stepIndex + 1 }));
      dot.addEventListener("click", () => show(stepIndex));
      dots.appendChild(dot);
    });
    const actions = element("div", "onboarding-actions");
    const skip = element("button", "onboarding-skip", t("onboarding.skip"));
    skip.type = "button";
    skip.addEventListener("click", () => dismiss());
    const previous = element("button", "secondary-button onboarding-previous", t("onboarding.previous"));
    previous.type = "button";
    previous.addEventListener("click", () => show(index - 1));
    const next = element("button", "settings-diagnostic-primary onboarding-next");
    next.type = "button";
    next.addEventListener("click", () => {
      if (index === STEP_KEYS.length - 1) dismiss();
      else show(index + 1);
    });
    actions.append(skip, previous, next);
    footer.append(dots, actions);
    currentDialog.append(header, figure, card, footer);

    function show(nextIndex) {
      if (nextIndex < 0 || nextIndex >= STEP_KEYS.length) return;
      const direction = nextIndex >= index ? "forward" : "backward";
      index = nextIndex;
      const key = STEP_KEYS[index];
      eyebrow.textContent = t("onboarding.eyebrow", { step: index + 1, count: STEP_KEYS.length });
      title.textContent = t(`onboarding.${key}.title`);
      body.textContent = t(`onboarding.${key}.body`);
      currentDialog.dataset.step = key;
      currentDialog.dataset.direction = direction;
      [...dots.children].forEach((dot, dotIndex) => {
        if (dotIndex === index) dot.setAttribute("aria-current", "step");
        else dot.removeAttribute("aria-current");
      });
      skip.hidden = index === STEP_KEYS.length - 1;
      previous.hidden = index === 0;
      next.textContent = index === STEP_KEYS.length - 1 ? t("onboarding.finish") : t("onboarding.next");
      activeDemo?.stop();
      activeDemo = createDemo(figure, key);
      card.classList.remove("is-entering");
      void card.offsetWidth;
      card.classList.add("is-entering");
    }

    currentDialog.addEventListener("keydown", (event) => {
      if (event.target instanceof window.HTMLInputElement) return;
      if (event.key === "ArrowRight") { event.preventDefault(); show(index + 1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); show(index - 1); }
    });
    currentDialog.addEventListener("cancel", (event) => { event.preventDefault(); dismiss(); });

    let closed = false;
    function dismiss() {
      if (closed) return;
      closed = true;
      dismissedInSession = true;
      pending = false;
      activeDemo?.stop();
      if (currentDialog.open) currentDialog.close();
      currentDialog.remove();
      if (dialog === currentDialog) dialog = null;
      const focus = returnFocus?.isConnected && returnFocus !== document.body
        ? returnFocus : document.querySelector(".window-settings-button");
      focus?.focus({ preventScroll: true });
      void chrome.storage.local.set({
        [ONBOARDING_STORAGE_KEY]: ONBOARDING_VERSION,
        [RELEASE_NOTICE_STORAGE_KEY]: manifest.version
      }).catch((error) => {
        console.warn("[Polaris] Onboarding read state could not be saved.", error);
      });
    }

    currentDialog.addEventListener("close", () => dismiss());
    document.body.appendChild(currentDialog);
    currentDialog.showModal();
    show(0);
    next.focus({ preventScroll: true });
  }

  function showPending() {
    if (pending && !dismissedInSession && !document.hidden) {
      pending = false;
      open({ automatic: true });
    }
  }

  document.addEventListener("visibilitychange", showPending);
  const ready = (async () => {
    let seen = 0;
    try {
      const stored = await chrome.storage.local.get(ONBOARDING_STORAGE_KEY);
      seen = Number(stored?.[ONBOARDING_STORAGE_KEY]) || 0;
    } catch (error) {
      console.warn("[Polaris] Onboarding read state could not be loaded.", error);
      return false;
    }
    if (seen >= ONBOARDING_VERSION || dismissedInSession) return false;
    pending = true;
    showPending();
    return true;
  })();

  return { ready, open: () => open() };
}
