import { billingAllowsPlatform } from "./billing-access.js";
import { SUPPORTED_PLATFORMS, openPlatformTab, rememberPlatform } from "./supported-platforms.js";

export function createSidepanelPlatformMenu({ document, chrome, locale, getView, getPlatform, onManage, onRestricted, onUpgrade }) {
  const win = document.defaultView;
  const text = (zh, en) => locale === "zh" ? zh : en;
  let menu = null;
  let signature = "";
  let switching = false;
  const anchor = () => document.querySelector(".window-platform");
  function element(tag, className, content) {
    const node = document.createElement(tag);
    node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function button(label, action, className = "secondary-button platform-menu-action") {
    const node = element("button", className, label);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  }
  function close(restoreFocus = false) {
    menu?.remove(); menu = null; signature = "";
    anchor()?.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", outside);
    document.removeEventListener("focusin", outside);
    document.removeEventListener("keydown", keydown);
    win.removeEventListener("resize", position);
    win.removeEventListener("scroll", position);
    if (restoreFocus) anchor()?.focus({ preventScroll: true });
  }
  function outside(event) {
    if (!menu?.contains(event.target) && !anchor()?.contains(event.target)) close();
  }
  function keydown(event) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
  }
  function position() {
    const trigger = anchor();
    if (!menu || !trigger) { close(); return; }
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(320, win.innerWidth - 24);
    const top = rect.bottom + 8;
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, win.innerWidth - width - 12))}px`;
    menu.style.top = `${top}px`;
    menu.style.maxHeight = `${Math.max(80, win.innerHeight - top - 12)}px`;
  }
  async function switchTo(platform) {
    if (switching) return;
    switching = true;
    if (menu) for (const item of menu.querySelectorAll("button")) item.disabled = true;
    try {
      await openPlatformTab(chrome, platform);
      void rememberPlatform(chrome, platform.key).catch(() => {});
      close();
    } catch {
      if (!menu) open();
      menu?.querySelector("[role=alert]")?.remove();
      const error = element("p", "platform-menu-error", text("无法打开平台，请重试。", "Could not open this platform. Please retry."));
      error.setAttribute("role", "alert"); menu?.append(error);
    } finally {
      switching = false;
      if (menu) for (const item of menu.querySelectorAll("button")) item.disabled = false;
    }
  }
  function refresh() {
    if (!menu) return;
    if (!anchor()) { close(); return; }
    anchor().setAttribute("aria-expanded", "true");
    const view = getView(); const current = getPlatform();
    const nextSignature = JSON.stringify([view?.available, view?.tier, view?.fullAccess, view?.platforms, current]);
    if (signature === nextSignature) { position(); return; }
    signature = nextSignature;
    const focused = menu.contains(document.activeElement) ? document.activeElement.dataset.platform : null;
    menu.replaceChildren();
    const title = element("div", "platform-menu-heading");
    title.append(element("strong", "", text("切换平台", "Switch platform")));
    const tier = element("span", "platform-menu-tier", view?.tier === "pro" ? "Pro" : view?.tier === "trial" ? text("试用中", "Trial") : view?.available ? `Free · ${view.platforms?.length || 0} / 2` : text("平台", "Platforms"));
    if (view?.tier === "trial") {
      tier.classList.add("is-trial");
      tier.title = text("全部平台试用中", "Full-access trial");
    }
    title.append(tier);
    menu.append(title);
    for (const allowed of [true, false]) {
      const platforms = SUPPORTED_PLATFORMS.filter(platform => billingAllowsPlatform(view, platform.key) === allowed);
      if (!platforms.length) continue;
      if (!allowed) menu.append(element("p", "platform-menu-label", text("其他平台", "Other platforms")));
      const list = element("div", allowed ? "platform-menu-list" : "platform-menu-list is-restricted");
      for (const platform of platforms) {
        const item = button("", () => {
          if (allowed) void switchTo(platform);
          else { close(true); onRestricted(platform); }
        }, "platform-menu-platform");
        item.dataset.platform = platform.key;
        item.disabled = switching;
        const icon = element("img", ""); icon.src = chrome.runtime.getURL(platform.favicon); icon.alt = "";
        item.append(icon, element("span", "platform-menu-name", platform.label));
        if (platform.key === current) item.setAttribute("aria-current", "true");
        const state = element("span", "platform-menu-state", !allowed ? text("未启用", "Not enabled") : platform.key === current ? text("当前", "Current") : "");
        if (!allowed) {
          item.setAttribute("aria-label", `${platform.label} · ${text("未启用", "Not enabled")}`);
          state.textContent = "";
          const lock = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          lock.setAttribute("viewBox", "0 0 24 24"); lock.setAttribute("aria-hidden", "true");
          const path = document.createElementNS(lock.namespaceURI, "path");
          path.setAttribute("d", "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5Z"); lock.append(path); state.append(lock);
        }
        item.append(state); list.append(item);
      }
      menu.append(list);
    }
    if (view?.tier !== "pro") {
      const actions = element("div", "platform-menu-footer");
      actions.append(button(text("更换免费平台", "Change free platforms"), () => { close(true); onManage(); }));
      actions.append(button("Get Pro", () => { close(true); onUpgrade(); }, "settings-diagnostic-primary platform-menu-action"));
      menu.append(actions);
    }
    if (focused) [...menu.querySelectorAll("[data-platform]")].find(node => node.dataset.platform === focused)?.focus({ preventScroll: true });
    position();
  }
  function open() {
    if (menu) return;
    menu = element("div", "window-platform-menu"); menu.id = "window-platform-menu";
    menu.setAttribute("role", "dialog"); menu.setAttribute("aria-label", text("切换平台", "Switch platform"));
    document.body.append(menu); refresh();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", keydown);
    win.addEventListener("resize", position);
    win.addEventListener("scroll", position);
    menu?.querySelector("button")?.focus({ preventScroll: true });
  }
  win.addEventListener("pagehide", () => close(), { once: true });
  return { refresh, close, switchTo, isOpen: () => Boolean(menu), toggle() { if (menu) close(true); else open(); } };
}
