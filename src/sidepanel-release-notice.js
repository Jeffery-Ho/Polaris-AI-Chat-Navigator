import { releaseNotesForUpdate } from "./release-notes.js";

const STORAGE_KEY = "polaris-release-notice-version";

export function createSidepanelReleaseNotice({ document, chrome, locale, t }) {
  const manifest = chrome.runtime.getManifest();
  let pendingNotes = [];
  let dialog = null;
  let dismissCurrentDialog = null;
  let lastKnownVersion = null;
  let dismissedInSession = false;
  let automatic = false;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function open(notes = releaseNotesForUpdate(null, manifest.version, 1), isAutomatic = false) {
    if (dialog?.open || !notes.length) return;
    automatic = isAutomatic;
    const returnFocus = document.activeElement;
    const currentDialog = element("dialog", "release-notice-dialog");
    dialog = currentDialog;
    currentDialog.setAttribute("aria-labelledby", "release-notice-title");
    const header = element("header", "release-notice-header");
    const title = element("h2", "release-notice-title", t("releaseNotice.title"));
    title.id = "release-notice-title";
    const close = element("button", "release-notice-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", t("releaseNotice.close"));
    close.addEventListener("click", () => dismiss());
    header.append(title, close);
    currentDialog.append(header, element("p", "release-notice-summary", t("releaseNotice.summary", { version: manifest.version_name || manifest.version })));
    const content = element("div", "release-notice-notes");
    for (const note of notes) {
      const localized = note[locale] || note.en;
      const section = element("section", "release-notice-note");
      const heading = element("h3", "", `${note.version} · ${localized.title}`);
      const changes = element("ul", "");
      for (const change of localized.changes) changes.appendChild(element("li", "", change));
      section.append(heading, changes);
      content.appendChild(section);
    }
    currentDialog.append(content, element("p", "release-notice-feedback", t("releaseNotice.feedback")));
    const actions = element("div", "release-notice-actions");
    for (const [label, href] of [
      [t("support.aria"), "https://jeffery-ho.github.io/polaris-landing/entry/extension/"],
      [t("releaseNotice.emailAction"), "mailto:jefferyho.build@gmail.com"],
      [t("releaseNotice.issueAction"), "https://github.com/Jeffery-Ho/Polaris-AI-Chat-Navigator/issues"]
    ]) {
      const link = element("a", "settings-link", label);
      link.href = href;
      link.target = "_blank";
      link.rel = "noreferrer";
      if (href.includes("/polaris-landing/")) {
        link.classList.add("release-notice-support");
        link.setAttribute("aria-label", label);
        link.title = label;
        link.textContent = "";
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("viewBox", "0 0 24 24");
        icon.setAttribute("aria-hidden", "true");
        const heart = document.createElementNS("http://www.w3.org/2000/svg", "path");
        heart.setAttribute("d", "M12 21s-7-4.35-9.5-8.5C.38 8.93 2.71 5 6.5 5c2.08 0 4.04 1.08 5.5 2.72C13.46 6.08 15.42 5 17.5 5c3.79 0 6.12 3.93 4 7.5C19 16.65 12 21 12 21Z");
        icon.appendChild(heart);
        link.appendChild(icon);
      }
      actions.appendChild(link);
    }
    const acknowledge = element("button", "secondary-button release-notice-acknowledge", t("releaseNotice.acknowledge"));
    acknowledge.type = "button";
    acknowledge.autofocus = true;
    acknowledge.addEventListener("click", () => dismiss());
    actions.appendChild(acknowledge);
    currentDialog.appendChild(actions);
    currentDialog.addEventListener("cancel", (event) => { event.preventDefault(); dismiss(); });
    let closed = false;
    function dismiss(markRead = true) {
      if (closed) return;
      closed = true;
      dismissedInSession = true;
      pendingNotes = [];
      if (currentDialog.open) currentDialog.close();
      currentDialog.remove();
      if (dialog === currentDialog) {
        dialog = null;
        dismissCurrentDialog = null;
      }
      const focus = returnFocus?.isConnected && returnFocus !== document.body
        ? returnFocus : document.querySelector(".settings-release-notes, .window-settings-button");
      focus?.focus({ preventScroll: true });
      if (markRead) {
        lastKnownVersion = manifest.version;
        void chrome.storage.local.set({ [STORAGE_KEY]: manifest.version }).catch((error) => {
          console.warn("[Polaris] Update notice read state could not be saved.", error);
        });
      }
    }
    dismissCurrentDialog = dismiss;
    currentDialog.addEventListener("close", () => dismiss());
    document.body.appendChild(currentDialog);
    currentDialog.showModal();
  }

  function showPending() {
    if (!dismissedInSession && pendingNotes.length && !document.hidden) open(pendingNotes, true);
  }

  document.addEventListener("visibilitychange", showPending);
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEY]) return;
    const newVersion = changes[STORAGE_KEY].newValue;
    if (typeof newVersion !== "string") return;
    lastKnownVersion = newVersion;
    if (releaseNotesForUpdate(newVersion, manifest.version).length) return;
    pendingNotes = [];
    // Another sidepanel acknowledged this version. Do not interrupt manual review.
    if (automatic && dialog?.open) dismissCurrentDialog(false);
  });
  const ready = (async () => {
    let lastSeen = null;
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      lastSeen = typeof stored[STORAGE_KEY] === "string" ? stored[STORAGE_KEY] : null;
    } catch (error) {
      console.warn("[Polaris] Update notice read state could not be loaded.", error);
    }
    pendingNotes = dismissedInSession ? [] : releaseNotesForUpdate(lastKnownVersion || lastSeen, manifest.version);
    showPending();
  })();
  return { ready, open: () => open() };
}
