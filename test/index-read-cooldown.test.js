import test from "node:test";
import assert from "node:assert/strict";
import { createIndexReadCooldown } from "../public/src/index-read-cooldown.js";

test("read cooldown respects seconds, dates, fallback and expiry without shortening a wait", () => {
  let now = 1800000000000;
  const cooldown = createIndexReadCooldown({ now: () => now });
  for (const header of [null, "", "not-a-date", "-1"]) {
    cooldown.observe(new Response("", { status: 429, headers: header === null ? {} : { "Retry-After": header } }));
    assert.equal(cooldown.error().retryAt, now + 30000);
    now += 30000; assert.equal(cooldown.error(), null);
  }
  cooldown.observe(new Response("", { status: 503, headers: { "Retry-After": "60" } }));
  const until = now + 60000;
  cooldown.observe(new Response("", { status: 429, headers: { "Retry-After": "5" } }));
  assert.equal(cooldown.error().retryAt, until);
  now = until; assert.equal(cooldown.error(), null);
  cooldown.observe(new Response("", { status: 503, headers: { "Retry-After": new Date(now + 45000).toUTCString() } }));
  assert.equal(cooldown.error().retryAt, now + 45000);
  now += 45000;
  cooldown.observe(new Response("", { status: 403 }));
  assert.equal(cooldown.error(), null);
});
