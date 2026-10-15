import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function referencedExtensionFiles(manifest) {
  const files = [];
  const add = (file) => {
    if (typeof file === "string" && file && !file.includes("*")) {
      files.push(file);
    }
  };
  add(manifest.background?.service_worker);
  add(manifest.side_panel?.default_path);
  add(manifest.devtools_page);
  add(manifest.action?.default_popup);
  add(manifest.options_ui?.page);
  const actionIcon = manifest.action?.default_icon;
  if (typeof actionIcon === "string") {
    add(actionIcon);
  } else if (actionIcon && typeof actionIcon === "object") {
    Object.values(actionIcon).forEach(add);
  }
  Object.values(manifest.icons || {}).forEach(add);
  for (const entry of manifest.content_scripts || []) {
    (entry.js || []).forEach(add);
    (entry.css || []).forEach(add);
  }
  for (const entry of manifest.web_accessible_resources || []) {
    (entry.resources || []).forEach(add);
  }
  return [...new Set(files)];
}

export function validateExtensionPackage(root = process.cwd()) {
  const rootManifest = path.join(root, "manifest.json");
  if (existsSync(rootManifest)) {
    throw new Error("Root manifest.json must not exist. manifest.build.json is the only manifest source; load dist/ after pnpm build.");
  }

  const source = readJson(path.join(root, "manifest.build.json"));
  const built = readJson(path.join(root, "dist", "manifest.json"));
  if (built.version !== source.version || built.version_name !== source.version_name) {
    throw new Error(`Manifest mismatch: manifest.build.json is ${source.version_name}, dist/manifest.json is ${built.version_name}`);
  }

  const buildNumber = source.version_name.match(/\((\d+)\)$/)?.[1] || "";
  if (!/^\d+$/.test(buildNumber) || source.version_name !== `${source.version}(${buildNumber})`) {
    throw new Error(`Invalid version_name: ${source.version_name}`);
  }

  const missing = referencedExtensionFiles(built).filter((file) => !existsSync(path.join(root, "dist", file)));
  if (missing.length > 0) {
    throw new Error(`dist/manifest.json references files missing from dist/: ${missing.join(", ")}`);
  }

  const backgroundPath = path.join(root, "dist", built.background?.service_worker || "");
  if (!existsSync(backgroundPath)) {
    throw new Error("Built background service worker is missing.");
  }
  const background = readFileSync(backgroundPath, "utf8");
  if (!background.includes("getManifest") || !background.includes("executeScript")) {
    throw new Error("Built background does not inject content scripts from the manifest via chrome.runtime.getManifest and chrome.scripting.executeScript.");
  }

  return {
    version: source.version,
    version_name: source.version_name,
    build: buildNumber
  };
}

const entryArg = process.argv[1];
if (entryArg && import.meta.url === pathToFileURL(path.resolve(entryArg)).href) {
  const metadata = validateExtensionPackage();
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, [
      `version=${metadata.version}`,
      `version_name=${metadata.version_name}`,
      `build=${metadata.build}`
    ].join("\n") + "\n");
  }
}
