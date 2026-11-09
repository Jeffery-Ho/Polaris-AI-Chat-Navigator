import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PRODUCTION_BILLING_ORIGIN = "https://polaris-license-production.hexianji.workers.dev";

export function evaluateRelease({ health, packageText, sourceText = "" }) {
  const errors = [];
  if (health?.env !== "production" || health?.billingReady !== true) {
    errors.push("production license health is not billingReady");
    errors.push("STRIPE_SECRET_KEY must be a live sk_live_ or rk_live_ key on polaris-license-production");
    errors.push("STRIPE_WEBHOOK_SECRET must sign the live webhook at https://polaris-license-production.hexianji.workers.dev/api/stripe/webhook");
    errors.push("STRIPE_PRICE_PRO_PROMO must be the live one-time Price for USD 12.90 during the server-recorded 7-day trial");
    errors.push("STRIPE_PRICE_PRO_DEFAULT must be the live one-time Price for USD 19.99 after that trial");
  }
  if (!packageText.includes(PRODUCTION_BILLING_ORIGIN)) {
    errors.push("extension package does not call the production license Worker");
  }
  if (packageText.includes("polaris-license-test")) {
    errors.push("extension package contains the test license Worker");
  }
  if (sourceText.includes("polaris-license-test")) {
    errors.push("billing source contains the test license Worker");
  }
  if (sourceText && !sourceText.includes(PRODUCTION_BILLING_ORIGIN)) {
    errors.push("billing source does not call the production license Worker");
  }
  return errors;
}

function packageText(root) {
  const manifestPath = path.join(root, "dist", "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const worker = manifest.background?.service_worker;
  if (!worker) throw new Error("Built manifest has no service worker.");
  return JSON.stringify(manifest) + "\n" + readFileSync(path.join(root, "dist", worker), "utf8");
}

async function main() {
  const response = await fetch(`${PRODUCTION_BILLING_ORIGIN}/health`);
  if (!response.ok) throw new Error(`Production health returned HTTP ${response.status}.`);
  const health = await response.json();
  const root = process.cwd();
  const errors = evaluateRelease({
    health,
    packageText: packageText(root),
    sourceText: readFileSync(path.join(root, "src", "billing-config.js"), "utf8")
  });
  if (errors.length > 0) {
    console.error("Chrome release gate is closed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Chrome release gate is open for ${health.env} ${health.version}.`);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  await main();
}
