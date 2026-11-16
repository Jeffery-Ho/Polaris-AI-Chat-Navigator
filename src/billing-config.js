// Production license API. The Worker decides USD 12.90 during the server-recorded
// seven-day trial and USD 19.99 afterward. The extension cannot choose the price.
export const BILLING_API_URL = "https://polaris-license-production.hexianji.workers.dev";
export const BILLING_STRIPE_MODE = "live";

export function billingHostPermission(apiUrl = BILLING_API_URL) {
  if (typeof apiUrl !== "string" || apiUrl === "") return null;
  let url;
  try { url = new URL(apiUrl); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
  return `${url.origin}/*`;
}

export const BILLING_HOST_PERMISSION = billingHostPermission();
