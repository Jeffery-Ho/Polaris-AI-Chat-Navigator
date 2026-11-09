# Polaris license test Worker

Independent test backend for the Polaris Pro review flow. Extension release builds do not embed this Worker URL. The extension includes a background billing service and a Pro/license settings flow. Feature restrictions apply only after successful licensing initialization; current installs retain their prior behavior while the test deployment is unavailable. The remote Worker is `https://polaris-license-test.hexianji.workers.dev`, API version **0.1.2**, using the existing D1 binding. A real Stripe sandbox purchase has passed Checkout, signed Webhook fulfillment, idempotent claim, validation, cross-installation redemption and refund revocation. The WORK extension has displayed an active Pro license through live redemption. Request bodies are bounded while streaming, and unknown paths do not allocate rate-limit records. Transactional email remains unconfigured.

## Scope and configuration

- One-time USD pricing only: $12.90 for seven days after first use, then $19.99. Price IDs are server configuration; their Stripe amount/currency/type are verified before Checkout.
- Seven-day trial identity uses a random installation ID and independent secret, not a fingerprint. Reinstallation can create a new trial; no claim of abuse-proof trials.
- Unlimited installation activations. Each activation gets a separate opaque credential. Deactivation invalidates its generation so an old credential cannot return to service.
- Stripe operations require `sk_test_` or `rk_test_`. Live events, live objects and non-test Checkout sessions are rejected. This is deliberately not a production billing release.
- Free platform selection stays local to the extension. Its centralized access policy limits initialized Free installations to two selected platforms and excludes full conversation indexing.

Copy `wrangler.example.jsonc` to ignored `wrangler.jsonc`, fill the **existing test D1 database ID**, test Price IDs and approved frontend origins. Do not invent a D1 ID or apply this schema to an unrelated database. Inspect/back up the current Worker and its bindings before replacing it.

The deployment preserves the existing Worker compatibility date, 2026-10-01. Project-local Wrangler is pinned to 4.92.0; `pnpm billing:dev` uses 2026-05-15 for its bundled local runtime. No live-mode billing is enabled.

