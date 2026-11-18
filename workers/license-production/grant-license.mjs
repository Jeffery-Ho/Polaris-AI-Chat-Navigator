#!/usr/bin/env node
// Usage: pnpm license:grant buyer@example.com
// Token: POLARIS_ADMIN_TOKEN env var, or the ignored file workers/license-production/.admin-token.
import { readFileSync } from "node:fs";

const API = "https://polaris-license-production.hexianji.workers.dev/api/admin/grant-license";
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
