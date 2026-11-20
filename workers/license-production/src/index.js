import { randomToken, hash, equal, seal, unseal, verifyWebhook } from "./crypto.js";
import { ApiError, liveStripeConfigured, stripe } from "./stripe.js";

const DAY = 86400000;
const ACTIVATION_LIMIT = 3;
const PLAN = "pro";
const VERSION = "1.0.0";
const RETURN_ORIGIN = "https://polaris-ai.work";
const RETURN_PAGE = "https://polaris-ai.work/v2/checkout-return/";
const PROMO_AMOUNT = 1290;
const REGULAR_AMOUNT = 1999;
const FROM_ADDRESS = "licenses@polaris-ai.work";
const json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const stmt = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
const one = (env, sql, ...args) => stmt(env, sql, ...args).first();

function text(value, max = 256) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new ApiError(400, "invalid_request");
  return value.trim();
}

export function billingReady(env) {
  return Boolean(
    env.DB
    && env.ENVIRONMENT === "production"
    && env.LICENSE_HASH_SECRET?.length >= 32
    && env.LICENSE_DELIVERY_ENCRYPTION_KEY?.length >= 32
    && liveStripeConfigured(env)
    && env.STRIPE_WEBHOOK_SECRET
    && env.STRIPE_PRICE_PRO_PROMO
    && env.STRIPE_PRICE_PRO_DEFAULT
    && env.PUBLIC_APP_URL === RETURN_ORIGIN
    && env.EMAIL_FROM_ADDRESS === FROM_ADDRESS
    && env.EMAIL?.send
  );
}

function configured(env) {
  if (env.ENVIRONMENT !== "production" || !env.DB || !env.LICENSE_HASH_SECRET || env.LICENSE_HASH_SECRET.length < 32 || !env.LICENSE_DELIVERY_ENCRYPTION_KEY || env.LICENSE_DELIVERY_ENCRYPTION_KEY.length < 32) {
    throw new ApiError(503, "production_environment_not_configured");
  }
}

function returnOrigin(env) {
  let url;
  try { url = new URL(env.PUBLIC_APP_URL); } catch { throw new ApiError(503, "invalid_return_origin"); }
  if (url.origin !== RETURN_ORIGIN || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new ApiError(503, "invalid_return_origin");
  return url;
}

function checkoutReturn(result, purchaseId) {
  const url = new URL(RETURN_PAGE);
  if (url.origin !== RETURN_ORIGIN || url.pathname !== "/v2/checkout-return/" || url.username || url.password || url.search || url.hash) {
    throw new ApiError(503, "invalid_return_origin");
  }
  if (result !== "success" && result !== "cancel") throw new ApiError(503, "invalid_return_origin");
  url.searchParams.set("result", result);
  if (purchaseId) url.searchParams.set("purchase", purchaseId);
  return url.href;
}

function originAllowed(origin, env) {
  if (!origin) return true;
  if (origin.startsWith("http://") || origin.includes("localhost") || origin.includes("127.0.0.1")) return false;
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (allowed.includes(origin)) return true;
  return /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
}

const installationHash = (env, id) => hash(env.LICENSE_HASH_SECRET, `installation:${text(id)}`);
const webPurchaseHash = (env, id) => hash(env.LICENSE_HASH_SECRET, `web-purchase:${id}`);
const bearer = (req) => (req.headers.get("authorization") || "").replace(/^Bearer /, "");

async function readText(req, limit) {
  if (Number(req.headers.get("Content-Length")) > limit) throw new ApiError(413, "request_too_large");
  if (!req.body) return "";
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let raw = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new ApiError(413, "request_too_large"); }
      raw += decoder.decode(value, { stream: true });
    }
    return raw + decoder.decode();
  } finally { reader.releaseLock(); }
}

async function body(req) {
  const raw = await readText(req, 16384);
  try { return JSON.parse(raw); } catch { throw new ApiError(400, "invalid_json"); }
}

async function installation(env, id, token) {
  const idHash = await installationHash(env, id);
  const row = await one(env, "SELECT * FROM polaris_billing_installations WHERE id_hash=?", idHash);
  if (!row || !equal(row.secret_hash, await hash(env.LICENSE_HASH_SECRET, `installation-secret:${text(token)}`))) throw new ApiError(401, "invalid_installation");
  return row;
}

function entitlement(status = "active") { return { plan: PLAN, status, expiresAt: null }; }

async function rateLimit(env, req, path) {
  const bucket = await hash(env.LICENSE_HASH_SECRET, `rate:${req.headers.get("CF-Connecting-IP") || "local"}:${path}:${Math.floor(Date.now() / 60000)}`);
  const row = await stmt(env, "INSERT INTO polaris_billing_rate_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count", bucket, Date.now() + 120000).first();
  if (row.count > 30) throw new ApiError(429, "rate_limited");
}

