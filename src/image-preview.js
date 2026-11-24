export function showImagePreview(thumbnail, parent, t, onClose) {
  const doc = parent.ownerDocument;
  const dialog = doc.createElement("dialog");
  dialog.className = "polaris-image-viewer";
  dialog.setAttribute("aria-label", t("userMarker.imagePreview"));
  const image = doc.createElement("img");
  image.alt = t("userMarker.imagePreview");
  const closeButton = doc.createElement("button");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", t("userMarker.closeImagePreview"));
  const failure = doc.createElement("span");
  failure.hidden = true;
  failure.textContent = t("userMarker.imagePreviewLoadFailure");
  const viewport = doc.createElement("div");
  viewport.className = "polaris-image-viewport";
  viewport.append(image, failure);
  dialog.append(viewport, closeButton);
  parent.append(dialog);
  let closing = false;
  let zoom = 1;

  function setZoom(value, clientX, clientY) {
    if (closing || !image.naturalWidth) return;
    const next = Math.min(8, Math.max(1, value));
    if (next === zoom) return;
    const before = image.getBoundingClientRect();
    if (!before.width || !before.height) return;
    const anchorX = Math.min(1, Math.max(0, (clientX - before.left) / before.width));
    const anchorY = Math.min(1, Math.max(0, (clientY - before.top) / before.height));
    const fit = Math.min(1, viewport.clientWidth / image.naturalWidth, viewport.clientHeight / image.naturalHeight);
    zoom = next;
    image.toggleAttribute("data-zoomed", zoom > 1);
    image.style.width = zoom > 1 ? image.naturalWidth * fit * zoom + "px" : "";
    const after = image.getBoundingClientRect();
    viewport.scrollLeft += after.left + after.width * anchorX - clientX;
    viewport.scrollTop += after.top + after.height * anchorY - clientY;
  }

  dialog.addEventListener("wheel", event => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
    setZoom(zoom * Math.exp(-event.deltaY * unit / 100), event.clientX, event.clientY);
  }, { passive: false });
  image.addEventListener("dblclick", event => {
    event.preventDefault();
    setZoom(zoom > 1 ? 1 : 2, event.clientX, event.clientY);
  });

  function animate(opening) {
    if (!dialog.animate || doc.defaultView.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const duration = opening ? 200 : 150;
    const options = { duration, easing: "cubic-bezier(.2,.75,.25,1)" };
    const small = thumbnail.getBoundingClientRect();
    const large = image.getBoundingClientRect();
    if (small.width && large.width && large.height) {
      const x = small.left - large.left + (small.width - large.width) / 2;
      const y = small.top - large.top + (small.height - large.height) / 2;
      const scale = Math.min(small.width / large.width, small.height / large.height);
      const frames = [{ transform: `translate(${x}px,${y}px) scale(${scale})` }, { transform: "none" }];
      image.animate(opening ? frames : frames.reverse(), options);
    }
    return dialog.animate({ opacity: opening ? [0, 1] : [1, 0] }, options).finished;
  }

  function dismiss() {
    if (!dialog.isConnected) return;
    dialog.remove();
    if (thumbnail.isConnected) thumbnail.focus({ preventScroll: true });
    onClose();
  }

  async function close() {
    if (closing) return;
    closing = true;
    try { await animate(false); } finally { dismiss(); }
  }

  closeButton.onclick = close;
  dialog.onclick = event => { if (event.target === dialog || event.target === viewport) void close(); };
  dialog.oncancel = event => { event.preventDefault(); void close(); };
  image.onload = () => { if (!closing && dialog.isConnected) animate(true); };
  image.onerror = () => { image.hidden = true; failure.hidden = false; };
  dialog.showModal();
  closeButton.focus({ preventScroll: true });
  image.src = thumbnail.currentSrc || thumbnail.src;
  return dismiss;
}
