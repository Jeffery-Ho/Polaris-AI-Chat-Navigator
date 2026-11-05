// Shared by the page-world readers. Native host requests are never blocked.
export function createIndexReadCooldown({ now = () => Date.now() } = {}) {
  let retryAt = 0;
  let reason = "";
  return {
    error() {
      if (now() >= retryAt) return null;
      return Object.assign(new Error(reason), { retryAt });
    },
    observe(response) {
      if (![429, 503].includes(response.status)) return;
      const header = response.headers.get("Retry-After")?.trim();
      const seconds = header && /^\d+(?:\.\d+)?$/.test(header) ? Number(header) : NaN;
      const parsed = Number.isFinite(seconds) ? now() + seconds * 1000 : Date.parse(header);
      const until = Number.isFinite(parsed) && parsed >= now() ? parsed : now() + 30000;
      retryAt = Math.max(retryAt, until);
      reason = `http-${response.status}`;
    }
  };
}