const limitHit = (error) => String(error?.message || error).includes("activation_limit_reached");

function clientInfo(value) {
  const clean = (item) => typeof item === "string" && /^[\p{L}\p{N} ._-]{1,32}$/u.test(item.trim()) ? item.trim() : null;
  return { browser: clean(value?.browser), os: clean(value?.os) };
}

async function activationList(env, licenseId) {
  const rows = await stmt(env, "SELECT id,browser,os,created_at,last_validated_at FROM polaris_billing_activations WHERE license_id=? AND status='active' ORDER BY created_at", licenseId).all();
  return rows.results.map((row) => ({ id: row.id, browser: row.browser || null, os: row.os || null, activatedAt: row.created_at, lastSeenAt: row.last_validated_at || null }));
}

async function limitReached(env, licenseId) {
  return json({ error: "activation_limit_reached", limit: ACTIVATION_LIMIT, activations: await activationList(env, licenseId) }, 409);
}

async function issueActivation(env, license, install, client = {}) {
  const now = Date.now();
  const find = () => one(env, "SELECT * FROM polaris_billing_activations WHERE license_id=? AND installation_hash=?", license.id, install.id_hash);
  let activation = await find();
  // An installation that is already active reuses its slot, even when the license is full.
  // New rows and reactivated rows pass the database limit triggers.
  if (!activation) {
    try {
      await stmt(env, "INSERT INTO polaris_billing_activations(id,license_id,installation_hash,browser,os,created_at) VALUES(?,?,?,?,?,?)", crypto.randomUUID(), license.id, install.id_hash, client.browser || null, client.os || null, now).run();
    } catch (error) {
      if (limitHit(error)) return limitReached(env, license.id);
      if (!await find()) throw error;
    }
    activation = await find();
  }
  const token = await hash(env.LICENSE_HASH_SECRET, `activation:${activation.id}:${activation.generation}`);
  let result;
  try {
    result = await stmt(env, "UPDATE polaris_billing_activations SET credential_hash=?,created_at=CASE WHEN status='active' THEN created_at ELSE ? END,status='active',last_validated_at=?,browser=coalesce(?,browser),os=coalesce(?,os) WHERE id=? AND generation=?",
      await hash(env.LICENSE_HASH_SECRET, `credential:${token}`), now, now, client.browser || null, client.os || null, activation.id, activation.generation).run();
  } catch (error) {
    if (limitHit(error)) return limitReached(env, license.id);
    throw error;
  }
  if (!result.meta.changes) throw new ApiError(409, "activation_conflict");
  return json({ activationToken: token, activationId: activation.id, entitlement: entitlement(), validatedAt: now, offlineUntil: now + DAY, activations: await activationList(env, license.id) });
}

async function releaseActivation(env, licenseId, activationId) {
  // The released row keeps its credential hash so its installation learns why it lost Pro.
  // The generation bump means that credential can never be renewed.
  const result = await stmt(env, "UPDATE polaris_billing_activations SET status='revoked',generation=generation+1 WHERE id=? AND license_id=? AND status='active'", text(activationId), licenseId).run();
  return json({ released: result.meta.changes > 0, activations: await activationList(env, licenseId) });
}

async function purchaseOwner(env, req, id, claimToken, installationId) {
  const purchase = await one(env, "SELECT * FROM polaris_billing_purchase_intents WHERE id=?", id);
  if (!purchase || purchase.claim_expires_at < Date.now() || !equal(purchase.claim_hash, await hash(env.LICENSE_HASH_SECRET, `claim:${text(claimToken)}`))) throw new ApiError(401, "invalid_claim");
  const install = await installation(env, installationId, req.headers.get("X-Installation-Token"));
  if (install.id_hash !== purchase.installation_hash) throw new ApiError(401, "invalid_claim");
  return { purchase, install };
}

