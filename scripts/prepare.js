import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function shouldInstallGitHooks(env = process.env) {
  return !env.CI && !env.GITHUB_ACTIONS;
}

function installGitHooks() {
  if (!shouldInstallGitHooks() || !existsSync(path.join(root, ".git"))) {
    return;
  }
  const configured = spawnSync("git", ["config", "core.hooksPath", ".githooks"], {
    cwd: root,
    stdio: "inherit"
  });
  if (configured.status !== 0) {
    console.warn("[Polaris] Could not set core.hooksPath. Checkout and merge will not rebuild dist/ until git hooks are enabled.");
  }
}

function runWxt(command) {
  const wxtBin = path.join(root, "node_modules", "wxt", "bin", "wxt.mjs");
  const build = spawnSync(process.execPath, [wxtBin, command], {
    cwd: root,
    stdio: "inherit"
  });
  if (build.status !== 0) {
    process.exit(build.status === null ? 1 : build.status);
  }
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (entry === import.meta.url) {
  runWxt("prepare");
  installGitHooks();
  if (shouldInstallGitHooks()) runWxt("build");
}
