import { randomToken, hash, equal, seal, unseal, verifyWebhook } from "./crypto.js";
import { ApiError, liveStripeConfigured, stripe } from "./stripe.js";

const DAY = 86400000;
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

async function issueActivation(env, license, install) {
  const now = Date.now();
  await stmt(env, "INSERT INTO polaris_billing_activations(id,license_id,installation_hash,created_at) VALUES(?,?,?,?) ON CONFLICT(license_id,installation_hash) DO NOTHING", crypto.randomUUID(), license.id, install.id_hash, now).run();
  const activation = await one(env, "SELECT * FROM polaris_billing_activations WHERE license_id=? AND installation_hash=?", license.id, install.id_hash);
  const token = await hash(env.LICENSE_HASH_SECRET, `activation:${activation.id}:${activation.generation}`);
  await stmt(env, "UPDATE polaris_billing_activations SET credential_hash=?,status='active',last_validated_at=? WHERE id=? AND generation=?", await hash(env.LICENSE_HASH_SECRET, `credential:${token}`), now, activation.id, activation.generation).run();
  return json({ activationToken: token, entitlement: entitlement(), validatedAt: now, offlineUntil: now + DAY });
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

async function route(req, env) {
  const url = new URL(req.url);
  const path = url.pathname;
  if (path === "/health" && req.method === "GET") return json({ ok: true, env: "production", version: VERSION, billingReady: billingReady(env) });
  const routes = new Set(["/api/trial/start", "/api/plans", "/api/catalog", "/api/checkout/session", "/api/checkout/web-session", "/api/web-purchases/claim", "/api/stripe/webhook", "/api/licenses/claim", "/api/licenses/redeem", "/api/licenses/validate", "/api/licenses/recover", "/api/licenses/deactivate"]);
  if (!routes.has(path) && !/^\/api\/purchases\/[^/]+\/status$/.test(path)) throw new ApiError(404, "not_found");
  configured(env);
  if (path === "/api/stripe/webhook" && req.method === "POST") return webhook(env, req);
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
    return json({ serverTime: Date.now(), trialEndsAt: row.trial_ends_at, offerEndsAt: row.trial_ends_at, plans: [{ id: PLAN, currency: "usd", amount: row.trial_ends_at > Date.now() ? PROMO_AMOUNT : REGULAR_AMOUNT, originalAmount: REGULAR_AMOUNT, billing: "one_time", maxActivations: null }] });
  }
  if (path === "/api/catalog" && req.method === "GET") {
    // A website buyer has no installation trial. The public price is the regular lifetime price.
    return json({ serverTime: Date.now(), plans: [{ id: PLAN, currency: "usd", amount: REGULAR_AMOUNT, originalAmount: REGULAR_AMOUNT, billing: "one_time", maxActivations: null }] });
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
    let amount = REGULAR_AMOUNT;
    let priceId = env.STRIPE_PRICE_PRO_DEFAULT;
    if (data.installationId !== undefined || data.discount === true) {
      if (typeof data.installationId !== "string") throw new ApiError(401, "invalid_installation");
      const row = await installation(env, data.installationId, req.headers.get("X-Installation-Token"));
      if (row.trial_ends_at > Date.now()) {
        amount = PROMO_AMOUNT;
        priceId = env.STRIPE_PRICE_PRO_PROMO;
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
    return issueActivation(env, license, install);
  }
  if (path === "/api/licenses/redeem" && req.method === "POST") {
    const data = await body(req);
    const install = await installation(env, data.installationId, req.headers.get("X-Installation-Token"));
    const license = await one(env, "SELECT * FROM polaris_billing_licenses WHERE key_hash=? AND status='active'", await hash(env.LICENSE_HASH_SECRET, `license:${text(data.licenseKey)}`));
    if (!license) throw new ApiError(400, "invalid_license");
    return issueActivation(env, license, install);
  }
  if (["/api/licenses/validate", "/api/licenses/deactivate"].includes(path) && req.method === "POST") {
    const data = await body(req);
    const activation = await one(env, "SELECT a.*,l.status AS license_status FROM polaris_billing_activations a JOIN polaris_billing_licenses l ON l.id=a.license_id WHERE a.credential_hash=?", await hash(env.LICENSE_HASH_SECRET, `credential:${text(data.activationToken)}`));
    if (!activation || activation.status !== "active" || activation.license_status !== "active") return json({ valid: false, entitlement: entitlement("revoked") });
    if (path.endsWith("deactivate")) {
      await stmt(env, "UPDATE polaris_billing_activations SET status='revoked',credential_hash=NULL,generation=generation+1 WHERE id=? AND credential_hash=?", activation.id, activation.credential_hash).run();
      return json({ deactivated: true });
    }
    await stmt(env, "UPDATE polaris_billing_activations SET last_validated_at=? WHERE id=?", Date.now(), activation.id).run();
    return json({ valid: true, entitlement: entitlement(), validatedAt: Date.now(), offlineUntil: Date.now() + DAY });
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
        text: `Polaris Pro is a one-time lifetime purchase with no device limit.\n\nLicense: ${payload.key}\n\nOpen Polaris settings and choose Redeem license.\n`
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