async function webhook(env, req) {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new ApiError(503, "webhook_not_configured");
  const raw = await readText(req, 262144);
  if (!await verifyWebhook(raw, req.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET)) throw new ApiError(400, "invalid_signature");
  let event;
  try { event = JSON.parse(raw); } catch { throw new ApiError(400, "invalid_json"); }
  if (event.livemode !== true) throw new ApiError(400, "test_mode_rejected");
  if (await one(env, "SELECT id FROM polaris_billing_stripe_events WHERE id=?", event.id)) return json({ received: true });
  const relevant = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired", "charge.refunded", "charge.dispute.created", "payment_intent.payment_failed"];
  if (!relevant.includes(event.type)) return json({ received: true });
  const object = event.data?.object;
  let purchase;
  if (event.type.startsWith("checkout.session.")) purchase = await one(env, "SELECT * FROM polaris_billing_purchase_intents WHERE session_id=?", object.id);
  else purchase = await one(env, "SELECT * FROM polaris_billing_purchase_intents WHERE payment_intent_id=?", event.type.startsWith("payment_intent.") ? object.id : object.payment_intent);
  if (!purchase && event.type.startsWith("checkout.session.") && object.metadata?.purchaseId) throw new ApiError(503, "purchase_not_ready");
  if (!purchase) return json({ received: true });
  const session = await stripe(env, `checkout/sessions/${encodeURIComponent(purchase.session_id)}`);
  if (session.metadata?.purchaseId !== purchase.id || session.mode !== "payment" || !session.id?.startsWith("cs_live_")) throw new ApiError(400, "purchase_mismatch");
  let status = "pending";
  let intent;
  if (session.payment_intent) intent = await stripe(env, `payment_intents/${encodeURIComponent(session.payment_intent)}?expand[]=latest_charge`);
  const refunded = intent?.latest_charge?.refunded || intent?.latest_charge?.disputed || Number(intent?.latest_charge?.amount_refunded) > 0;
  if (refunded) status = "revoked";
  else if (session.payment_status === "paid" && intent?.status === "succeeded") status = "paid";
  else if (session.status === "expired") status = "canceled";
  else if (event.type === "checkout.session.async_payment_failed" || event.type === "payment_intent.payment_failed") status = "failed";
  const actions = [stmt(env, "UPDATE polaris_billing_purchase_intents SET status=CASE WHEN status='revoked' THEN 'revoked' ELSE ? END,payment_intent_id=? WHERE id=?", status, session.payment_intent || null, purchase.id)];
  if (status === "paid") {
    if (session.amount_total !== purchase.amount || session.currency !== "usd") throw new ApiError(400, "amount_mismatch");
    const existing = await one(env, "SELECT id FROM polaris_billing_licenses WHERE purchase_id=?", purchase.id);
    if (!existing) {
      const email = text(session.customer_details?.email, 320).toLowerCase();
      const key = `POL-${randomToken()}`;
      const id = crypto.randomUUID();
      actions.push(stmt(env, "INSERT INTO polaris_billing_licenses(id,purchase_id,key_hash,delivery_cipher,email_hash,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM polaris_billing_purchase_intents WHERE id=? AND status='paid') ON CONFLICT(purchase_id) DO NOTHING", id, purchase.id, await hash(env.LICENSE_HASH_SECRET, `license:${key}`), await seal(env.LICENSE_DELIVERY_ENCRYPTION_KEY, { email, key }), await hash(env.LICENSE_HASH_SECRET, `email:${email}`), Date.now(), purchase.id));
      actions.push(stmt(env, "INSERT INTO polaris_billing_email_deliveries(id,license_id,next_attempt_at,created_at) SELECT ?,id,?,? FROM polaris_billing_licenses WHERE id=?", crypto.randomUUID(), Date.now(), Date.now(), id));
    }
  } else if (status === "revoked") actions.push(stmt(env, "UPDATE polaris_billing_licenses SET status='revoked' WHERE purchase_id=?", purchase.id));
  actions.push(stmt(env, "INSERT INTO polaris_billing_stripe_events(id,type,processed_at) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING", event.id, event.type, Date.now()));
  await env.DB.batch(actions);
  return json({ received: true });
}

