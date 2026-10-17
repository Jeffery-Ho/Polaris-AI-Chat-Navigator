import settingsStyles from "./settings-panel.css?inline";

function createElement(tagName, className) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  return element;
}

function createIcon(pathData) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("viewBox", "0 0 24 24");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathData);
  path.setAttribute("fill", "currentColor");
  svg.appendChild(path);
  return svg;
}

function createMailIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("viewBox", "0 0 24 24");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M4 6.5h16v11H4zM4.5 7l7.5 6 7.5-6");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-width", "1.7");
  svg.appendChild(path);
  return svg;
}

function createXIcon() {
  return createIcon("M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817-5.964 6.817H1.684l7.73-8.835L1.25 2.25h6.824l4.713 6.231 5.457-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z");
}

function createStarIcon() {
  return createIcon("M12 2.75l2.8 5.68 6.27.91-4.54 4.42 1.07 6.24L12 17.08l-5.6 2.94 1.07-6.24-4.54-4.42 6.27-.91L12 2.75Z");
}

function createSupportHeartIcon() {
  return createIcon("M12 21.1 4.4 13.6A5.4 5.4 0 0 1 12 6a5.4 5.4 0 0 1 7.6 7.6Z");
}

function createSlider(field, model) {
  const wrapper = createElement("label", "polaris-settings-slider");
  const label = createElement("span", "polaris-settings-slider-label");
  const name = document.createElement("span");
  name.textContent = field.label;
  const output = createElement("output", "polaris-settings-slider-output");
  output.textContent = `${field.value}${field.unit ? ` ${field.unit}` : ""}`;
  label.append(name, output);

  const input = document.createElement("input");
  input.type = "range";
  input.min = String(field.min);
  input.max = String(field.max);
  input.step = String(field.step);
  input.value = String(field.value);
  input.setAttribute("aria-label", field.label);
  const syncProgress = () => {
    const progress = ((Number(input.value) - field.min) / (field.max - field.min)) * 100;
    input.style.setProperty("--polaris-slider-progress", `${progress}%`);
    output.textContent = `${input.value}${field.unit ? ` ${field.unit}` : ""}`;
  };
  syncProgress();
  input.addEventListener("input", () => {
    syncProgress();
    model.onConfigChange(field.key, Number(input.value));
  });
  input.addEventListener("change", () => model.onConfigCommit(field.key));
  input.addEventListener("keyup", (event) => {
    if (["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp"].includes(event.key)) {
      model.onConfigCommit(field.key);
    }
  });
  wrapper.append(label, input);
  return wrapper;
}

function createCheckbox({ label, isSelected, isDisabled, onChange }) {
  const wrapper = createElement("label", "polaris-settings-checkbox");
  if (isSelected) {
    wrapper.dataset.selected = "true";
  }
  if (isDisabled) {
    wrapper.dataset.disabled = "true";
  }

  const input = document.createElement("input");
  input.checked = isSelected;
  input.className = "polaris-settings-checkbox-input";
  input.disabled = isDisabled;
  input.type = "checkbox";
  input.addEventListener("change", () => onChange(input.checked));

  const content = document.createElement("span");
  content.dataset.slot = "checkbox-content";
  const control = document.createElement("span");
  control.setAttribute("aria-hidden", "true");
  control.dataset.slot = "checkbox-control";
  const indicator = document.createElement("span");
  indicator.dataset.slot = "checkbox-indicator";
  indicator.textContent = "✓";
  control.appendChild(indicator);
  const text = document.createElement("span");
  text.textContent = label;
  content.append(control, text);
  wrapper.append(input, content);
  return wrapper;
}

function createSeparator() {
  const separator = createElement("div", "polaris-settings-separator");
  separator.setAttribute("aria-hidden", "true");
  return separator;
}

