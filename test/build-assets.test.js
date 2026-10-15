import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const [sourceManifest, distManifest] = await Promise.all([
  readFile(new URL("../manifest.build.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../dist/manifest.json", import.meta.url), "utf8").then(JSON.parse)
]);

test("WXT produces self-contained content scripts without volatile loaders", async () => {
  const scripts = distManifest.content_scripts.flatMap((entry) => entry.js || []);
  assert.equal(scripts.length, 1);
  for (const file of scripts) {
    assert.ok(file.endsWith(".js"));
    assert.equal(file.includes("-loader-"), false);
    const source = await readFile(new URL(`../dist/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\bimport\s*\(|\bimport\s+.+\s+from\s/);
    assert.doesNotMatch(source, /@vite\/client|localhost:3000|127\.0\.0\.1:3000/);
    assert.ok(source.includes("PolarisI18n"));
    assert.ok(source.includes("__POLARIS_CONTENT_SCRIPT_ACTIVE__"));
  }
});

test("production manifest preserves permissions, supported sites, and script timing", () => {
  assert.deepEqual([...distManifest.permissions].sort(), [...sourceManifest.permissions].sort());
  assert.deepEqual(distManifest.host_permissions, sourceManifest.host_permissions);
  assert.equal(distManifest.minimum_chrome_version, "114");
  assert.equal(distManifest.content_scripts.length, 1);
  const built = distManifest.content_scripts[0];
  const source = sourceManifest.content_scripts[0];
  assert.deepEqual([...built.matches].sort(), [...source.matches].sort());
  assert.equal(built.all_frames, source.all_frames);
  assert.equal(built.run_at, source.run_at);
  assert.ok(built.css.length > 0);
  assert.equal(distManifest.background.type, "module");
});

test("production package retains the sidepanel and stable public resources", async () => {
  await access(new URL("../dist/sidepanel.html", import.meta.url));
  await access(new URL("../dist/icons/diagnostics-send.png", import.meta.url));
  await access(new URL("../dist/src/route-bridge.js", import.meta.url));
  await assert.rejects(access(new URL("../dist/polaris-home.html", import.meta.url)), { code: "ENOENT" });
  const html = await readFile(new URL("../dist/sidepanel.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /@vite\/client|localhost|127\.0\.0\.1/);
});