Use Wrangler 4 with Node 22+ (tests require Node's SQLite API; verified with Node 24). No runtime framework or SDK is needed. From the repository root:

```sh
pnpm exec wrangler login
pnpm exec wrangler d1 migrations apply polaris-license-test --local --config workers/license-test/wrangler.jsonc
pnpm billing:dev
```

For local development, copy `.dev.vars.example` to ignored `.dev.vars`. Required secrets are `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `LICENSE_HASH_SECRET` and `LICENSE_DELIVERY_ENCRYPTION_KEY`. Generate the last two independently with at least 32 cryptographically random bytes. Keep them stable; changing them without a migration invalidates verifiers or encrypted delivery data. For remote use, set secrets with `wrangler secret put`, not in checked-in JSON.

Remote migrations/deployment require Cloudflare authentication and the verified existing D1 binding. Configure Stripe test events to POST to `/api/stripe/webhook` with that endpoint's own signing secret. Local Stripe CLI listeners have a different signing secret. The deployment build passed `wrangler deploy --dry-run`. The additive `0002_billing_namespace.sql` migration and test Worker deployment are complete. The original `orders`, `licenses`, `activations`, `processed_events` and `payouts` tables remain intact. New code only accesses tables prefixed `polaris_billing_`; the migration regression test preserves seeded legacy rows and verifies repeatability.

## Interfaces

All JSON APIs are HTTPS on deployment. Restrictive `ALLOWED_ORIGINS` is a browser boundary; credentials still authenticate requests. Installation operations send `X-Installation-Token`.

| Method | Route | Input / purpose |
| --- | --- | --- |
| GET | `/health` | Public test environment/version |
| POST | `/api/trial/start` | `{installationId, installationToken}`; idempotent trial registration |
| GET | `/api/plans?installationId=...` | Authoritative prices, currency, trial/offer deadlines, server time |
| POST | `/api/checkout/session` | `{planId: "pro", installationId, expectedAmount?}`; test Checkout URL + purchase claim; stale expected amounts return `409 price_changed` |
| POST | `/api/stripe/webhook` | Raw body + signed Stripe header; durable idempotent fulfillment |
| GET | `/api/purchases/:id/status` | Bearer claim token + `X-Installation-Id` + installation token |
| POST | `/api/licenses/claim` | `{purchaseId, claimToken, installationId}`; active paid entitlement only |
| POST | `/api/licenses/redeem` | `{licenseKey, installationId}`; returns per-installation token |
| POST | `/api/licenses/validate` | `{activationToken}`; 24-hour bounded offline deadline on success |
| POST | `/api/licenses/deactivate` | `{activationToken}`; revoke current installation only |
| POST | `/api/licenses/recover` | `{email}`; uniform response, queues matching active license delivery |

Claim credentials expire after 24 hours; recover/redeem remains the fallback. Status polling belongs to the client and is bounded. `preview-client.js` implements this interface for the standalone browser preview; its test-only localStorage namespace never touches extension storage. `src/billing-service.js` now persists installation and activation credentials in `chrome.storage.local`, and the background message handler owns authenticated calls. UI state excludes credentials. Content pages can read public access but cannot create Checkout sessions, redeem licenses or deactivate installations. Cold access checks use local cache without starting network requests.

The frontend may use localhost return URLs during test only. `/checkout-return` must remain a neutral return page: never infer paid/active from redirect parameters. Real activation uses the original client's authenticated claim exchange.

The extension refreshes catalog pricing before creating a new Checkout. An expired discounted quote is hidden until the server supplies a current price; a changed amount requires another explicit purchase selection. `expectedAmount` also protects the boundary between that refresh and Checkout creation. Existing pending Checkout sessions retain their original price.

## Payment processing

Webhook signatures use the raw body, multiple v1 signature support, a five-minute timestamp window and constant-time comparison. Payment fulfillment re-reads the current Stripe Checkout and PaymentIntent/charge rather than trusting the redirect or a stale event. Pending asynchronous payments do not issue a license. Full or partial refunds and disputes revoke access in this test implementation. Revocation is terminal; out-of-order paid notifications cannot restore it.

Database updates, license insertion, mail job insertion and event completion are one D1 batch. Unique purchase/session/key/activation constraints prevent duplicate issuance. An early event for a not-yet-saved Checkout session returns 503 for Stripe to retry. Unrelated Stripe purchases do not create Polaris licenses.

## Email and privacy

License and activation verifiers use HMAC-SHA-256. Installation IDs and lookup emails are hashed with domain separation. Card details and conversation data are never stored or logged.

For this test implementation, a deliberately separate AES-GCM key encrypts `{email, licenseKey}` for delivery and recovery. The ciphertext remains for the lifetime of the test license; recovery resends the existing credential. This is not reconstructing a key from its hash. Before production, define deletion/retention, adopt short-lived recovery links/rotation, and audit key rotation and operational access.

The `polaris_billing_email_deliveries` table is a durable outbox. The five-minute scheduled handler sends through Resend only when `EMAIL_PROVIDER_API_KEY` and `EMAIL_FROM_ADDRESS` are configured; otherwise jobs remain pending and payment/activation still succeed. Sending uses a per-job idempotency key and capped exponential backoff. Recovery is throttled to one job per license per hour and all API paths have hashed-IP minute rate limits. No emails have been sent as part of local verification.

## Verification and rollout boundaries

Run from the repository root:

```sh
pnpm billing:check
node --check workers/license-test/src/index.js
```

Tests exercise the public HTTP interface with SQLite D1 compatibility and mocked external Stripe/email transports. They cover identity ownership, authoritative pricing, invalid plan/origin, live-key rejection, unsigned webhooks, pending payments, duplicate/out-of-order events, refund revocation, idempotent claims, multiple-device redemption, deactivation generation changes, email queue delivery and non-enumerating recovery. These are not real Stripe acceptance tests or remote D1 tests.

On 2026-10-30 a hosted Stripe sandbox Checkout for $12.90 completed against the deployed Worker. Its signed Webhook produced exactly one license. Authenticated claim/validation, idempotent claim, another installation's redemption, device deactivation, new-token reactivation and non-enumerating recovery passed remotely. Refunding that sandbox payment triggered revocation: both test activation tokens became invalid, and claim/redemption were rejected. The actual WORK extension also redeemed this license and displayed Pro before the refund. These checks used test objects and a fictional email; no production funds moved and no email was sent.

Before connecting a production extension, also validate deployed D1 concurrency under load, Cloudflare abuse controls, secret rotation, bounded offline enforcement, real mail delivery and purchase-recovery after service-worker suspension. Production rollout remains separate from this design/test work.

Sources: [Stripe Checkout](https://docs.stripe.com/api/checkout/sessions/create), [Webhook verification](https://docs.stripe.com/events/manage-webhook-endpoints), [D1 batches](https://developers.cloudflare.com/d1/worker-api/d1-database/).

## Current test resources

The verified Stripe CLI sandbox is `JefferyHo` (`acct_1USTRNJPPURWPaDL`). It contains Polaris Pro (`prod_VXHBtYigjlCrJp`), USD 1290 / 1999 one-time prices and the signed test Webhook at `/api/stripe/webhook`. Their IDs are recorded in ignored local configuration; secret values are not committed. Stripe CLI OAuth can configure these resources, but its credentials are not a substitute for the Worker API key.

Cloudflare license-hash, delivery-encryption, Webhook signing and Stripe test API secrets are configured. The Stripe API key is stored in ignored local `.dev.vars` with owner-only permissions and as a Cloudflare secret. The transactional email provider key and verified sender address are still missing, so the durable delivery job remains queued and no license email has been delivered. The sandbox verification payment was refunded; its test license is revoked. No production payments or resources were changed.
