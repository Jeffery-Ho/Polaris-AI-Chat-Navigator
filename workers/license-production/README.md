# Polaris license production

Separate from `polaris-license-test`. This Worker uses its own D1 database and its own signing secrets. It does not read the test database or test credentials.

`GET /health` returns `env: "production"`. `billingReady` is true only when the live Stripe key, webhook secret, both Price IDs, signing secrets, and email binding are all present. Health alone does not prove a completed purchase.

Checkout accepts only live Stripe sessions (`cs_live_`) and sends buyers back to `https://polaris-ai.work/checkout-return`. USD 19.99 is the regular one-time lifetime price. USD 12.90 applies only while the installation's server-recorded seven-day trial is still open. The client cannot choose or extend that window. There is no device limit. Test-mode keys, test sessions, and localhost returns are rejected.

The Chrome release calls this Worker only after `billingReady` is true. The test Worker is not part of that package.

## Already configured

- Worker: `polaris-license-production` on `workers.dev`
- D1: `polaris-license-production`, binding `DB`
- Plain vars: `ENVIRONMENT`, `PUBLIC_APP_URL`, `ALLOWED_ORIGINS`, `EMAIL_FROM_ADDRESS`
- Email binding `EMAIL`, allowed sender `licenses@polaris-ai.work`
- `LICENSE_HASH_SECRET` and `LICENSE_DELIVERY_ENCRYPTION_KEY` stored only as Worker secrets
- Live Stripe key, webhook signing secret, and both Price IDs are set on the Worker and are not stored in this repository

Webhook events the Worker handles: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `payment_intent.payment_failed`.