// Operator-issued license (beta payers, support). Requires the ADMIN_TOKEN Worker secret.
// One license per email: a repeat call re-queues delivery of the same key (throttled to once an hour).
async function grantLicense(env, req) {
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32 || !equal(bearer(req), env.ADMIN_TOKEN)) throw new ApiError(401, "unauthorized");
  const data = await body(req);
  const email = text(data.email, 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "invalid_email");
  const emailHash = await hash(env.LICENSE_HASH_SECRET, `email:${email}`);
  const purchaseId = `grant-${emailHash.slice(0, 32)}`;
  const now = Date.now();
  let license = await one(env, "SELECT * FROM polaris_billing_licenses WHERE purchase_id=?", purchaseId);
  const existing = Boolean(license);
  if (!license) {
    const key = `POL-${randomToken()}`;
    const id = crypto.randomUUID();
    await env.DB.batch([
      stmt(env, "INSERT INTO polaris_billing_purchase_intents(id,installation_hash,claim_hash,claim_expires_at,amount,status,created_at) VALUES(?,?,?,0,0,'paid',?) ON CONFLICT(id) DO NOTHING", purchaseId, await webPurchaseHash(env, purchaseId), await hash(env.LICENSE_HASH_SECRET, `claim:${randomToken()}`), now),
      stmt(env, "INSERT INTO polaris_billing_licenses(id,purchase_id,key_hash,delivery_cipher,email_hash,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(purchase_id) DO NOTHING", id, purchaseId, await hash(env.LICENSE_HASH_SECRET, `license:${key}`), await seal(env.LICENSE_DELIVERY_ENCRYPTION_KEY, { email, key }), emailHash, now),
      stmt(env, "INSERT INTO polaris_billing_email_deliveries(id,license_id,next_attempt_at,created_at) SELECT ?,id,?,? FROM polaris_billing_licenses WHERE id=?", crypto.randomUUID(), now, now, id)
    ]);
    license = await one(env, "SELECT * FROM polaris_billing_licenses WHERE purchase_id=?", purchaseId);
  } else if (license.status === "active") {
    await stmt(env, "INSERT INTO polaris_billing_email_deliveries(id,license_id,next_attempt_at,created_at) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM polaris_billing_email_deliveries WHERE license_id=? AND created_at>?)", crypto.randomUUID(), license.id, now, now, license.id, now - 3600000).run();
  }
  if (license.status !== "active") throw new ApiError(409, "license_not_active");
  await deliverPending(env);
  const delivery = await one(env, "SELECT status FROM polaris_billing_email_deliveries WHERE license_id=? ORDER BY created_at DESC LIMIT 1", license.id);
  return json({ licenseId: license.id, existing, delivery: delivery?.status || "none" });
}

