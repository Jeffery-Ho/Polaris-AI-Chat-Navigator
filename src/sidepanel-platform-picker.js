import { SUPPORTED_PLATFORMS } from "./supported-platforms.js";

export function createPlatformPicker({ document, chrome, locale, selection = [], onChange = () => {} }) {
  const text = (zh, en) => locale === "zh" ? zh : en;
  const valid = new Set(SUPPORTED_PLATFORMS.map(platform => platform.key));
  let selected = [...new Set(selection)].filter(key => valid.has(key)).slice(0, 2);
  const element = document.createElement("div");
  element.className = "platform-picker";
  const list = document.createElement("div");
  list.className = "billing-platforms";
  list.setAttribute("role", "group");
  list.setAttribute("aria-label", text("选择两个免费平台", "Choose two free platforms"));
  const count = document.createElement("span");
  count.className = "platform-picker-count";
  count.setAttribute("role", "status");
  const status = document.createElement("p");
  status.className = "platform-picker-status";
  status.setAttribute("role", "status");
  function update(limitReached = false) {
    for (const button of list.children) button.setAttribute("aria-pressed", String(selected.includes(button.dataset.platform)));
    count.textContent = `${selected.length} / 2`;
    count.setAttribute("aria-label", text(`已选择 ${selected.length} 个平台，共 2 个名额`, `${selected.length} of 2 platforms selected`));
    status.hidden = !limitReached;
    status.textContent = limitReached
      ? text("已选满两个，请先取消一个平台。", "Two selected. Deselect one before choosing another.")
      : "";
  }
  for (const platform of SUPPORTED_PLATFORMS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "billing-platform";
    button.dataset.platform = platform.key;
    const icon = document.createElement("img");
    icon.src = chrome.runtime.getURL(platform.favicon);
    icon.alt = "";
    const name = document.createElement("span");
    name.textContent = platform.label;
    const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    check.setAttribute("viewBox", "0 0 24 24");
    check.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(check.namespaceURI, "path");
    path.setAttribute("d", "m5 12 4 4 10-10");
    check.append(path);
    button.append(icon, name, check);
    button.addEventListener("click", () => {
      if (selected.includes(platform.key)) selected = selected.filter(key => key !== platform.key);
      else if (selected.length < 2) selected.push(platform.key);
      else { update(true); return; }
      update(); onChange([...selected]);
    });
    list.append(button);
  }
  element.append(list, status);
  update();
  return { element, count, getSelection: () => [...selected], setBusy(busy) { for (const button of list.children) button.disabled = busy; } };
}
