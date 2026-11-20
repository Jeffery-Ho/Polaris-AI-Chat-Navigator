import { BILLING_API_URL, BILLING_STRIPE_MODE, billingHostPermission } from "./billing-config.js";
import { SUPPORTED_PLATFORMS } from "./supported-platforms.js";

export const BILLING_STORAGE_KEY = "polaris-billing-v1";
const DAY = 86400000;
const REFRESH_INTERVAL = 600000;
const platformKeys = new Set(SUPPORTED_PLATFORMS.map(({ key }) => key));
export const BILLING_ERRORS = new Set(["price_changed", "activation_limit_reached", "invalid_license", "rate_limited"]);
const BRAND_NAMES = [["Microsoft Edge", "Edge"], ["Google Chrome", "Chrome"], ["Opera", "Opera"], ["Brave", "Brave"], ["Arc", "Arc"], ["Dia", "Dia"], ["Vivaldi", "Vivaldi"]];

// A label the user can recognize in the license's browser list. Profile names are not
// readable by extensions, so two profiles of one browser differ only by their dates.
export function describeBrowser(nav = globalThis.navigator) {
  const brands = (nav?.userAgentData?.brands || []).map(({ brand }) => brand);
  const agent = nav?.userAgent || "";
  const known = BRAND_NAMES.find(([brand]) => brands.includes(brand));
  const browser = known ? known[1] : /Firefox\//.test(agent) ? "Firefox" : brands.includes("Chromium") || /Chrome\//.test(agent) ? "Chromium" : null;
  const platform = `${nav?.userAgentData?.platform || ""} ${agent}`;
  const os = /CrOS/.test(platform) ? "ChromeOS" : /Mac/.test(platform) ? "macOS" : /Win/.test(platform) ? "Windows" : /Android/.test(platform) ? "Android" : /Linux/.test(platform) ? "Linux" : null;
  return { browser, os };
}

function activationList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(item => typeof item?.id === "string").slice(0, 3).map(item => ({
    id: item.id,
    browser: typeof item.browser === "string" ? item.browser : null,
    os: typeof item.os === "string" ? item.os : null,
    activatedAt: Number(item.activatedAt) || null,
    lastSeenAt: Number(item.lastSeenAt) || null
  }));
}

