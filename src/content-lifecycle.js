// Own resources that outlive the navigation DOM so a reloaded content script
// can start again without leaving callbacks from the previous instance.
export function createContentLifecycle(window) {
  const cleanups = [];
  const timers = new Set();
  const frames = new Set();
  let disposed = false;

  function listen(target, type, listener, options) {
    if (disposed) return;
    target.addEventListener(type, listener, options);
    cleanups.push(() => target.removeEventListener(type, listener, options));
  }

  function listenChrome(event, listener) {
    if (disposed) return;
    event.addListener(listener);
    cleanups.push(() => event.removeListener(listener));
  }

  function setTimeout(callback, delay) {
    if (disposed) return 0;
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (!disposed) callback();
    }, delay);
    timers.add(id);
    return id;
  }

  function clearTimeout(id) {
    timers.delete(id);
    window.clearTimeout(id);
  }

  function requestAnimationFrame(callback) {
    if (disposed) return 0;
    const id = window.requestAnimationFrame((time) => {
      frames.delete(id);
      if (!disposed) callback(time);
    });
    frames.add(id);
    return id;
  }

  function cancelAnimationFrame(id) {
    frames.delete(id);
    window.cancelAnimationFrame(id);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const cleanup of cleanups.splice(0).reverse()) {
      try {
        cleanup();
      } catch {
        // Chrome events can already be unavailable after extension invalidation.
      }
    }
    for (const id of timers) window.clearTimeout(id);
    for (const id of frames) window.cancelAnimationFrame(id);
    timers.clear();
    frames.clear();
  }

  return { listen, listenChrome, setTimeout, clearTimeout, requestAnimationFrame, cancelAnimationFrame, dispose };
}
