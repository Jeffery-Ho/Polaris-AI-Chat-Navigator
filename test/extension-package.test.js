import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateExtensionPackage } from "../scripts/validate-extension-package.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function writePackage(root, { rootManifest = false, builtManifest, background = "chrome.runtime.getManifest();chrome.scripting.executeScript();" } = {}) {
  const manifest = builtManifest || {
    version: "0.0.1",
    version_name: "0.0.1(1)",
    background: { service_worker: "background.js" },
    icons: { "16": "icons/icon.png" },
    content_scripts: [{ js: ["assets/i18n.js", "src/content.js"], css: ["src/styles.css"] }]
  };
  await mkdir(path.join(root, "dist", "assets"), { recursive: true });
  await mkdir(path.join(root, "dist", "icons"), { recursive: true });
  await mkdir(path.join(root, "dist", "src"), { recursive: true });
  await writeFile(path.join(root, "manifest.build.json"), JSON.stringify(manifest));
  await writeFile(path.join(root, "dist", "manifest.json"), JSON.stringify(manifest));
  await writeFile(path.join(root, "dist", "background.js"), background);
  await writeFile(path.join(root, "dist", "assets", "i18n.js"), "");
  await writeFile(path.join(root, "dist", "src", "content.js"), "");
  await writeFile(path.join(root, "dist", "src", "styles.css"), "");
  await writeFile(path.join(root, "dist", "icons", "icon.png"), "");
  if (rootManifest) {
    await writeFile(path.join(root, "manifest.json"), "{}\n");
  }
}

test("当前仓库只承认 dist 扩展包", () => {
  const metadata = validateExtensionPackage(repoRoot);
  assert.equal(metadata.version_name, `${metadata.version}(${metadata.build})`);
});

test("根目录 manifest 或缺失的 dist 引用会使校验失败", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "polaris-package-"));
  try {
    await writePackage(root, { rootManifest: true });
    assert.throws(() => validateExtensionPackage(root), /Root manifest\.json must not exist/);

    await rm(path.join(root, "manifest.json"));
    const built = JSON.parse(await readFile(path.join(root, "dist", "manifest.json"), "utf8"));
    built.content_scripts[0].js.push("assets/missing-hashed.js");
    await writeFile(path.join(root, "dist", "manifest.json"), JSON.stringify(built));
    await writeFile(path.join(root, "manifest.build.json"), JSON.stringify(built));
    assert.throws(() => validateExtensionPackage(root), /references files missing from dist/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
