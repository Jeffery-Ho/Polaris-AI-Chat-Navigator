import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SUPPORTED_PLATFORMS } from "../../src/supported-platforms.js";

const results = [];
const reportDir = process.argv[2] || "_local/qa/live";
const extension = path.resolve("dist");
let configs;
try {
  configs = JSON.parse(process.env.POLARIS_SMOKE_ACCOUNTS || "{}");
  if (!configs || typeof configs !== "object" || Array.isArray(configs)) configs = null;
} catch {
  configs = null;
}
delete process.env.POLARIS_SMOKE_ACCOUNTS;

// Explicit parent domains used by supported sites with subdomain-scoped entrypoints.
const cookieParents = new Set(["google.com", "doubao.com", "tencent.com", "xiaohongshu.com", "deepseek.com", "openai.com"]);

function validate(platform, config) {
  const hosts = [new URL(platform.url).hostname, ...(platform.alternateHosts || [])];
  if (!config || !Array.isArray(config.cookies) || !config.cookies.length) return false;
  const conversations = [config.a, config.b];
  return config.a?.url !== config.b?.url && config.a?.marker !== config.b?.marker &&
    conversations.every(entry => {
      const url = new URL(entry.url);
      return url.protocol === "https:" && hosts.includes(url.hostname) && !url.username && !url.password &&
        typeof entry.marker === "string" && entry.marker.trim().length > 0;
    }) && config.cookies.every(cookie => {
      const domain = cookie.domain?.replace(/^\./, "");
      return domain && hosts.some(host => host === domain || (cookieParents.has(domain) && host.endsWith("." + domain))) &&
        cookie.name && typeof cookie.value === "string" && !cookie.url;
    });
}

async function diagnose(page) {
  if (await page.locator('iframe[src*="captcha" i], iframe[title*="challenge" i], input[autocomplete="one-time-code"]').first().isVisible()) return "验证码";
  if (/\/(login|sign-in|signin|auth)(\/|$)/i.test(new URL(page.url()).pathname) ||
      await page.locator('input[type=password], input[autocomplete=username]').first().isVisible()) return "登录失效";
  return null;
}

async function smoke(platform) {
  let step = "账号配置";
  let profile, context;
  let category = "配置错误";
  const config = configs?.[platform.key];
  try {
    if (configs && !config) return [step, "账号未配置"];
    if (!validate(platform, config)) return [step, category];
    step = "启动隔离浏览器";
    category = "环境错误";
    const { chromium } = await import("playwright");
    profile = await mkdtemp(path.join(tmpdir(), "polaris-live-"));
    context = await chromium.launchPersistentContext(profile, {
      channel: "chromium",
      args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension],
      env: { PATH: process.env.PATH, HOME: profile, LANG: "en_US.UTF-8" }
    });
    category = "配置错误";
    await context.addCookies(config.cookies);
    const page = await context.newPage();
    for (const key of ["a", "b"]) {
      step = key === "a" ? "页面识别" : "会话切换";
      const entry = config[key];
      category = "网络异常";
      const response = await page.goto(entry.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      const gate = await diagnose(page);
      if (gate) return [step, gate];
      if ([401,403,429].includes(response?.status())) return [step, response.status() === 401 ? "登录失效" : "访问受限"];
      if (!response?.ok()) return [step, category];
      step = key === "a" ? "目录生成" : "切换后目录";
      category = "功能失败";
      await page.locator("#gpt-paragraph-nav").waitFor({ state: "attached", timeout: 15000 });
      await page.waitForFunction(({wanted, previous}) => {
        const nodes = [...document.querySelectorAll("#gpt-paragraph-nav-list [data-marker-item-type]")];
        const titles = nodes.map(n => [n.title, n.textContent, n.getAttribute("aria-label")].join(" "));
        return titles.some(t => t.includes(wanted)) && (!previous || titles.every(t => !t.includes(previous)));
      }, { wanted: entry.marker, previous: key === "b" ? config.a.marker : "" }, { timeout: 15000 });
    }
    return [step, "通过"];
  } catch {
    const page = context?.pages().at(-1);
    return [step, (page && await diagnose(page).catch(() => null)) || category];
  } finally {
    try {
      await context?.close();
    } finally {
      if (profile) await rm(profile, { recursive: true, force: true });
    }
  }
}

for (const platform of SUPPORTED_PLATFORMS) {
  const [step, outcome] = await smoke(platform).catch(() => ["清理隔离环境", "环境错误"]);
  results.push([platform.label, step, new Date().toISOString(), outcome]);
}
await mkdir(reportDir, {recursive: true});
const table = ["| 平台 | 步骤 | 时间（UTC） | 结果 |", "|---|---|---|---|", ...results.map(row => "| " + row.join(" | ") + " |")].join("\n");
await writeFile(path.join(reportDir, "report.md"), table + "\n");
console.log(table);
process.exitCode = Number(results.some(row => row[3] !== "通过"));
