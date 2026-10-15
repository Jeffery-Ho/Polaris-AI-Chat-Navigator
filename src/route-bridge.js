(() => {
  const INSTANCE_KEY = "__POLARIS_ROUTE_BRIDGE_ACTIVE__";
  if (window[INSTANCE_KEY]) return;
  window[INSTANCE_KEY] = true;
  const ROUTE_CHANGE_EVENT = "polaris-for-web-route-change";
  const originals = new Map();
  const wrappers = new Map();

  function notifyRouteChange() {
    window.dispatchEvent(new Event(ROUTE_CHANGE_EVENT));
  }

  ["pushState", "replaceState"].forEach((method) => {
    const original = window.history[method];
    originals.set(method, original);
    const wrapper = function (...args) {
      const result = original.apply(this, args);
      notifyRouteChange();
      return result;
    };
    wrappers.set(method, wrapper);
    window.history[method] = wrapper;
  });

  window.addEventListener("popstate", notifyRouteChange);
  window.addEventListener("hashchange", notifyRouteChange);

  function dispose() {
    for (const [method, original] of originals) {
      if (window.history[method] === wrappers.get(method)) window.history[method] = original;
    }
    window.removeEventListener("popstate", notifyRouteChange);
    window.removeEventListener("hashchange", notifyRouteChange);
    window.removeEventListener("polaris-for-web-route-dispose", dispose);
    delete window[INSTANCE_KEY];
  }

  window.addEventListener("polaris-for-web-route-dispose", dispose);

})();
