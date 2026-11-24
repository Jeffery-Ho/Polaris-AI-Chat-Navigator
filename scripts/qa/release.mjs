import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SUPPORTED_PLATFORMS } from "../../src/supported-platforms.js";
import { scenariosFor } from "./scenarios.mjs";

const root = process.cwd();
const parent = path.resolve("Release/qa");
mkdirSync(parent, { recursive: true });
const output = mkdtempSync(path.join(parent, "run-"));
const assets = path.join(output, "assets");
mkdirSync(assets);
const manifest = JSON.parse(readFileSync("manifest.build.json"));
const sha = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
const dirty = spawnSync("git", ["status", "--porcelain", "--untracked-files=normal"], { encoding: "utf8" }).stdout.trim();
const started = Date.now();
const phases = [];
const rows = [];
const packages = [];
const versions = {};
const browsers = ["chrome", "edge", "firefox"];

function run(name, command, args) {
  const since = Date.now();
  console.log("[验收]", name);
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const log = name + ".log";
  writeFileSync(path.join(output, log), [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n"));
  phases.push({ name, ok: result.status === 0, log, seconds: ((Date.now() - since) / 1000).toFixed(1) });
  return result.status === 0;
}
function savePackage(source, filename) {
  const destination = path.join(assets, filename);
  copyFileSync(source, destination);
  packages.push({ filename, digest: createHash("sha256").update(readFileSync(destination)).digest("hex") });
  return destination;
}
function collect(browser, evidence, ready) {
  const batch = [];
  let observed = [];
  if (ready && existsSync(path.join(evidence, "results.json"))) {
    const data = JSON.parse(readFileSync(path.join(evidence, "results.json")));
    if (data.browser !== browser || !Array.isArray(data.results)) throw Error("浏览器报告格式错误");
    versions[browser] = data.version;
    observed = data.results;
  }
  const cases = scenariosFor(browser);
  if (!cases.length) throw Error("浏览器缺少验收场景：" + browser);
  for (const { key } of SUPPORTED_PLATFORMS) {
    for (const scenario of cases) {
      const hits = observed.filter(item => item.platform === key && item.scenario === scenario);
      const item = hits.length === 1 ? hits[0] : null;
      batch.push({ browser, platform: key, scenario, status: item?.status === "pass" && versions[browser] ? "pass" : item?.status === "fail" || hits.length > 1 ? "fail" : "skip", detail: item?.detail || "" });
    }
  }
  rows.push(...batch);
}

run("source", "pnpm", ["check"]);
for (const browser of browsers) {
  const evidence = path.join(output, browser);
  mkdirSync(evidence);
  let ready = false;
  try {
    const built = run("package-" + browser, "pnpm", [browser === "chrome" ? "zip" : "zip:" + browser]);
    if (browser === "chrome" && built) {
      run("metadata", process.execPath, ["scripts/validate-extension-package.js"]);
      run("regression", "pnpm", ["test"]);
    }
    if (built) {
      const stem = "polaris-ai-chat-navigator-" + manifest.version + "-";
      const filename = stem + browser + ".zip";
      const archive = savePackage(path.join("Release/wxt", filename), filename);
      if (browser === "firefox") savePackage(path.join("Release/wxt", stem + "sources.zip"), stem + "sources.zip");
      const unpacked = path.join(output, "unpacked", browser);
      mkdirSync(unpacked, { recursive: true });
      ready = run("unpack-" + browser, "unzip", ["-q", archive, "-d", unpacked]);
      if (ready) run("browser-" + browser, process.execPath, ["scripts/qa/browser.mjs", browser, unpacked, evidence]);
    }
    collect(browser, evidence, ready);
  } catch (error) {
    writeFileSync(path.join(evidence, "error.txt"), error.message);
    phases.push({ name: browser, ok: false, log: browser + "/error.txt", seconds: "—" });
    collect(browser, evidence, false);
  }
}
const ok = packages.length === 4 && phases.every(x => x.ok) && rows.length > 0 && rows.every(x => x.status === "pass");
const count = (group, status) => group.filter(row => row.status === status).length;
const lines = [
  "# Polaris 发布前离线验收", "",
  "结论：" + (ok ? "通过" : "未通过") + "。版本 " + manifest.version_name + "，提交 " + sha + (dirty ? "（包含工作树改动）" : "") + "。",
  "开始时间 " + new Date(started).toISOString() + "，总耗时 " + Math.round((Date.now() - started) / 1000) + " 秒。",
  "", "浏览器场景通过 " + count(rows, "pass") + "，失败 " + count(rows, "fail") + "，未运行或结果缺失 " + count(rows, "skip") + "。",
  "", "| 阶段 | 结果 | 秒 |", "|---|---|---:|",
  ...phases.map(x => "| [" + x.name + "](" + x.log + ") | " + (x.ok ? "通过" : "失败") + " | " + x.seconds + " |"),
  "", "| 浏览器 | 实测版本 | 平台 | 场景 | 结果 |", "|---|---|---|---|---|",
  ...rows.map(x => "| " + [x.browser, versions[x.browser] || "未取得", x.platform, x.scenario, ({pass:"通过",fail:"失败",skip:"未运行或缺测"})[x.status]].join(" | ") + " |"),
  "", "## 失败明细", "",
  ...rows.filter(x => x.status === "fail").map(x => "- " + x.browser + " / " + x.platform + " / " + x.scenario + "：" + x.detail),
  "", "## 候选包 SHA-256", "", ...packages.map(p => "- " + p.filename + " " + p.digest),
  "", "## 证据", "", ...browsers.map(b => "- [" + b + "](" + b + "/)"), ""
];
const report = lines.join("\n");
writeFileSync(path.join(output, "report.md"), report);
writeFileSync(path.join(assets, "SHA256SUMS"), packages.map(p => p.digest + "  " + p.filename).join("\n") + "\n");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, "output=" + output + "\n");
console.log(path.join(output, "report.md"));
process.exitCode = ok ? 0 : 1;
