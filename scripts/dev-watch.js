import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync, watch } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const watchDirectories = ["src", "icons", "assets"];
const rootFiles = new Set([
  "manifest.build.json",
  "vite.config.js",
  "sidepanel.html",
  "support.html",
  "support-config.js",
  "privacy-policy.html"
]);
const ignoredDirectories = new Set(["dist", "node_modules", ".git"]);

export function isExtensionSource(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  if (!normalized || normalized === "dist" || normalized.startsWith("dist/")) return false;
  if (normalized === "node_modules" || normalized.startsWith("node_modules/")) return false;
  if (normalized === ".git" || normalized.startsWith(".git/")) return false;
  if (rootFiles.has(normalized)) return true;
  return watchDirectories.some((dir) => normalized === dir || normalized.startsWith(`${dir}/`));
}

let timer = null;
let child = null;
let pending = false;
const watchers = [];

function runBuild() {
  if (child) {
    pending = true;
    return;
  }
  pending = false;
  const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(viteBin)) {
    console.warn("[Polaris] vite is not installed. Run pnpm install, then pnpm dev again.");
    return;
  }
  console.log("[Polaris] rebuilding dist/");
  child = spawn(process.execPath, [viteBin, "build"], {
    cwd: root,
    stdio: "inherit"
  });
  child.on("exit", (code) => {
    child = null;
    if (code !== 0) {
      console.warn("[Polaris] rebuild failed. dist/ stays incomplete until the next successful save.");
    }
    if (pending) schedule();
  });
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(runBuild, 200);
}

function watchDirectory(dir) {
  watchers.push(watch(dir, (_event, filename) => {
    if (!filename || ignoredDirectories.has(filename) || filename.startsWith(".")) return;
    const childPath = path.join(dir, filename);
    let isDirectory = false;
    try {
      isDirectory = statSync(childPath).isDirectory();
    } catch {
      isDirectory = false;
    }
    if (isDirectory) watchDirectory(childPath);
    const relativePath = path.relative(root, isDirectory ? childPath : path.join(dir, filename));
    if (isExtensionSource(relativePath)) schedule();
  }));
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || ignoredDirectories.has(entry.name) || entry.name.startsWith(".")) continue;
    watchDirectory(path.join(dir, entry.name));
  }
}

function start() {
  for (const dir of watchDirectories) {
    const absolute = path.join(root, dir);
    if (existsSync(absolute)) watchDirectory(absolute);
  }
  watchers.push(watch(root, (_event, filename) => {
    if (filename && rootFiles.has(filename)) schedule();
  }));
  runBuild();
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (entry === import.meta.url) start();
