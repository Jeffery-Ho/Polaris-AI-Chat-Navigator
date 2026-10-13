import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [buildManifest, viteConfig, sidePanelHtml, windowSource] = await Promise.all([
  readFile(new URL("../manifest.build.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../vite.config.js", import.meta.url), "utf8"),
  readFile(new URL("../sidepanel.html", import.meta.url), "utf8"),
  readFile(new URL("../src/window.js", import.meta.url), "utf8")
]);

test("manifest.build.json declares Polaris side panel", () => {
  assert.ok(buildManifest.permissions.includes("sidePanel"));
  assert.ok(buildManifest.permissions.includes("scripting"));
  assert.deepEqual(buildManifest.side_panel, { default_path: "sidepanel.html" });
});

test("side panel reuses the Polaris window UI entry", () => {
  assert.match(sidePanelHtml, /data-window-type="sidepanel"/);
  assert.match(sidePanelHtml, /href="\/src\/window\.css"/);
  assert.match(sidePanelHtml, /src="\/src\/window\.js"/);
  assert.match(windowSource, /windowType: "sidepanel"/);
});

test("Vite builds the side panel as an extension page", () => {
  assert.match(viteConfig, /sidepanel:\s*"sidepanel\.html"/);
});
