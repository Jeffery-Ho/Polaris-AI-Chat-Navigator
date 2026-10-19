import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { SUPPORTED_PLATFORMS } from "../src/supported-platforms.js";
import { SUPPORTED_MATCHES } from "../src/supported-sites.js";

function matches(pattern, url) {
  const [, scheme, host] = pattern.match(/^(\w+):\/\/([^/]+)\//);
  const target = new URL(url);
  return target.protocol === `${scheme}:` && target.hostname === host;
}

test("每个平台入口都指向支持的站点，图标存在", () => {
  assert.equal(SUPPORTED_PLATFORMS.length, 11);
  for (const platform of SUPPORTED_PLATFORMS) {
    assert.ok(SUPPORTED_MATCHES.some((pattern) => matches(pattern, platform.url)), platform.url);
    assert.ok(existsSync(new URL(`../public/${platform.favicon}`, import.meta.url)), platform.favicon);
  }
});
