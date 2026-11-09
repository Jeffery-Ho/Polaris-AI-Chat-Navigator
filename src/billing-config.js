// Production license API is intentionally unset. Release builds must not call the
// test Worker. Buying stays disabled until a real production endpoint exists.
export const BILLING_API_URL = "";

export function billingHostPermission(apiUrl = BILLING_API_URL) {
  if (typeof apiUrl !== "string" || apiUrl === "") return null;
  let url;
  try { url = new URL(apiUrl); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
  return `${url.origin}/*`;
}

export const BILLING_HOST_PERMISSION = billingHostPermission();
