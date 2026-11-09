import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRelease, PRODUCTION_BILLING_ORIGIN } from "../scripts/release-gate.js";

const ready = { ok: true, env: "production", version: "1.0.0", billingReady: true };

test("release gate stays closed when production billing or the package host is missing", () => {
  const closed = evaluateRelease({
    health: { ok: true, env: "production", version: "1.0.0", billingReady: false },
    packageText: "navigation only"
  });
  assert.equal(closed.some((error) => error.includes("billingReady")), true);
  assert.equal(closed.some((error) => error.includes("USD 12.90")), true);
  assert.equal(closed.some((error) => error.includes("USD 19.99")), true);
  assert.equal(closed.some((error) => error.includes("does not call")), true);
});

test("release gate rejects the test Worker and accepts a ready production package", () => {
  const contaminated = evaluateRelease({
    health: ready,
    packageText: `${PRODUCTION_BILLING_ORIGIN} polaris-license-test`
  });
  assert.equal(contaminated.some((error) => error.includes("test license Worker")), true);
  assert.deepEqual(evaluateRelease({
    health: ready,
    packageText: `host ${PRODUCTION_BILLING_ORIGIN}/api`
  }), []);
});
