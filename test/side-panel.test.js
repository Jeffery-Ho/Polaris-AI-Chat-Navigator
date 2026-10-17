import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [buildManifest, distManifest, sidePanelHtml, sidePanelMain, windowSource] = await Promise.all([
  readFile(new URL("../manifest.build.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../dist/manifest.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../entrypoints/sidepanel/index.html", import.meta.url), "utf8"),
  readFile(new URL("../entrypoints/sidepanel/main.js", import.meta.url), "utf8"),
  readFile(new URL("../src/window.js", import.meta.url), "utf8")
]);

test("manifest.build.json declares Polaris side panel", () => {
  assert.ok(buildManifest.permissions.includes("sidePanel"));
  assert.ok(buildManifest.permissions.includes("scripting"));
});

test("side panel reuses the Polaris window UI entry", () => {
  assert.match(sidePanelHtml, /data-window-type="sidepanel"/);
  assert.match(sidePanelHtml, /src="\.\/main\.js"/);
  assert.match(sidePanelMain, /import "\.\.\/\.\.\/src\/window\.css";/);
  assert.match(sidePanelMain, /initializeSidepanel\(\);/);
  assert.match(windowSource, /export function initializeSidepanel\(\)/);
  assert.match(windowSource, /windowType: "sidepanel"/);
});

test("WXT builds the side panel as an extension page", () => {
  assert.deepEqual(distManifest.side_panel, { default_path: "sidepanel.html" });
});