function createDiagnosticsSection(model) {
  const section = createElement("section", "polaris-settings-diagnostics");
  const title = createElement("h2", "polaris-settings-section-title");
  title.textContent = model.diagnosticTitle;
  const description = createElement("p", "polaris-settings-diagnostics-description");
  description.textContent = model.diagnosticDescription;

  const actions = createElement("div", "polaris-settings-diagnostics-actions");
  const send = createElement("button", "polaris-settings-diagnostics-send");
  send.type = "button";
  send.textContent = model.diagnosticSendLabel;
  send.addEventListener("click", model.onSendDiagnostics);
  const download = createElement("button", "polaris-settings-diagnostics-download");
  download.type = "button";
  download.textContent = model.diagnosticDownloadLabel;
  download.addEventListener("click", model.onDownloadDiagnostics);
  actions.append(send, download);

  section.append(title, description, actions);
  if (model.diagnosticStatus) {
    const status = createElement("p", "polaris-settings-diagnostics-status");
    status.setAttribute("role", "status");
    status.textContent = model.diagnosticStatus;
    section.appendChild(status);
  }
  return section;
}

function createSettingsPanel(model) {
  const shell = createElement("div", "polaris-settings-shell");
  const card = createElement("section", "polaris-settings-card");
  card.setAttribute("aria-label", model.appName);

  const header = createElement("header", "polaris-settings-header");
  const app = createElement("div", "polaris-settings-app");
  const icon = document.createElement("img");
  icon.alt = "";
  icon.height = 16;
  icon.src = model.iconUrl;
  icon.width = 16;
  const title = createElement("span", "polaris-settings-app-title");
  title.textContent = model.appName;
  app.append(icon, title);
  const support = createElement("a", "polaris-settings-support-link");
  support.href = model.supportUrl;
  support.target = "_blank";
  support.rel = "noreferrer";
  support.setAttribute("aria-label", model.supportLabel);
  support.title = model.supportLabel;
  support.appendChild(createSupportHeartIcon());
  header.append(app, support);

  const body = createElement("div", "polaris-settings-body");
  const supportedPlatforms = createElement("p", "polaris-settings-supported-platforms");
  supportedPlatforms.textContent = model.supportedPlatformsLabel;
  body.append(supportedPlatforms, createDiagnosticsSection(model));

  if (model.showRating) {
    const rating = createElement("section", "polaris-settings-rating");
    const ratingLink = createElement("a", "polaris-settings-rating-link");
    ratingLink.href = model.ratingUrl;
    ratingLink.target = "_blank";
    ratingLink.rel = "noreferrer";
    ratingLink.setAttribute("aria-label", model.ratingAriaLabel);
    const ratingIcon = createElement("span", "polaris-settings-rating-icon");
    ratingIcon.appendChild(createStarIcon());
    const ratingPrompt = createElement("span", "polaris-settings-rating-prompt");
    ratingPrompt.textContent = model.ratingPrompt;
    const ratingAction = createElement("span", "polaris-settings-rating-action");
    ratingAction.textContent = model.ratingAction;
    ratingLink.append(ratingIcon, ratingPrompt, ratingAction);

    const dismissRating = createElement("button", "polaris-settings-rating-dismiss");
    dismissRating.type = "button";
    dismissRating.setAttribute("aria-label", model.ratingDismissLabel);
    dismissRating.title = model.ratingDismissLabel;
    dismissRating.textContent = "×";
    dismissRating.addEventListener("click", model.onDismissRating);

    rating.append(ratingLink, dismissRating);
    body.appendChild(rating);
  }

  const settingsHeader = createElement("div", "polaris-settings-section-header");
  const settingsTitle = document.createElement("h2");
  settingsTitle.className = "polaris-settings-section-title";
  settingsTitle.textContent = model.settingsTitle;
  const reset = createElement("button", "polaris-settings-reset");
  reset.type = "button";
  reset.textContent = model.resetLabel;
  reset.addEventListener("click", model.onReset);
  settingsHeader.append(settingsTitle, reset);
  body.appendChild(settingsHeader);

  const sliders = createElement("div", "polaris-settings-sliders");
  model.fields.forEach((field) => sliders.appendChild(createSlider(field, model)));
  body.append(sliders, createSeparator());

  const markerTypes = createElement("section", "polaris-settings-marker-types");
  markerTypes.setAttribute("aria-label", model.markerTypesLabel);
  const markerTypesLabel = createElement("span", "polaris-settings-section-label");
  markerTypesLabel.textContent = model.markerTypesLabel;
  const checkboxes = createElement("div", "polaris-settings-checkboxes");
  model.markerLevels.forEach((option) => {
    checkboxes.appendChild(createCheckbox({
      label: option.label,
      isDisabled: option.isDisabled,
      isSelected: option.isSelected,
      onChange: (isSelected) => model.onMarkerLevelChange(option.level, isSelected)
    }));
  });
  checkboxes.appendChild(createCheckbox({
    label: model.strong.label,
    isDisabled: false,
    isSelected: model.strong.isSelected,
    onChange: model.onStrongChange
  }));
  checkboxes.appendChild(createCheckbox({
    label: model.unorderedList.label,
    isDisabled: false,
    isSelected: model.unorderedList.isSelected,
    onChange: model.onUnorderedListChange
  }));
  checkboxes.appendChild(createCheckbox({
    label: model.orderedList.label,
    isDisabled: false,
    isSelected: model.orderedList.isSelected,
    onChange: model.onOrderedListChange
  }));
  markerTypes.append(markerTypesLabel, checkboxes);
  body.appendChild(markerTypes);

  const footer = createElement("footer", "polaris-settings-footer");
  const versionActions = createElement("div", "polaris-settings-version-actions");
  const version = createElement("span", "polaris-settings-version");
  version.textContent = model.version;
  const releaseNotes = createElement("button", "polaris-settings-release-notes");
  releaseNotes.type = "button";
  releaseNotes.textContent = model.releaseNotesLabel;
  releaseNotes.addEventListener("click", model.onOpenReleaseNotes);
  versionActions.append(version, releaseNotes);
  const actions = createElement("div", "polaris-settings-contact-actions");
  actions.setAttribute("aria-label", model.contactLabel);
  const x = createElement("a", "polaris-settings-contact-action");
  x.setAttribute("aria-label", model.xLabel);
  x.href = model.xUrl;
  x.rel = "noreferrer";
  x.target = "_blank";
  x.title = model.xLabel;
  x.appendChild(createXIcon());
  const email = createElement("a", "polaris-settings-contact-action");
  email.setAttribute("aria-label", model.emailLabel);
  email.href = model.emailUrl;
  email.title = model.emailLabel;
  email.appendChild(createMailIcon());
  const issue = createElement("a", "polaris-settings-contact-action");
  issue.setAttribute("aria-label", model.issueLabel);
  issue.href = model.issueUrl;
  issue.rel = "noreferrer";
  issue.target = "_blank";
  issue.title = model.issueLabel;
  issue.appendChild(createIcon("M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.161-1.11-1.47-1.11-1.47-.908-.62.069-.608.069-.608 1.003.071 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.03-2.688-.103-.253-.447-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.748-1.026 2.748-1.026.546 1.379.202 2.398.1 2.65.64.7 1.029 1.595 1.029 2.688 0 3.848-2.339 4.695-4.566 4.944.359.31.678.921.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.481A10.019 10.019 0 0 0 22 12.017C22 6.484 17.523 2 12 2Z"));
  actions.append(x, email, issue);
  footer.append(versionActions, actions);

  card.append(header, createSeparator(), body, createSeparator(), footer);
  shell.appendChild(card);
  return shell;
}

export function mountSettingsPanel(host) {
  const shadowRoot = host.shadowRoot || host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = settingsStyles;
  const mountPoint = document.createElement("div");
  shadowRoot.replaceChildren(style, mountPoint);

  return {
    render(model) {
      const previousBody = mountPoint.querySelector(".polaris-settings-body");
      const scrollTop = previousBody instanceof HTMLElement ? previousBody.scrollTop : 0;
      mountPoint.replaceChildren(createSettingsPanel(model));
      const nextBody = mountPoint.querySelector(".polaris-settings-body");
      if (nextBody instanceof HTMLElement) {
        nextBody.scrollTop = scrollTop;
      }
    },
    unmount() {
      shadowRoot.replaceChildren();
    }
  };
}
