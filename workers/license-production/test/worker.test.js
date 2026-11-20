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
    assert.equal(priced.data.plans[0].maxActivations, 3);
    await worker.scheduled({}, env);
    assert.equal(sent, 0);
  } finally { env.DB.close(); }
});

test("USD 12.90 is available only during the server-recorded seven-day trial", async (t) => {
  const env = environment();
  const start = Date.now();
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("stripe must not be called for a rejected price");
  });
  try {
    await request(env, "/api/trial/start", install);
    const during = await request(env, "/api/checkout/session", {
      planId: "pro", installationId: install.installationId, expectedAmount: 1999, discount: true
    });
    assert.equal(during.status, 409);
    assert.equal(during.data.error, "price_changed");
    t.mock.method(Date, "now", () => start + 8 * 86400000);
    const priced = await request(env, "/api/plans?installationId=installation-a");
    assert.equal(priced.data.plans[0].amount, 1999);
    assert.equal(priced.data.plans[0].originalAmount, 1999);
    const after = await request(env, "/api/checkout/session", {
      planId: "pro", installationId: install.installationId, expectedAmount: 1290
    });
    assert.equal(after.status, 409);
    assert.equal(after.data.error, "price_changed");
    assert.equal((await env.DB.prepare("SELECT count(*) AS count FROM polaris_billing_purchase_intents").first()).count, 0);
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
    assert.equal(checkoutBody.get("success_url"), "https://polaris-ai.work/v2/checkout-return/?result=success");
    assert.equal(checkoutBody.get("cancel_url"), "https://polaris-ai.work/v2/checkout-return/?result=cancel");
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

test("anonymous website checkout uses the USD 12.90 launch price", async (t) => {
  const env = environment();
  let calls = 0;
  let checkoutBody;
  t.mock.method(globalThis, "fetch", async (input, options) => {
    calls += 1;
    const url = new URL(input);
    if (url.pathname === "/v1/prices/price_live_promo") return Response.json({ id: "price_live_promo", livemode: true, active: true, currency: "usd", unit_amount: 1290, type: "one_time" });
    if (url.pathname === "/v1/checkout/sessions") {
      checkoutBody = new URLSearchParams(options.body);
      return Response.json({ id: "cs_live_web", livemode: true, url: "https://checkout.stripe.com/c/pay/cs_live_web" });
    }
    throw new Error(url.pathname);
  });
  const site = { Origin: "https://polaris-ai.work" };
  try {
    const catalog = await request(env, "/api/catalog");
    assert.equal(catalog.data.plans[0].amount, 1290);
    assert.equal(catalog.data.plans[0].originalAmount, 1999);
    const promo = await request(env, "/api/checkout/web-session", { planId: "pro", expectedAmount: 1999 }, site);
    assert.equal(promo.status, 409);
    assert.equal(promo.data.error, "price_changed");
    assert.equal(promo.data.amount, 1290);
    assert.equal(calls, 0);
    const redirected = await request(env, "/api/checkout/web-session", { planId: "pro", returnUrl: "https://attacker.invalid/checkout-return" }, site);
    assert.equal(redirected.status, 400);
    const unowned = await request(env, "/api/checkout/web-session", { planId: "pro", discount: true, expectedAmount: 1290 }, site);
    assert.equal(unowned.status, 401);
    assert.equal(calls, 0);
    assert.equal((await request(env, "/api/checkout/web-session", { planId: "pro" })).status, 403);
    assert.equal((await request(env, "/api/checkout/web-session", { planId: "pro" }, { Origin: "https://attacker.invalid" })).status, 403);
    const checkout = await request(env, "/api/checkout/web-session", { planId: "pro", expectedAmount: 1290 }, site);
    assert.equal(checkout.status, 200);
    assert.equal(checkout.data.amount, 1290);
    assert.equal(checkout.data.checkoutUrl, "https://checkout.stripe.com/c/pay/cs_live_web");
    assert.equal(checkoutBody.get("line_items[0][price]"), "price_live_promo");
    assert.equal(checkoutBody.get("success_url"), `https://polaris-ai.work/v2/checkout-return/?result=success&purchase=${checkout.data.purchaseId}`);
    assert.equal(checkoutBody.get("cancel_url"), `https://polaris-ai.work/v2/checkout-return/?result=cancel&purchase=${checkout.data.purchaseId}`);
    assert.equal((await request(env, "/api/web-purchases/claim", { purchaseId: checkout.data.purchaseId, claimToken: "wrong-token" }, site)).status, 401);
    assert.equal((await request(env, "/api/licenses/claim", { purchaseId: checkout.data.purchaseId, claimToken: checkout.data.claimToken, installationId: install.installationId }, site)).status, 401);
  } finally { env.DB.close(); }
});

test("website promo requires a stored open trial and never creates one", async (t) => {
  const env = environment();
  let calls = 0;
  let checkoutBody;
  t.mock.method(globalThis, "fetch", async (input, options) => {
    calls += 1;
    const url = new URL(input);
    if (url.pathname === "/v1/prices/price_live_promo") return Response.json({ id: "price_live_promo", livemode: true, active: true, currency: "usd", unit_amount: 1290, type: "one_time" });
    if (url.pathname === "/v1/prices/price_live_default") return Response.json({ id: "price_live_default", livemode: true, active: true, currency: "usd", unit_amount: 1999, type: "one_time" });
    if (url.pathname === "/v1/checkout/sessions") {
      checkoutBody = new URLSearchParams(options.body);
      return Response.json({ id: "cs_live_web_trial", livemode: true, url: "https://checkout.stripe.com/c/pay/cs_live_web_trial" });
    }
    throw new Error(url.pathname);
  });
  const site = { Origin: "https://polaris-ai.work", "X-Installation-Token": install.installationToken };
  try {
    const missing = await request(env, "/api/checkout/web-session", { planId: "pro", installationId: install.installationId, discount: true, expectedAmount: 1290 }, site);
    assert.equal(missing.status, 401);
    assert.equal(calls, 0);
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM polaris_billing_installations").first()).n, 0);
    await request(env, "/api/trial/start", install);
    const open = await request(env, "/api/checkout/web-session", { planId: "pro", installationId: install.installationId, discount: true, expectedAmount: 1290 }, site);
    assert.equal(open.status, 200);
    assert.equal(open.data.amount, 1290);
    assert.equal(checkoutBody.get("line_items[0][price]"), "price_live_promo");
    const before = calls;
    const start = Date.now();
    t.mock.method(Date, "now", () => start + 8 * 86400000);
    const expired = await request(env, "/api/checkout/web-session", { planId: "pro", installationId: install.installationId, discount: true, expectedAmount: 1290 }, site);
    assert.equal(expired.status, 409);
    assert.equal(expired.data.amount, 1999);
    assert.equal(calls, before);
  } finally { env.DB.close(); }
});

test("production migration does not create the test worker's legacy tables", async () => {
  const sql = await readFile(new URL("../migrations/0001_billing.sql", import.meta.url), "utf8");
  assert.equal(/\bCREATE TABLE[^\n]+orders\b/i.test(sql), false);
  assert.equal(sql.includes("polaris-license-test"), false);
  assert.match(sql, /polaris_billing_purchase_intents/);
});

test("operator grant issues one license per email and delivers it", async () => {
  const env = environment({ ADMIN_TOKEN: "admin-token-only-used-by-tests-0123456789" });
  const mails = [];
  env.EMAIL = { async send(message) { mails.push(message); } };
  const auth = { Authorization: `Bearer ${env.ADMIN_TOKEN}` };
  try {
    assert.equal((await request(env, "/api/admin/grant-license", { email: "beta@example.com" })).status, 401);
    assert.equal((await request(env, "/api/admin/grant-license", { email: "beta@example.com" }, { Authorization: "Bearer wrong" })).status, 401);
    assert.equal((await request({ ...env, ADMIN_TOKEN: undefined }, "/api/admin/grant-license", { email: "beta@example.com" }, auth)).status, 401);
    assert.equal((await request(env, "/api/admin/grant-license", { email: "nope" }, auth)).status, 400);

    const first = await request(env, "/api/admin/grant-license", { email: " Beta@Example.com " }, auth);
    assert.equal(first.status, 200);
    assert.equal(first.data.existing, false);
    assert.equal(first.data.delivery, "sent");
    assert.equal(mails.length, 1);
    assert.equal(mails[0].to, "beta@example.com");
    const key = mails[0].text.match(/POL-[0-9a-f]{64}/)[0];

    const again = await request(env, "/api/admin/grant-license", { email: "beta@example.com" }, auth);
    assert.equal(again.data.existing, true);
    assert.equal(again.data.licenseId, first.data.licenseId);
    assert.equal(mails.length, 1, "resend is throttled to once an hour");
    assert.equal((await env.DB.prepare("SELECT count(*) AS count FROM polaris_billing_licenses").first()).count, 1);

    await request(env, "/api/trial/start", install);
    const redeemed = await request(env, "/api/licenses/redeem", { licenseKey: key, installationId: install.installationId });
    assert.equal(redeemed.status, 200);
    assert.equal(redeemed.data.entitlement.status, "active");
  } finally { env.DB.close(); }
});

async function grantedKey(env) {
  const mails = [];
  env.ADMIN_TOKEN = "admin-token-only-used-by-tests-0123456789";
  env.EMAIL = { async send(message) { mails.push(message); } };
  await request(env, "/api/admin/grant-license", { email: "slots@example.com" }, { Authorization: `Bearer ${env.ADMIN_TOKEN}` });
  return mails[0].text.match(/POL-[0-9a-f]{64}/)[0];
}

function browserInstall(name) {
  const value = { installationId: `installation-${name}`, installationToken: `${name}-installation-secret-with-32-characters` };
  const headers = { "X-Installation-Token": value.installationToken };
  return {
    ...value,
    start: (env) => request(env, "/api/trial/start", value, headers),
    post: (env, path, data) => request(env, path, { installationId: value.installationId, ...data }, headers)
  };
}

test("a license holds 3 browsers, lists them when full, and frees a slot on release", async () => {
  const env = environment();
  try {
    const key = await grantedKey(env);
    const [work, home, friend, fourth] = ["work", "home", "friend", "fourth"].map(browserInstall);
    for (const item of [work, home, friend, fourth]) await item.start(env);
    const first = await work.post(env, "/api/licenses/redeem", { licenseKey: key, client: { browser: "Dia", os: "macOS" } });
    assert.equal(first.status, 200);
    assert.equal(first.data.activations.length, 1);
    assert.deepEqual([first.data.activations[0].browser, first.data.activations[0].os], ["Dia", "macOS"]);
    assert.equal(first.data.activationId, first.data.activations[0].id);
    await home.post(env, "/api/licenses/redeem", { licenseKey: key, client: { browser: "Dia", os: "macOS" } });
    await friend.post(env, "/api/licenses/redeem", { licenseKey: key, client: { browser: "<script>", os: "Windows" } });

    const full = await fourth.post(env, "/api/licenses/redeem", { licenseKey: key });
    assert.equal(full.status, 409);
    assert.equal(full.data.error, "activation_limit_reached");
    assert.equal(full.data.limit, 3);
    assert.equal(full.data.activations.length, 3);
    assert.equal(full.data.activations[2].browser, null, "unsafe browser labels are not stored");
    assert.equal(full.data.activationToken, undefined);

    const again = await work.post(env, "/api/licenses/redeem", { licenseKey: key });
    assert.equal(again.status, 200, "an active browser reuses its slot when the license is full");
    assert.equal(again.data.activations.length, 3);

    assert.equal((await fourth.post(env, "/api/licenses/release", { licenseKey: "POL-wrong", activationId: full.data.activations[1].id })).status, 400);
    const released = await fourth.post(env, "/api/licenses/release", { licenseKey: key, activationId: full.data.activations[1].id });
    assert.equal(released.data.released, true);
    assert.equal(released.data.activations.length, 2);
    const replay = await fourth.post(env, "/api/licenses/release", { licenseKey: key, activationId: full.data.activations[1].id });
    assert.equal(replay.data.released, false, "a replayed release frees nothing else");
    assert.equal(replay.data.activations.length, 2);

    const activated = await fourth.post(env, "/api/licenses/redeem", { licenseKey: key });
    assert.equal(activated.status, 200);
    assert.equal(activated.data.activations.length, 3);
  } finally { env.DB.close(); }
});

test("a released browser learns why it left Pro and its old credential cannot return", async () => {
  const env = environment();
  try {
    const key = await grantedKey(env);
    const [work, home] = ["work", "home"].map(browserInstall);
    for (const item of [work, home]) await item.start(env);
    const workActivation = await work.post(env, "/api/licenses/redeem", { licenseKey: key });
    const homeActivation = await home.post(env, "/api/licenses/redeem", { licenseKey: key });

    const listed = await request(env, "/api/licenses/validate", { activationToken: workActivation.data.activationToken });
    assert.equal(listed.data.valid, true);
    assert.equal(listed.data.activationId, workActivation.data.activationId);
    assert.equal(listed.data.activations.length, 2);

    const removed = await request(env, "/api/licenses/deactivate", { activationToken: workActivation.data.activationToken, activationId: homeActivation.data.activationId });
    assert.equal(removed.data.released, true);
    assert.equal(removed.data.activations.length, 1);

    const stale = await request(env, "/api/licenses/validate", { activationToken: homeActivation.data.activationToken });
    assert.equal(stale.data.valid, false);
    assert.equal(stale.data.reason, "deactivated");
    assert.equal((await request(env, "/api/licenses/validate", { activationToken: workActivation.data.activationToken })).data.valid, true);

    const back = await home.post(env, "/api/licenses/redeem", { licenseKey: key });
    assert.equal(back.status, 200);
    assert.notEqual(back.data.activationToken, homeActivation.data.activationToken);
    assert.equal((await request(env, "/api/licenses/validate", { activationToken: homeActivation.data.activationToken })).data.valid, false);
  } finally { env.DB.close(); }
});

test("two browsers racing for the last slot get exactly one activation", async () => {
  const env = environment();
  try {
    const key = await grantedKey(env);
    const items = ["a", "b", "c", "d"].map(browserInstall);
    for (const item of items) await item.start(env);
    await items[0].post(env, "/api/licenses/redeem", { licenseKey: key });
    await items[1].post(env, "/api/licenses/redeem", { licenseKey: key });
    const results = await Promise.all([items[2], items[3]].map((item) => item.post(env, "/api/licenses/redeem", { licenseKey: key })));
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    assert.equal((await env.DB.prepare("SELECT count(*) AS count FROM polaris_billing_activations WHERE status='active'").first()).count, 3);

    const winner = results.find((result) => result.status === 200);
    await request(env, "/api/licenses/deactivate", { activationToken: winner.data.activationToken });
    const loser = items[results[0].status === 200 ? 3 : 2];
    const reactivate = await Promise.all([loser, items[results[0].status === 200 ? 2 : 3]].map((item) => item.post(env, "/api/licenses/redeem", { licenseKey: key })));
    assert.deepEqual(reactivate.map((result) => result.status).sort(), [200, 409], "reactivation and a new browser also race safely");
    assert.equal((await env.DB.prepare("SELECT count(*) AS count FROM polaris_billing_activations WHERE status='active'").first()).count, 3);
  } finally { env.DB.close(); }
});