async function route(req, env) {
  const url = new URL(req.url);
  const path = url.pathname;
  if (path === "/health" && req.method === "GET") return json({ ok: true, env: "production", version: VERSION, billingReady: billingReady(env) });
  const routes = new Set(["/api/trial/start", "/api/plans", "/api/catalog", "/api/checkout/session", "/api/checkout/web-session", "/api/web-purchases/claim", "/api/stripe/webhook", "/api/licenses/claim", "/api/licenses/redeem", "/api/licenses/validate", "/api/licenses/recover", "/api/licenses/deactivate", "/api/licenses/release", "/api/admin/grant-license"]);
  if (!routes.has(path) && !/^\/api\/purchases\/[^/]+\/status$/.test(path)) throw new ApiError(404, "not_found");
  configured(env);
  if (path === "/api/stripe/webhook" && req.method === "POST") return webhook(env, req);
  if (path === "/api/admin/grant-license" && req.method === "POST") return grantLicense(env, req);
  await rateLimit(env, req, path.replace(/^\/api\/purchases\/[^/]+\/status$/, "/api/purchases/:id/status"));
  if (path === "/api/trial/start" && req.method === "POST") {
    const data = await body(req);
    const idHash = await installationHash(env, data.installationId);
    const secret = text(data.installationToken);
    if (secret.length < 32) throw new ApiError(400, "invalid_installation_token");
    await stmt(env, "INSERT INTO polaris_billing_installations(id_hash,secret_hash,trial_ends_at,created_at) VALUES(?,?,?,?) ON CONFLICT(id_hash) DO NOTHING", idHash, await hash(env.LICENSE_HASH_SECRET, `installation-secret:${secret}`), Date.now() + 7 * DAY, Date.now()).run();
    const row = await installation(env, data.installationId, secret);
    return json({ trialEndsAt: row.trial_ends_at, offerEndsAt: row.trial_ends_at, serverTime: Date.now() });
  }
  if (path === "/api/plans" && req.method === "GET") {
    const row = await installation(env, url.searchParams.get("installationId"), req.headers.get("X-Installation-Token"));
    // USD 19.99 is the regular lifetime price. USD 12.90 applies only while this
    // installation's server-recorded 7-day trial is open. The client cannot select it.
    return json({ serverTime: Date.now(), trialEndsAt: row.trial_ends_at, offerEndsAt: row.trial_ends_at, plans: [{ id: PLAN, currency: "usd", amount: row.trial_ends_at > Date.now() ? PROMO_AMOUNT : REGULAR_AMOUNT, originalAmount: REGULAR_AMOUNT, billing: "one_time", maxActivations: ACTIVATION_LIMIT }] });
  }
  if (path === "/api/catalog" && req.method === "GET") {
    return json({ serverTime: Date.now(), plans: [{ id: PLAN, currency: "usd", amount: PROMO_AMOUNT, originalAmount: REGULAR_AMOUNT, billing: "one_time", maxActivations: ACTIVATION_LIMIT }] });
  }
  if (path === "/api/checkout/session" && req.method === "POST") {
    const data = await body(req);
    if (data.planId !== PLAN) throw new ApiError(400, "invalid_plan");
    const row = await installation(env, data.installationId, req.headers.get("X-Installation-Token"));
    // Same server trial window as /api/plans. A client flag cannot choose USD 12.90.
    const promo = row.trial_ends_at > Date.now();
    const priceId = promo ? env.STRIPE_PRICE_PRO_PROMO : env.STRIPE_PRICE_PRO_DEFAULT;
    if (!liveStripeConfigured(env)) throw new ApiError(503, "live_stripe_not_configured");
    if (!priceId) throw new ApiError(503, "prices_not_configured");
    const amount = promo ? PROMO_AMOUNT : REGULAR_AMOUNT;
    if (data.expectedAmount !== undefined && data.expectedAmount !== amount) throw new ApiError(409, "price_changed");
    const price = await stripe(env, `prices/${encodeURIComponent(priceId)}`);
    if (price.active !== true || price.currency !== "usd" || price.unit_amount !== amount || price.type !== "one_time" || price.livemode !== true) throw new ApiError(503, "price_configuration_mismatch");
    returnOrigin(env);
    const id = crypto.randomUUID();
    const claim = randomToken();
    await stmt(env, "INSERT INTO polaris_billing_purchase_intents(id,installation_hash,claim_hash,claim_expires_at,amount,created_at) VALUES(?,?,?,?,?,?)", id, row.id_hash, await hash(env.LICENSE_HASH_SECRET, `claim:${claim}`), Date.now() + DAY, amount, Date.now()).run();
    const session = await stripe(env, "checkout/sessions", { method: "POST", idempotencyKey: id, body: {
      ui_mode: "hosted_page",
      mode: "payment",
      billing_address_collection: "auto",
      "phone_number_collection[enabled]": "false",
      "automatic_tax[enabled]": "false",
      allow_promotion_codes: "false",
      submit_type: "auto",
      integration_identifier: "hosted_web_0001",
      origin_context: "web",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      "metadata[purchaseId]": id,
      success_url: checkoutReturn("success"),
      cancel_url: checkoutReturn("cancel")
    } });
    if (!session.id?.startsWith("cs_live_") || session.livemode !== true || new URL(session.url).origin !== "https://checkout.stripe.com") throw new ApiError(502, "invalid_live_checkout");
    await stmt(env, "UPDATE polaris_billing_purchase_intents SET session_id=? WHERE id=?", session.id, id).run();
    return json({ checkoutUrl: session.url, purchaseId: id, claimToken: claim });
  }
  if (path === "/api/checkout/web-session" && req.method === "POST") {
    if (req.headers.get("Origin") !== RETURN_ORIGIN) throw new ApiError(403, "origin_not_allowed");
    const data = await body(req);
    if (data.planId !== PLAN) throw new ApiError(400, "invalid_plan");
    if (data.priceId !== undefined || data.amount !== undefined || data.returnUrl !== undefined || data.successUrl !== undefined || data.cancelUrl !== undefined || data.trial !== undefined) {
      throw new ApiError(400, "invalid_request");
    }
    let amount = PROMO_AMOUNT;
    let priceId = env.STRIPE_PRICE_PRO_PROMO;
    if (data.installationId !== undefined || data.discount === true) {
      if (typeof data.installationId !== "string") throw new ApiError(401, "invalid_installation");
      const row = await installation(env, data.installationId, req.headers.get("X-Installation-Token"));
      if (row.trial_ends_at <= Date.now()) {
        amount = REGULAR_AMOUNT;
        priceId = env.STRIPE_PRICE_PRO_DEFAULT;
      }
    }
    if (!liveStripeConfigured(env)) throw new ApiError(503, "live_stripe_not_configured");
    if (!priceId) throw new ApiError(503, "prices_not_configured");
    if (data.expectedAmount !== undefined && data.expectedAmount !== amount) {
      return json({ error: "price_changed", amount, currency: "usd", originalAmount: REGULAR_AMOUNT }, 409);
    }
    const price = await stripe(env, `prices/${encodeURIComponent(priceId)}`);
    if (price.active !== true || price.currency !== "usd" || price.unit_amount !== amount || price.type !== "one_time" || price.livemode !== true) throw new ApiError(503, "price_configuration_mismatch");
    returnOrigin(env);
    const id = crypto.randomUUID();
    const claim = randomToken();
    await stmt(env, "INSERT INTO polaris_billing_purchase_intents(id,installation_hash,claim_hash,claim_expires_at,amount,created_at) VALUES(?,?,?,?,?,?)", id, await webPurchaseHash(env, id), await hash(env.LICENSE_HASH_SECRET, `claim:${claim}`), Date.now() + DAY, amount, Date.now()).run();
    const session = await stripe(env, "checkout/sessions", { method: "POST", idempotencyKey: id, body: {
      ui_mode: "hosted_page",
      mode: "payment",
      billing_address_collection: "auto",
      "phone_number_collection[enabled]": "false",
      "automatic_tax[enabled]": "false",
      allow_promotion_codes: "false",
      submit_type: "auto",
      integration_identifier: "hosted_web_0001",
      origin_context: "web",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      "metadata[purchaseId]": id,
      success_url: checkoutReturn("success", id),
      cancel_url: checkoutReturn("cancel", id)
    } });
    if (!session.id?.startsWith("cs_live_") || session.livemode !== true || new URL(session.url).origin !== "https://checkout.stripe.com") throw new ApiError(502, "invalid_live_checkout");
    await stmt(env, "UPDATE polaris_billing_purchase_intents SET session_id=? WHERE id=?", session.id, id).run();
    return json({ checkoutUrl: session.url, purchaseId: id, claimToken: claim, amount, currency: "usd", originalAmount: REGULAR_AMOUNT });
  }
  if (path === "/api/web-purchases/claim" && req.method === "POST") {
    const data = await body(req);
    const purchase = await one(env, "SELECT * FROM polaris_billing_purchase_intents WHERE id=?", text(data.purchaseId));
    if (!purchase || purchase.claim_expires_at < Date.now() || purchase.installation_hash !== await webPurchaseHash(env, purchase.id) || !equal(purchase.claim_hash, await hash(env.LICENSE_HASH_SECRET, `claim:${text(data.claimToken)}`))) throw new ApiError(401, "invalid_claim");
    const license = await one(env, "SELECT * FROM polaris_billing_licenses WHERE purchase_id=?", purchase.id);
    if (purchase.status === "paid" && license?.status === "active") {
      const payload = await unseal(env.LICENSE_DELIVERY_ENCRYPTION_KEY, license.delivery_cipher);
      return json({ status: "paid", licenseKey: payload.key });
    }
    return json({ status: purchase.status === "revoked" ? "failed" : purchase.status });
  }
  const match = path.match(/^\/api\/purchases\/([^/]+)\/status$/);
  if (match && req.method === "GET") {
    const { purchase } = await purchaseOwner(env, req, match[1], bearer(req), req.headers.get("X-Installation-Id"));
    const license = await one(env, "SELECT status FROM polaris_billing_licenses WHERE purchase_id=?", purchase.id);
    return json({ status: purchase.status === "revoked" ? "failed" : purchase.status, activationReady: purchase.status === "paid" && license?.status === "active" });
  }
  if (path === "/api/licenses/claim" && req.method === "POST") {
    const data = await body(req);
    const { purchase, install } = await purchaseOwner(env, req, data.purchaseId, data.claimToken, data.installationId);
    const license = await one(env, "SELECT * FROM polaris_billing_licenses WHERE purchase_id=? AND status='active'", purchase.id);
    if (purchase.status !== "paid" || !license) throw new ApiError(409, "activation_not_ready");
    return issueActivation(env, license, install, clientInfo(data.client));
  }
  if (path === "/api/licenses/redeem" && req.method === "POST") {
    const data = await body(req);
    const install = await installation(env, data.installationId, req.headers.get("X-Installation-Token"));
    const license = await one(env, "SELECT * FROM polaris_billing_licenses WHERE key_hash=? AND status='active'", await hash(env.LICENSE_HASH_SECRET, `license:${text(data.licenseKey)}`));
    if (!license) throw new ApiError(400, "invalid_license");
    return issueActivation(env, license, install, clientInfo(data.client));
  }
  if (path === "/api/licenses/release" && req.method === "POST") {
    // A full license frees a slot before this installation activates. The caller proves
    // the license with its key, or with the purchase it made in this installation.
    const data = await body(req);
    let license;
    if (data.licenseKey !== undefined) {
      await installation(env, data.installationId, req.headers.get("X-Installation-Token"));
      license = await one(env, "SELECT * FROM polaris_billing_licenses WHERE key_hash=? AND status='active'", await hash(env.LICENSE_HASH_SECRET, `license:${text(data.licenseKey)}`));
    } else {
      const { purchase } = await purchaseOwner(env, req, data.purchaseId, data.claimToken, data.installationId);
      license = await one(env, "SELECT * FROM polaris_billing_licenses WHERE purchase_id=? AND status='active'", purchase.id);
    }
    if (!license) throw new ApiError(400, "invalid_license");
    return releaseActivation(env, license.id, data.activationId);
  }
  if (["/api/licenses/validate", "/api/licenses/deactivate"].includes(path) && req.method === "POST") {
    const data = await body(req);
    const activation = await one(env, "SELECT a.*,l.status AS license_status FROM polaris_billing_activations a JOIN polaris_billing_licenses l ON l.id=a.license_id WHERE a.credential_hash=?", await hash(env.LICENSE_HASH_SECRET, `credential:${text(data.activationToken)}`));
    if (!activation || activation.status !== "active" || activation.license_status !== "active") {
      const released = activation && activation.status !== "active" && activation.license_status === "active";
      return json({ valid: false, entitlement: entitlement("revoked"), ...(released ? { reason: "deactivated" } : {}) });
    }
    if (path.endsWith("deactivate")) {
      if (data.activationId !== undefined && data.activationId !== activation.id) return releaseActivation(env, activation.license_id, data.activationId);
      await stmt(env, "UPDATE polaris_billing_activations SET status='revoked',credential_hash=NULL,generation=generation+1 WHERE id=? AND credential_hash=?", activation.id, activation.credential_hash).run();
      return json({ deactivated: true });
    }
    await stmt(env, "UPDATE polaris_billing_activations SET last_validated_at=? WHERE id=?", Date.now(), activation.id).run();
    return json({ valid: true, entitlement: entitlement(), validatedAt: Date.now(), offlineUntil: Date.now() + DAY, activationId: activation.id, activations: await activationList(env, activation.license_id) });
  }
  if (path === "/api/licenses/recover" && req.method === "POST") {
    const data = await body(req);
    const email = text(data.email, 320).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "invalid_email");
    const emailHash = await hash(env.LICENSE_HASH_SECRET, `email:${email}`);
    await stmt(env, "INSERT INTO polaris_billing_email_deliveries(id,license_id,next_attempt_at,created_at) SELECT lower(hex(randomblob(16))),l.id,?,? FROM polaris_billing_licenses l WHERE l.email_hash=? AND l.status='active' AND NOT EXISTS(SELECT 1 FROM polaris_billing_email_deliveries e WHERE e.license_id=l.id AND e.created_at>?)", Date.now(), Date.now(), emailHash, Date.now() - 3600000).run();
    return json({ message: "If an eligible purchase exists, recovery instructions will be sent." });
  }
  throw new ApiError(404, "not_found");
}

