# Polaris license production

Separate from `polaris-license-test`. This Worker uses its own D1 database and its own signing secrets. It does not read the test database or test credentials.

`GET /health` returns `env: "production"`. `billingReady` is true only when the live Stripe key, webhook secret, both Price IDs, signing secrets, and email binding are all present. Health alone does not prove a completed purchase.

Checkout accepts only live Stripe sessions (`cs_live_`) and sends buyers back to `https://polaris-ai.work/v2/checkout-return/`. The return path is fixed in the Worker. A client cannot supply another URL. USD 19.99 is the regular one-time lifetime price. USD 12.90 applies only while an extension installation's server-recorded seven-day trial is still open. The client cannot choose or extend that window. There is no device limit. Test-mode keys, test sessions, and localhost returns are rejected.

## Public website contract

These routes are for `https://polaris-ai.work` only. Anonymous website buyers get the USD 12.90 launch price.

`GET /api/catalog` returns `{ serverTime, plans: [{ id: "pro", currency: "usd", amount: 1290, originalAmount: 1999, billing: "one_time", maxActivations: null }] }`.

`POST /api/checkout/web-session` requires `Origin: https://polaris-ai.work`. An ordinary direct purchase is `{ planId: "pro", expectedAmount: 1290 }` and needs no installation. The response is `{ checkoutUrl, purchaseId, claimToken, amount, currency: "usd", originalAmount: 1999 }`. `checkoutUrl` is `https://checkout.stripe.com/...` and its path contains `cs_live_`. Stripe returns only to `https://polaris-ai.work/v2/checkout-return/?result=success&purchase=<purchaseId>` or the same path with `result=cancel`. `result=success` is not proof of payment.

When the body includes `installationId` (with `X-Installation-Token` for an existing installation row), the amount is USD 12.90 while that row's `trial_ends_at` is in the future and USD 19.99 after it. This route never creates that row. `discount: true` without that proof is rejected. `expectedAmount` is checked after the server chooses the amount. A mismatch returns `409` `{ error: "price_changed", amount, currency: "usd", originalAmount: 1999 }` and writes nothing. `returnUrl`, `priceId`, `amount`, and `trial` are rejected. Any other origin is `403`. Each accepted request creates one purchase and uses that id as the Stripe idempotency key. The route is rate-limited to 30 requests a minute per address.

`POST /api/web-purchases/claim` with `{ purchaseId, claimToken }` returns `{ status }` until the live webhook has paid the order, then `{ status: "paid", licenseKey }`. The claim token is the proof, not the return query. The extension claim route cannot redeem that website purchase.

`GET /api/plans` and `POST /api/checkout/session` remain installation routes. They require `X-Installation-Token`. Their amount is `1290` only while that installation's stored `trial_ends_at` is still in the future, otherwise `1999`. A client flag cannot select `1290`.

The Chrome release calls this Worker only after `billingReady` is true. The test Worker is not part of that package.

## Already configured

- Worker: `polaris-license-production` on `workers.dev`
- D1: `polaris-license-production`, binding `DB`
- Plain vars: `ENVIRONMENT`, `PUBLIC_APP_URL`, `ALLOWED_ORIGINS`, `EMAIL_FROM_ADDRESS`
- Email binding `EMAIL`, allowed sender `licenses@polaris-ai.work`
- `LICENSE_HASH_SECRET` and `LICENSE_DELIVERY_ENCRYPTION_KEY` stored only as Worker secrets
- Live Stripe key and webhook signing secret are Worker secrets and are not stored in this repository. Both live Price IDs are plain vars in `wrangler.jsonc`; a deploy replaces dashboard-only vars, so keep them there.
- `ADMIN_TOKEN` (operator license grants) is a Worker secret; the local copy lives in the ignored `.admin-token`

Webhook events the Worker handles: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `payment_intent.payment_failed`.

## Operator-issued licenses

`POST /api/admin/grant-license` with `Authorization: Bearer <ADMIN_TOKEN>` and `{ email }` issues one active license for that email (no Stripe purchase, amount 0) and sends it through the normal delivery queue immediately. A repeat call for the same email returns `existing: true` and re-sends the same key, at most once an hour. Without an `ADMIN_TOKEN` secret of at least 32 characters the route returns `401`.

```sh
pnpm license:grant buyer@example.com
```

The script reads the token from `POLARIS_ADMIN_TOKEN` or the ignored `workers/license-production/.admin-token`.
