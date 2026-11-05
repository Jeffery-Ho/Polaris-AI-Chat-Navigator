// Until a test deployment successfully initializes licensing, existing installs
// retain their current behavior. No Pro entitlement is invented during outages.
export function billingAllowsPlatform(view, platform) {
  return !view?.available || view.fullAccess === true || view.platforms?.includes(platform) === true;
}

export function billingAllowsIndex(view) {
  return !view?.available || view.fullAccess === true;
}