const SUPPORT_EMAIL = "jefferyho.build@gmail.com";
const ISSUES_URL = "https://github.com/Jeffery-Ho/Polaris-AI-Chat-Navigator/issues";
const WEBSITE_URL = "https://polaris-ai.work/";

// Bilingual (English, then Simplified Chinese) because buyers come from both store listings.
const EMAIL_SECTIONS = [
  {
    heading: "Thanks for getting Polaris Pro.",
    license: "Your license",
    activate: "Activate it",
    steps: ["Open the Polaris side panel and go to Settings → Pro and license.", "Choose “Already have a license?” and paste the license above."],
    limit: "One license activates up to 3 browsers at a time, and you can share it with friends. Each browser profile counts separately, so Dia’s Work and Default count as 2. When all 3 are in use, Polaris lists them so you can deactivate one.",
    about: "What you get",
    aboutText: "Polaris turns long AI chats into a table of contents and an outline you can jump through. Pro unlocks every supported platform and long conversation mode, which keeps earlier messages in the table of contents. Conversations stay on your device and are never uploaded.",
    help: "Questions or feedback",
    helpText: `Email ${SUPPORT_EMAIL} or open an issue at ${ISSUES_URL}. Include your checkout email; there is no need to send the full license.`,
    keep: "Keep this email. If you lose it, choose “Recover your license” in Polaris with your checkout email."
  },
  {
    heading: "感谢购买 Polaris Pro。",
    license: "你的许可证",
    activate: "如何激活",
    steps: ["打开 Polaris 侧边栏，进入「设置 → Pro 与许可」。", "选择「已有许可证？」，粘贴上方的许可证。"],
    limit: "每份许可最多同时激活 3 个浏览器，可与朋友分享。同一浏览器的每个 Profile 单独计算，例如 Dia 的 Work 和 Default 算 2 个。名额用完时，Polaris 会列出已激活的浏览器，选一个停用即可。",
    about: "Pro 包含什么",
    aboutText: "Polaris 把长篇 AI 对话整理成可跳转的目录和大纲。Pro 解锁全部支持的平台与长对话模式，目录会保留更早的消息。对话只留在本机，不会上传。",
    help: "问题与反馈",
    helpText: `发送邮件至 ${SUPPORT_EMAIL}，或在 ${ISSUES_URL} 提交 issue。请附上购买邮箱，无需发送完整许可证。`,
    keep: "请保留这封邮件。如果遗失，可在 Polaris 中选择「找回许可证」，用购买邮箱找回。"
  }
];

