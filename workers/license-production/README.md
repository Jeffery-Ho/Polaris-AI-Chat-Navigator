# Polaris license production

Separate from `polaris-license-test`. This Worker uses its own D1 database and its own signing secrets. It does not read the test database or test credentials.

`GET /health` returns `env: "production"`. `billingReady` is true only when the live Stripe key, webhook secret, both Price IDs, signing secrets, and email binding are all present. Health alone does not prove a completed purchase.

Checkout accepts only live Stripe sessions (`cs_live_`) and sends buyers back to `https://polaris-ai.work/v2/checkout-return/`. The return path is fixed in the Worker. A client cannot supply another URL. USD 19.99 is the regular one-time lifetime price. USD 12.90 applies only while an extension installation's server-recorded seven-day trial is still open. The client cannot choose or extend that window. There is no device limit. Test-mode keys, test sessions, and localhost returns are rejected.

## Public website contract

These routes are for `https://polaris-ai.work` only. They do not grant the trial price to an anonymous buyer.

`GET /api/catalog` returns `{ serverTime, plans: [{ id: "pro", currency: "usd", amount: 1999, originalAmount: 1999, billing: "one_time", maxActivations: null }] }`.

`POST /api/checkout/web-session` with `Origin: https://polaris-ai.work` and `{ planId: "pro", expectedAmount: 1999 }` returns `{ checkoutUrl, purchaseId, claimToken, amount: 1999, currency: "usd", originalAmount: 1999 }`. `checkoutUrl` is an `https://checkout.stripe.com` URL whose path contains `cs_live_`. Stripe returns to `https://polaris-ai.work/v2/checkout-return/?result=success&purchase=<purchaseId>` or the same path with `result=cancel`. Sending `expectedAmount: 1290`, `discount`, `installationId`, `priceId`, `amount`, or a return URL does not create a Checkout. A mismatched `expectedAmount` returns `409` `{ error: "price_changed", amount: 1999, currency: "usd", originalAmount: 1999 }` and writes nothing. Any other origin is `403`.

`POST /api/web-purchases/claim` with `{ purchaseId, claimToken }` returns `{ status }` until the live webhook has paid the order, then `{ status: "paid", licenseKey }`. The extension claim route cannot redeem that website purchase.

`GET /api/plans` and `POST /api/checkout/session` remain installation routes. They require `X-Installation-Token`. Their amount is `1290` only while that installation's stored `trial_ends_at` is still in the future, otherwise `1999`. A client flag cannot select `1290`.

The Chrome release calls this Worker only after `billingReady` is true. The test Worker is not part of that package.

## Already configured

- Worker: `polaris-license-production` on `workers.dev`
- D1: `polaris-license-production`, binding `DB`
- Plain vars: `ENVIRONMENT`, `PUBLIC_APP_URL`, `ALLOWED_ORIGINS`, `EMAIL_FROM_ADDRESS`
- Email binding `EMAIL`, allowed sender `licenses@polaris-ai.work`
- `LICENSE_HASH_SECRET` and `LICENSE_DELIVERY_ENCRYPTION_KEY` stored only as Worker secrets
- Live Stripe key, webhook signing secret, and both Price IDs are set on the Worker and are not stored in this repository

Webhook events the Worker handles: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `payment_intent.payment_failed`.
