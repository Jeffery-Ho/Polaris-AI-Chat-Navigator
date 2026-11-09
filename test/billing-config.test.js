import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BILLING_API_URL, BILLING_HOST_PERMISSION, billingHostPermission } from "../src/billing-config.js";

test("release billing config does not embed the test license worker", async () => {
  assert.equal(BILLING_API_URL, "");
  assert.equal(BILLING_HOST_PERMISSION, null);
  const source = await readFile(new URL("../src/billing-config.js", import.meta.url), "utf8");
  assert.equal(source.includes("workers.dev"), false);
  assert.equal(source.includes("hexianji"), false);
  assert.equal(source.includes("cs_test_"), false);
  assert.equal(source.includes("cs_live_"), false);
});

test("billing host permission accepts only a bare https origin", () => {
  assert.equal(billingHostPermission(""), null);
  assert.equal(billingHostPermission("http://billing.invalid"), null);
  assert.equal(billingHostPermission("https://user:pass@billing.invalid"), null);
  assert.equal(billingHostPermission("https://billing.invalid/api"), null);
  assert.equal(billingHostPermission("https://billing.invalid"), "https://billing.invalid/*");
});