export function licenseEmail(key) {
  const text = EMAIL_SECTIONS.map((copy) => [
    copy.heading,
    `${copy.license}: ${key}`,
    `${copy.activate}\n${copy.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}\n${copy.limit}`,
    `${copy.about}\n${copy.aboutText}`,
    `${copy.help}\n${copy.helpText}`,
    copy.keep
  ].join("\n\n")).join("\n\n— — —\n\n") + `\n\n${WEBSITE_URL}\n`;
  const escape = (value) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
  const link = (value) => escape(value)
    .replace(escape(SUPPORT_EMAIL), `<a href="mailto:${SUPPORT_EMAIL}" style="color:#a04c2f">${SUPPORT_EMAIL}</a>`)
    .replace(escape(ISSUES_URL), `<a href="${ISSUES_URL}" style="color:#a04c2f">GitHub</a>`);
  const h2 = (value) => `<h2 style="margin:24px 0 8px;font-size:15px;color:#2a2724">${escape(value)}</h2>`;
  const p = (value, extra = "") => `<p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#57534c${extra}">${value}</p>`;
  const section = (copy) => `
    <h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:22px;color:#2a2724">${escape(copy.heading)}</h1>
    ${h2(copy.license)}
    <p style="margin:0 0 12px;padding:12px 14px;border-radius:10px;background:#f4f3f0;font-family:ui-monospace,Menlo,monospace;font-size:13px;word-break:break-all;color:#2a2724">${escape(key)}</p>
    ${h2(copy.activate)}
    <ol style="margin:0 0 12px;padding-left:20px;font-size:14px;line-height:1.7;color:#57534c">${copy.steps.map((step) => `<li>${escape(step)}</li>`).join("")}</ol>
    ${p(escape(copy.limit))}
    ${h2(copy.about)}
    ${p(escape(copy.aboutText))}
    ${h2(copy.help)}
    ${p(link(copy.helpText))}
    ${p(escape(copy.keep), ";font-size:13px;color:#77726a")}`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#fafaf8;font-family:-apple-system,'Segoe UI','PingFang SC',sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:28px;border:1px solid #e0ddd7;border-radius:16px;background:#ffffff">
    ${EMAIL_SECTIONS.map(section).join('<hr style="margin:28px 0;border:0;border-top:1px solid #e0ddd7">')}
    <p style="margin:28px 0 0;font-size:13px;color:#77726a"><a href="${WEBSITE_URL}" style="color:#a04c2f">polaris-ai.work</a></p>
  </div></body></html>`;
  return { text, html };
}

async function deliverPending(env) {
  if (!env.EMAIL?.send || env.EMAIL_FROM_ADDRESS !== FROM_ADDRESS) return;
  const jobs = await stmt(env, "SELECT e.*,l.delivery_cipher,l.status AS license_status FROM polaris_billing_email_deliveries e JOIN polaris_billing_licenses l ON l.id=e.license_id WHERE e.status='pending' AND e.next_attempt_at<=? LIMIT 20", Date.now()).all();
  for (const job of jobs.results) {
    if (job.license_status !== "active") {
      await stmt(env, "UPDATE polaris_billing_email_deliveries SET status='canceled' WHERE id=?", job.id).run();
      continue;
    }
    try {
      const payload = await unseal(env.LICENSE_DELIVERY_ENCRYPTION_KEY, job.delivery_cipher);
      await env.EMAIL.send({
        from: { email: FROM_ADDRESS, name: "Polaris" },
        to: payload.email,
        subject: "Your Polaris Pro license",
        ...licenseEmail(payload.key)
      });
      await stmt(env, "UPDATE polaris_billing_email_deliveries SET status='sent',attempt_count=attempt_count+1 WHERE id=?", job.id).run();
    } catch {
      await stmt(env, "UPDATE polaris_billing_email_deliveries SET attempt_count=attempt_count+1,next_attempt_at=? WHERE id=?", Date.now() + Math.min(DAY, 60000 * 2 ** Math.min(job.attempt_count, 10)), job.id).run();
    }
  }
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin");
    if (!originAllowed(origin, env)) return json({ error: "origin_not_allowed" }, 403);
    let response;
    try { response = req.method === "OPTIONS" ? new Response(null, { status: 204 }) : await route(req, env); }
    catch (error) { response = json({ error: error instanceof ApiError ? error.code : "service_unavailable" }, error instanceof ApiError ? error.status : 503); }
    if (origin) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Vary", "Origin");
      response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Installation-Token, X-Installation-Id");
    }
    return response;
  },
  async scheduled(_controller, env) {
    configured(env);
    await stmt(env, "DELETE FROM polaris_billing_rate_limits WHERE expires_at<?", Date.now()).run();
    await deliverPending(env);
  }
};
