import { BILLING_API_URL } from "./billing-config.js";
import { SUPPORTED_PLATFORMS } from "./supported-platforms.js";

export const BILLING_STORAGE_KEY = "polaris-billing-v1";
const DAY = 86400000;
const REFRESH_INTERVAL = 600000;
const platformKeys = new Set(SUPPORTED_PLATFORMS.map(({ key }) => key));

export function createBillingService({ storage, fetch: request = globalThis.fetch, now = Date.now, apiUrl = BILLING_API_URL, onChange = () => {} }) {
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

  async function call(path, body, headers = {}) {
    const response = await request(`${apiUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "X-Installation-Token": data.installationToken, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
      cache: "no-store"
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      const error = new Error(result?.error === "price_changed" ? "price_changed" : "billing_unavailable");
      error.status = response.status;
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
      hasPurchase: Boolean(data?.purchase)
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
    } else {
      delete data.activationToken;
      delete data.offlineUntil;
      data.entitlement = null;
    }
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
        const url = new URL(purchase.checkoutUrl);
        if (url.origin !== "https://checkout.stripe.com" || !url.pathname.includes("cs_test_")) throw new Error("invalid_test_checkout");
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
          purchaseId: purchase.purchaseId, claimToken: purchase.claimToken, installationId: data.installationId
        }));
      }
      return view();
    }),
    redeem: licenseKey => serial(async () => {
      await initialize();
      if (typeof licenseKey !== "string" || !licenseKey.trim() || licenseKey.length > 256) throw new Error("invalid_license");
      return activate(await call("/api/licenses/redeem", { licenseKey: licenseKey.trim(), installationId: data.installationId }));
    }),
    recover: email => serial(async () => {
      await initialize();
      if (typeof email !== "string" || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("invalid_email");
      await call("/api/licenses/recover", { email });
      return { accepted: true };
    }),
    deactivate: () => serial(async () => {
      await initialize();
      if (data.activationToken) {
        const result = await call("/api/licenses/deactivate", { activationToken: data.activationToken });
        if (result.deactivated !== true && result.valid !== false) throw new Error("deactivation_not_confirmed");
      }
      delete data.activationToken; delete data.offlineUntil; data.entitlement = null;
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