export function createBillingService({ storage, fetch: request = globalThis.fetch, now = Date.now, apiUrl = BILLING_API_URL, stripeMode = BILLING_STRIPE_MODE, client = describeBrowser(), onChange = () => {} }) {
  let data = null;
  let initialization = null;
  let loading = null;
  let queue = Promise.resolve();
  let lastRequest = 0;
  let unavailable = false;

  function serial(task) {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  }

  async function save() {
    await storage.set({ [BILLING_STORAGE_KEY]: data });
    onChange(view());
  }

  function requestUrl(path) {
    const permission = billingHostPermission(apiUrl);
    if (!permission) throw new Error("billing_unavailable");
    let endpoint;
    try { endpoint = new URL(path, apiUrl); } catch { throw new Error("billing_unavailable"); }
    if (`${endpoint.origin}/*` !== permission) throw new Error("billing_unavailable");
    return endpoint.href;
  }

  async function call(path, body, headers = {}) {
    const response = await request(requestUrl(path), {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "X-Installation-Token": data.installationToken, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
      cache: "no-store"
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      const error = new Error(BILLING_ERRORS.has(result?.error) ? result.error : "billing_unavailable");
      error.status = response.status;
      if (result?.error === "activation_limit_reached") error.activations = activationList(result.activations);
      throw error;
    }
    return response.json();
  }

  function view() {
    const serverNow = now() + (data?.clockOffset || 0);
    const pro = Boolean(data?.activationToken && data?.entitlement?.status === "active" && serverNow < data.offlineUntil);
    const available = Boolean(data?.trialEndsAt);
    const trial = available && serverNow < data.trialEndsAt;
    const tier = pro ? "pro" : trial ? "trial" : available ? "free" : "unavailable";
    const platforms = (data?.platforms || []).filter(key => platformKeys.has(key)).slice(0, 2);
    const quoteExpired = data?.price?.amount < data?.price?.originalAmount && serverNow >= data.offerEndsAt;
    return {
      available, unavailable, tier,
      fullAccess: pro || trial,
      clockOffset: data?.clockOffset || 0,
      trialEndsAt: data?.trialEndsAt || null,
      offerEndsAt: data?.offerEndsAt || null,
      offlineUntil: pro ? data.offlineUntil : null,
      price: data?.price && !quoteExpired ? { ...data.price } : null,
      platforms,
      suggestedPlatforms: (data?.recentPlatforms || []).slice(0, 2),
      needsPlatformChoice: tier === "free" && platforms.length !== 2,
      purchaseStatus: data?.purchase?.status || "none",
      hasPurchase: Boolean(data?.purchase),
      activations: pro ? activationList(data.activations).map(item => ({ ...item, current: item.id === data.activationId })) : [],
      remoteDeactivated: !pro && Boolean(data?.remoteDeactivated)
    };
  }

  async function validate() {
    if (!data.activationToken) return;
    const result = await call("/api/licenses/validate", { activationToken: data.activationToken });
    if (result.valid && result.entitlement?.status === "active") {
      data.entitlement = result.entitlement;
      const serverNow = now() + (data.clockOffset || 0);
      data.offlineUntil = Math.min(Number(result.offlineUntil) || serverNow, serverNow + DAY);
      data.lastValidatedAt = now();
      if (typeof result.activationId === "string") data.activationId = result.activationId;
      if (Array.isArray(result.activations)) data.activations = activationList(result.activations);
    } else {
      clearActivation();
      data.remoteDeactivated = result.reason === "deactivated";
    }
  }

  function clearActivation() {
    delete data.activationToken;
    delete data.offlineUntil;
    delete data.activationId;
    delete data.activations;
    data.entitlement = null;
  }

  async function loadCatalog() {
    const result = await call(`/api/plans?installationId=${encodeURIComponent(data.installationId)}`);
    const price = result.plans?.find(plan => plan.id === "pro" && plan.currency === "usd");
    if (!price || ![1290, 1999].includes(price.amount)) throw new Error("billing_unavailable");
    if (Number.isFinite(result.serverTime)) data.clockOffset = result.serverTime - now();
    if (Number.isFinite(result.trialEndsAt)) data.trialEndsAt = result.trialEndsAt;
    if (Number.isFinite(result.offerEndsAt)) data.offerEndsAt = result.offerEndsAt;
    data.price = { amount: price.amount, originalAmount: price.originalAmount || price.amount, currency: "usd" };
  }

  async function refreshInternal() {
    lastRequest = now();
    unavailable = false;
    if (!data.trialEndsAt) {
      try {
        const trial = await call("/api/trial/start", { installationId: data.installationId, installationToken: data.installationToken });
        if (Number.isFinite(trial.serverTime)) data.clockOffset = trial.serverTime - now();
        data.trialEndsAt = trial.trialEndsAt;
        data.offerEndsAt = trial.offerEndsAt;
      } catch { unavailable = true; }
    }
    // A catalog outage must not discard an explicit revocation response.
    try { await validate(); } catch { unavailable = true; }
    try { await loadCatalog(); } catch { unavailable = true; }
    await save();
    return view();
  }

  async function load() {
    if (!loading) loading = (async () => {
      const stored = await storage.get(BILLING_STORAGE_KEY);
      data = stored[BILLING_STORAGE_KEY] || {
        installationId: crypto.randomUUID(),
        installationToken: crypto.randomUUID() + crypto.randomUUID(),
        firstOpenedAt: now(), platforms: [], recentPlatforms: []
      };
      // Server state recorded by another license service (the test Worker before
      // 1.5.11) is unknown here: keep the local identity and choices, and register again.
      const origin = billingHostPermission(apiUrl);
      if (data.apiOrigin !== origin) {
        const { installationId, installationToken, firstOpenedAt, platforms = [], recentPlatforms = [] } = data;
        data = { installationId, installationToken, firstOpenedAt, platforms, recentPlatforms, apiOrigin: origin };
      }
      await storage.set({ [BILLING_STORAGE_KEY]: data });
    })();
    await loading;
  }

  async function initialize() {
    if (!initialization) initialization = (async () => {
      await load();
      return refreshInternal();
    })();
    await initialization;
  }

  async function activate(result) {
    if (typeof result.activationToken !== "string" || result.entitlement?.status !== "active") throw new Error("activation_not_confirmed");
    data.activationToken = result.activationToken;
    data.entitlement = result.entitlement;
    const serverNow = now() + (data.clockOffset || 0);
    data.offlineUntil = Math.min(Number(result.offlineUntil) || serverNow, serverNow + DAY);
    data.lastValidatedAt = now();
    data.activationId = typeof result.activationId === "string" ? result.activationId : null;
    data.activations = activationList(result.activations);
    delete data.remoteDeactivated;
    delete data.purchase;
    unavailable = false;
    await save();
    return view();
  }

  return {
    getAccess: async () => { await load(); return view(); },
    getView: () => serial(async () => {
      await initialize();
      const crossedOfferDeadline = data.price?.amount < data.price?.originalAmount
        && now() + (data.clockOffset || 0) >= data.offerEndsAt
        && lastRequest + (data.clockOffset || 0) < data.offerEndsAt;
      if (now() - lastRequest > REFRESH_INTERVAL || crossedOfferDeadline) return refreshInternal();
      onChange(view());
      return view();
    }),
    refresh: () => serial(async () => { await initialize(); return refreshInternal(); }),
    checkout: () => serial(async () => {
      await initialize();
      if (!data.purchase || ["failed", "canceled"].includes(data.purchase.status)) {
        const quotedAmount = view().price?.amount;
        await loadCatalog();
        await save();
        if (quotedAmount !== data.price.amount) throw new Error("price_changed");
        let purchase;
        try {
          purchase = await call("/api/checkout/session", { planId: "pro", installationId: data.installationId, expectedAmount: data.price.amount });
        } catch (error) {
          if (error.message === "price_changed") { await loadCatalog(); await save(); }
          throw error;
        }
        let url;
        try { url = new URL(purchase.checkoutUrl); } catch { throw new Error("invalid_checkout"); }
        const secureStripe = url.origin === "https://checkout.stripe.com" && !url.username && !url.password && !url.hash;
        const live = secureStripe && url.pathname.includes("cs_live_") && !url.pathname.includes("cs_test_");
        const testSession = secureStripe && url.pathname.includes("cs_test_") && !url.pathname.includes("cs_live_");
        if (stripeMode === "live" && live) { /* accept a live Checkout session */ }
        else if (stripeMode === "test" && testSession) { /* accept a test Checkout session */ }
        else throw new Error(stripeMode === "live" ? "invalid_live_checkout" : stripeMode === "test" ? "invalid_test_checkout" : "billing_unavailable");
        if (!purchase.purchaseId || !purchase.claimToken) throw new Error("invalid_checkout");
        data.purchase = { ...purchase, status: "pending" };
        await save();
      }
      return { checkoutUrl: data.purchase.checkoutUrl };
    }),
    purchaseStatus: () => serial(async () => {
      await initialize();
      if (!data.purchase) return view();
      const purchase = data.purchase;
      const result = await call(`/api/purchases/${encodeURIComponent(purchase.purchaseId)}/status`, undefined, {
        Authorization: `Bearer ${purchase.claimToken}`, "X-Installation-Id": data.installationId
      });
      data.purchase.status = result.status;
      await save();
      if (result.status === "paid" && result.activationReady) {
        return activate(await call("/api/licenses/claim", {
          purchaseId: purchase.purchaseId, claimToken: purchase.claimToken, installationId: data.installationId, client
        }));
      }
      return view();
    }),
    redeem: licenseKey => serial(async () => {
      await initialize();
      if (typeof licenseKey !== "string" || !licenseKey.trim() || licenseKey.length > 256) throw new Error("invalid_license");
      return activate(await call("/api/licenses/redeem", { licenseKey: licenseKey.trim(), installationId: data.installationId, client }));
    }),
    recover: email => serial(async () => {
      await initialize();
      if (typeof email !== "string" || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("invalid_email");
      await call("/api/licenses/recover", { email });
      return { accepted: true };
    }),
    // Frees one slot of a full license before this browser activates. The license key
    // (redeem) or this browser's paid purchase (claim) proves the license.
    release: ({ activationId, licenseKey } = {}) => serial(async () => {
      await initialize();
      if (typeof activationId !== "string" || !activationId) throw new Error("invalid_request");
      const proof = typeof licenseKey === "string" && licenseKey.trim()
        ? { licenseKey: licenseKey.trim() }
        : data.purchase ? { purchaseId: data.purchase.purchaseId, claimToken: data.purchase.claimToken } : null;
      if (!proof) throw new Error("invalid_license");
      const result = await call("/api/licenses/release", { ...proof, installationId: data.installationId, activationId });
      if (!Array.isArray(result.activations)) throw new Error("release_not_confirmed");
      return view();
    }),
    deactivate: activationId => serial(async () => {
      await initialize();
      if (data.activationToken && typeof activationId === "string" && activationId !== data.activationId) {
        const result = await call("/api/licenses/deactivate", { activationToken: data.activationToken, activationId });
        if (!Array.isArray(result.activations)) throw new Error("deactivation_not_confirmed");
        data.activations = activationList(result.activations);
        await save();
        return view();
      }
      if (data.activationToken) {
        const result = await call("/api/licenses/deactivate", { activationToken: data.activationToken });
        if (result.deactivated !== true && result.valid !== false) throw new Error("deactivation_not_confirmed");
      }
      clearActivation();
      await save();
      return view();
    }),
    selectPlatforms: platforms => serial(async () => {
      await initialize();
      if (!Array.isArray(platforms) || new Set(platforms).size !== 2 || platforms.length !== 2 || platforms.some(key => !platformKeys.has(key))) throw new Error("invalid_platforms");
      data.platforms = [...platforms];
      await save();
      return view();
    }),
    rememberPlatform: key => serial(async () => {
      await initialize();
      if (platformKeys.has(key)) {
        data.recentPlatforms = [key, ...(data.recentPlatforms || []).filter(value => value !== key)].slice(0, 2);
        await save();
      }
      return view();
    })
  };
}
