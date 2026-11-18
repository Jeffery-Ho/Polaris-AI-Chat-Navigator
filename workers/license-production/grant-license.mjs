#!/usr/bin/env node
// Usage: pnpm license:grant buyer@example.com
// Token: POLARIS_ADMIN_TOKEN env var, or the ignored file workers/license-production/.admin-token.
// Proxy: HTTPS_PROXY if set, otherwise the macOS system HTTPS proxy.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const API = "https://polaris-license-production.hexianji.workers.dev/api/admin/grant-license";

function systemProxy() {
  try {
    const out = execFileSync("scutil", ["--proxy"], { encoding: "utf8" });
    const field = (name) => out.match(new RegExp(`${name} : (\\S+)`))?.[1];
    if (field("HTTPSEnable") === "1" && field("HTTPSProxy") && field("HTTPSPort")) return `http://${field("HTTPSProxy")}:${field("HTTPSPort")}`;
  } catch {}
  return null;
}

// Node's fetch reads proxy env vars only at startup, so re-run once with them set.
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || systemProxy();
if (proxy && (process.env.NODE_USE_ENV_PROXY !== "1" || !(process.env.HTTPS_PROXY || process.env.https_proxy))) {
  const run = spawnSync(process.execPath, process.argv.slice(1), { stdio: "inherit", env: { ...process.env, HTTPS_PROXY: proxy, NODE_USE_ENV_PROXY: "1" } });
  process.exit(run.status ?? 1);
}

const email = process.argv[2];
if (!email) {
  console.error("Usage: pnpm license:grant <email>");
  process.exit(1);
}
const token = process.env.POLARIS_ADMIN_TOKEN || readFileSync(new URL("./.admin-token", import.meta.url), "utf8").trim();
const response = await fetch(API, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ email })
});
console.log(response.status, JSON.stringify(await response.json()));
if (!response.ok) process.exit(1);
