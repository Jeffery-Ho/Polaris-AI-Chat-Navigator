export class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function liveStripeConfigured(env) {
  return /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY || "");
}

export async function stripe(env, path, { method = "GET", body, idempotencyKey } = {}) {
  if (!liveStripeConfigured(env)) throw new ApiError(503, "live_stripe_not_configured");
  const headers = { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Stripe-Version": "2026-10-28.endive" };
  if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const response = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers, body: body ? new URLSearchParams(body) : undefined });
  if (!response.ok) throw new ApiError(502, "stripe_unavailable");
  const result = await response.json();
  if (result.livemode !== true) throw new ApiError(502, "test_mode_rejected");
  return result;
}
