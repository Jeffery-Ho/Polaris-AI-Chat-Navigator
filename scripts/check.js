import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directories = ["src", "public/src", "scripts", "entrypoints"];
const rootFiles = ["wxt.config.js", "support-config.js"];

function scriptsIn(directory) {
  return readdirSync(path.join(root, directory), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)));
}

const files = [...directories.flatMap(scriptsIn), ...rootFiles].sort();
const failed = files.filter((file) => spawnSync(process.execPath, ["--check", file], { cwd: root, stdio: "inherit" }).status !== 0);
if (failed.length) {
  console.error(`[Polaris] Syntax check failed: ${failed.join(", ")}`);
  process.exit(1);
}
console.log(`[Polaris] Syntax check passed for ${files.length} files.`);
