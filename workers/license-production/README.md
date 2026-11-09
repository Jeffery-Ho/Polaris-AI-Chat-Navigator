# Polaris license production

Separate from `polaris-license-test`. This Worker uses its own D1 database and its own signing secrets. It does not read the test database or test credentials.

`GET /health` returns `env: "production"`. `billingReady` is true only when the live Stripe key, webhook secret, both Price IDs, signing secrets, and email binding are all present. Health alone does not mean purchasing is open.

Checkout accepts only live Stripe sessions (`cs_live_`) and sends buyers back to `https://polaris-ai.work/checkout-return`. The welcome price is USD 12.90 and the later price is USD 19.99, both one-time, with no device limit. Test-mode keys, test sessions, and localhost returns are rejected.

The extension build does not call this Worker until those Stripe values exist. Do not publish a download that advertises purchasing before `billingReady` is true.

## Already configured

- Worker: `polaris-license-production` on `workers.dev`
- D1: `polaris-license-production`, binding `DB`
- Plain vars: `ENVIRONMENT`, `PUBLIC_APP_URL`, `ALLOWED_ORIGINS`, `EMAIL_FROM_ADDRESS`
- Email binding `EMAIL`, allowed sender `licenses@polaris-ai.work`
- New `LICENSE_HASH_SECRET` and `LICENSE_DELIVERY_ENCRYPTION_KEY` stored only as Worker secrets

## Still required before purchasing

Set these on `polaris-license-production` only. Do not copy them from `polaris-license-test`, and do not paste the values into chat or git.

| Name | Kind | What to supply |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | secret | Existing live secret or restricted key (`sk_live_` or `rk_live_`) for the paid plan |
| `STRIPE_WEBHOOK_SECRET` | secret | Signing secret of a live webhook whose URL is `https://polaris-license-production.hexianji.workers.dev/api/stripe/webhook` |
| `STRIPE_PRICE_PRO_PROMO` | plain var | Existing live Price ID for the USD 12.90 one-time price |
| `STRIPE_PRICE_PRO_DEFAULT` | plain var | Existing live Price ID for the USD 19.99 one-time price |

Webhook events the Worker handles: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `payment_intent.payment_failed`.

Use the Cloudflare dashboard or `pnpm exec wrangler secret put <NAME> --config workers/license-production/wrangler.jsonc` from a trusted terminal. Price IDs are plain vars, not secrets: `pnpm exec wrangler secret put` is the wrong command for them; set them with `wrangler versions secret` only for the two secret names, and put the Price IDs in `vars` before the next deploy.
