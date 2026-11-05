export function createBillingMessageHandler({ chrome, service }) {
  const extensionUrl = new URL(chrome.runtime.getURL(""));
  function trustedPage(sender) {
    try {
      const url = new URL(sender.url);
      return sender?.id === chrome.runtime.id && url.protocol === extensionUrl.protocol && url.host === extensionUrl.host;
    } catch { return false; }
  }
  return async (message, sender) => {
    if (sender?.id !== chrome.runtime.id) return { ok: false };
    if (message.action === "access") return { ok: true, view: await (service.getAccess ? service.getAccess() : service.getView()) };
    if (!trustedPage(sender)) return { ok: false };
    try {
      switch (message.action) {
        case "get": return { ok: true, view: await service.getView() };
        case "refresh": return { ok: true, view: await service.refresh() };
        case "purchase-status": return { ok: true, view: await service.purchaseStatus() };
        case "redeem": return { ok: true, view: await service.redeem(message.licenseKey) };
        case "recover": return { ok: true, ...await service.recover(message.email) };
        case "deactivate": return { ok: true, view: await service.deactivate() };
        case "platforms": return { ok: true, view: await service.selectPlatforms(message.platforms) };
        case "remember-platform": return { ok: true, view: await service.rememberPlatform(message.platform) };
        case "checkout": {
          const result = await service.checkout();
          await chrome.tabs.create({ url: result.checkoutUrl, active: true });
          return { ok: true, view: await service.getView() };
        }
        default: return { ok: false };
      }
    } catch (error) {
      return { ok: false, error: error?.message === "price_changed" ? "price_changed" : "billing_unavailable" };
    }
  };
}
