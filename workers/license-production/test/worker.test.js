import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker, { billingReady } from "../src/index.js";
import { hash } from "../src/crypto.js";
import { database } from "./d1.js";

const install = { installationId: "installation-a", installationToken: "production-installation-secret-32chars" };

function environment(overrides = {}) {
  return {
    ENVIRONMENT: "production",
    DB: database(),
    LICENSE_HASH_SECRET: "production-hash-secret-only-used-by-tests",
    LICENSE_DELIVERY_ENCRYPTION_KEY: "production-encryption-key-only-used-by-tests",
    STRIPE_SECRET_KEY: "sk_live_fixture",
    STRIPE_WEBHOOK_SECRET: "whsec_fixture",
    STRIPE_PRICE_PRO_PROMO: "price_live_promo",
    STRIPE_PRICE_PRO_DEFAULT: "price_live_default",
    PUBLIC_APP_URL: "https://polaris-ai.work",
    ALLOWED_ORIGINS: "https://polaris-ai.work",
    EMAIL_FROM_ADDRESS: "licenses@polaris-ai.work",
    EMAIL: { async send() { throw new Error("email must not be sent by this test"); } },
    ...overrides
  };
}

async function request(env, path, data, headers = {}) {
  const response = await worker.fetch(new Request(`https://license.invalid${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "X-Installation-Token": install.installationToken, ...headers },
    body: data === undefined ? undefined : JSON.stringify(data)
  }), env);
  return { status: response.status, data: await response.json() };
}

test("production health names the environment and stays unready without live billing", async () => {
  const response = await worker.fetch(new Request("https://license.invalid/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, env: "production", version: "1.0.0", billingReady: false });
  const ready = environment();
  try { assert.equal(billingReady(ready), true); }
  finally { ready.DB.close(); }
});

test("checkout fails closed without live Stripe configuration and does not create an order", async () => {
  const env = environment({ STRIPE_SECRET_KEY: undefined, STRIPE_PRICE_PRO_PROMO: undefined });
  try {
    await request(env, "/api/trial/start", install);
    const response = await request(env, "/api/checkout/session", { planId: "pro", installationId: install.installationId });
    assert.equal(response.status, 503);
    assert.equal(response.data.error, "live_stripe_not_configured");
    assert.equal((await env.DB.prepare("SELECT count(*) AS count FROM polaris_billing_purchase_intents").first()).count, 0);
  } finally { env.DB.close(); }
});

test("catalog is the lifetime welcome price and an empty mail queue sends nothing", async () => {
  const env = environment();
  let sent = 0;
  env.EMAIL = { async send() { sent += 1; } };
  try {
    const plans = await request(env, "/api/plans?installationId=installation-a");
    assert.equal(plans.status, 401);
    await request(env, "/api/trial/start", install);
    const priced = await request(env, "/api/plans?installationId=installation-a");
    assert.equal(priced.data.plans[0].amount, 1290);
    assert.equal(priced.data.plans[0].originalAmount, 1999);
    assert.equal(priced.data.plans[0].billing, "one_time");
    assert.equal(priced.data.plans[0].maxActivations, null);
    await worker.scheduled({}, env);
    assert.equal(sent, 0);
  } finally { env.DB.close(); }
});

test("live checkout, webhook, and claim reject test mode and replay safely", async (t) => {
  const env = environment();
  let paid = false;
  let purchaseId;
  let checkoutBody;
  let sent = 0;
  env.EMAIL = { async send() { sent += 1; } };
  t.mock.method(globalThis, "fetch", async (input, options) => {
    const url = new URL(input);
    if (url.hostname !== "api.stripe.com") throw new Error(`unexpected host ${url.hostname}`);
    let value;
    if (url.pathname === "/v1/prices/price_live_promo") value = { id: "price_live_promo", livemode: true, active: true, currency: "usd", unit_amount: 1290, type: "one_time" };
    else if (url.pathname === "/v1/checkout/sessions") {
      checkoutBody = new URLSearchParams(options.body);
      purchaseId = checkoutBody.get("metadata[purchaseId]");
      value = { id: "cs_live_fixture", livemode: true, url: "https://checkout.stripe.com/c/pay/cs_live_fixture" };
    } else if (url.pathname === "/v1/checkout/sessions/cs_live_fixture") value = { id: "cs_live_fixture", livemode: true, mode: "payment", metadata: { purchaseId }, payment_status: paid ? "paid" : "unpaid", status: paid ? "complete" : "open", payment_intent: "pi_live", amount_total: 1290, currency: "usd", customer_details: { email: "buyer@example.com" } };
    else if (url.pathname === "/v1/payment_intents/pi_live") value = { livemode: true, status: paid ? "succeeded" : "processing", latest_charge: { refunded: false, disputed: false, amount_refunded: 0 } };
    else throw new Error(`unexpected stripe path ${url.pathname}`);
    return Response.json(value);
  });
  async function event(id, livemode = true) {
    const raw = JSON.stringify({ id, type: "checkout.session.completed", livemode, data: { object: { id: "cs_live_fixture", metadata: { purchaseId } } } });
    const ts = Math.floor(Date.now() / 1000);
    return worker.fetch(new Request("https://license.invalid/api/stripe/webhook", {
      method: "POST",
      body: raw,
      headers: { "Stripe-Signature": `t=${ts},v1=${await hash(env.STRIPE_WEBHOOK_SECRET, `${ts}.${raw}`)}` }
    }), env);
  }
  try {
    await request(env, "/api/trial/start", install);
    env.STRIPE_SECRET_KEY = "sk_test_fixture";
    assert.equal((await request(env, "/api/checkout/session", { planId: "pro", installationId: install.installationId })).data.error, "live_stripe_not_configured");
    env.STRIPE_SECRET_KEY = "sk_live_fixture";
    const checkout = await request(env, "/api/checkout/session", { planId: "pro", installationId: install.installationId, expectedAmount: 1290 });
    assert.equal(checkout.status, 200);
    assert.equal(checkout.data.checkoutUrl, "https://checkout.stripe.com/c/pay/cs_live_fixture");
    assert.equal(checkoutBody.get("success_url"), "https://polaris-ai.work/checkout-return?result=success");
    assert.equal(checkoutBody.get("cancel_url"), "https://polaris-ai.work/checkout-return?result=cancel");
    assert.equal((await event("evt_test", false)).status, 400);
    assert.equal((await event("evt_pending")).status, 200);
    paid = true;
    assert.equal((await event("evt_paid")).status, 200);
    assert.equal((await event("evt_paid")).status, 200);
    const claim = { purchaseId: checkout.data.purchaseId, claimToken: checkout.data.claimToken, installationId: install.installationId };
    const first = await request(env, "/api/licenses/claim", claim);
    const second = await request(env, "/api/licenses/claim", claim);
    assert.equal(first.status, 200);
    assert.equal(first.data.activationToken, second.data.activationToken);
    assert.equal(sent, 0);
    await worker.scheduled({}, env);
    assert.equal(sent, 1);
    await worker.scheduled({}, env);
    assert.equal(sent, 1);
  } finally { env.DB.close(); }
});

test("a test Checkout session is rejected and localhost cannot call or receive the buyer", async (t) => {
  const env = environment();
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input);
    if (url.pathname === "/v1/prices/price_live_promo") return Response.json({ id: "price_live_promo", livemode: true, active: true, currency: "usd", unit_amount: 1290, type: "one_time" });
    if (url.pathname === "/v1/checkout/sessions") return Response.json({ id: "cs_test_fixture", livemode: false, url: "https://checkout.stripe.com/c/pay/cs_test_fixture" });
    throw new Error(url.pathname);
  });
  try {
    await request(env, "/api/trial/start", install);
    assert.equal((await request(env, "/api/checkout/session", { planId: "pro", installationId: install.installationId })).data.error, "test_mode_rejected");
    assert.equal((await request(env, "/api/trial/start", install, { Origin: "http://127.0.0.1:4317" })).status, 403);
    assert.equal((await request(env, "/api/trial/start", install, { Origin: "https://polaris-ai.work" })).status, 200);
    env.PUBLIC_APP_URL = "http://127.0.0.1:4317";
    assert.equal((await request(env, "/api/checkout/session", { planId: "pro", installationId: install.installationId })).data.error, "invalid_return_origin");
  } finally { env.DB.close(); }
});

test("production migration does not create the test worker's legacy tables", async () => {
  const sql = await readFile(new URL("../migrations/0001_billing.sql", import.meta.url), "utf8");
  assert.equal(/\bCREATE TABLE[^\n]+orders\b/i.test(sql), false);
  assert.equal(sql.includes("polaris-license-test"), false);
  assert.match(sql, /polaris_billing_purchase_intents/);
});
