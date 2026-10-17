import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "wxt";
import config, { GECKO_ID } from "../wxt.config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveOutDir(browser, command = "build") {
  const wxt = { config: { command, browser, root, outDir: path.join(root, ".output", `${browser}-mv3`) } };
  config.hooks["config:resolved"](wxt);
  return path.relative(root, wxt.config.outDir);
}

test("only the Chrome build is written to dist/", () => {
  assert.equal(resolveOutDir("chrome"), "dist");
  assert.equal(resolveOutDir("firefox"), path.join(".output", "firefox-mv3"));
  assert.equal(resolveOutDir("edge"), path.join(".output", "edge-mv3"));
  assert.equal(resolveOutDir("chrome", "serve"), path.join(".output", "chrome-mv3"));
});

test("Chromium manifests keep the Side Panel permission and Chrome minimum", () => {
  for (const browser of ["chrome", "edge"]) {
    const manifest = config.manifest({ browser });
    assert.ok(manifest.permissions.includes("sidePanel"));
    assert.equal(manifest.minimum_chrome_version, "114");
    assert.equal(manifest.browser_specific_settings, undefined);
  }
});

test("Firefox manifest drops Chromium-only keys and declares a gecko id", () => {
  const manifest = config.manifest({ browser: "firefox" });
  assert.equal(manifest.permissions.includes("sidePanel"), false);
  assert.equal(manifest.minimum_chrome_version, undefined);
  assert.equal(manifest.browser_specific_settings.gecko.id, GECKO_ID);
  assert.ok(manifest.host_permissions.length > 0);
});

test("Firefox build emits sidebar_action and an event-page background", async () => {
  await build({ root, browser: "firefox", logLevel: "silent" });
  const manifest = JSON.parse(await readFile(path.join(root, ".output", "firefox-mv3", "manifest.json"), "utf8"));
  assert.equal(manifest.sidebar_action.default_panel, "sidepanel.html");
  assert.equal(manifest.side_panel, undefined);
  assert.deepEqual(manifest.background.scripts, ["background.js"]);
  assert.equal(manifest.background.service_worker, undefined);
  assert.equal(manifest.browser_specific_settings.gecko.id, GECKO_ID);
});
