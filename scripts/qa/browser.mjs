import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { SUPPORTED_PLATFORMS } from "../../src/supported-platforms.js";
import { expected, fixturePage, fixtureURL } from "../../test-support/release-fixtures.js";
import { scenariosFor } from "./scenarios.mjs";

const [browser, packagePath, evidencePath] = process.argv.slice(2);
assert.ok(["chrome", "edge", "firefox"].includes(browser));
const out = path.resolve(evidencePath);
await mkdir(out, { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), "polaris-qa-"));
const results = [];
let version = null;
let runner;
const scenarios = scenariosFor(browser);

export async function until(check, message, timeout = 12000) {
  const start = Date.now();
  let last;
  do {
    try { const value = await check(); if (value) return value; } catch (error) { last = error; }
    await delay(150);
  } while (Date.now() - start < timeout);
  throw Error(message + (last ? ' (' + last.message + ')' : ''));
}

async function verifyExport(key, session) {
  const before = new Set(await readdir(runner.downloadDir));
  await runner.panel(() => document.querySelector(".conversation-copy-button:not(:disabled)")?.click());
  await until(() => runner.panel(() => {
    const button = document.querySelector("dialog[open] .conversation-export-save");
    if (!button) return false;
    button.click(); return true;
  }), "导出对话框未打开");
  const markdown = await until(async () => {
    const files = await readdir(runner.downloadDir);
    const name = files.find(name => !before.has(name) && name.endsWith(".md"));
    if (!name || files.some(name => /\.(part|crdownload)$/.test(name))) return false;
    return readFile(path.join(runner.downloadDir,name),"utf8");
  }, "未收到完整的 Markdown 下载文件");
  const { prompts, heading, listItem, tableCell, code } = expected(session);
  await writeFile(path.join(out,key+"-"+session+"-export.md"),markdown);
  for (const token of [...prompts, heading, listItem, tableCell, code]) assert.ok(markdown.includes(token), '导出缺少 ' + token);
  for (const token of expected(session === "A" ? "B" : "A").prompts) assert.ok(!markdown.includes(token), '导出混入其他会话 ' + token);
  if (browser === "chrome") {
    const clipboard = await runner.panel(() => navigator.clipboard.readText());
    for (const token of [...prompts, heading, listItem, tableCell, code]) assert.ok(clipboard.includes(token), "复制内容缺少 " + token);
    for (const token of expected(session === "A" ? "B" : "A").prompts) assert.ok(!clipboard.includes(token), "剪贴板混入其他会话 " + token);
  }
  await runner.panel(() => document.querySelector(".conversation-export-close")?.click());
}

async function runPlatform(key) {
  const a = expected("A");
  let next = 0;
  const start = Date.now();
  async function step(work) {
    await work();
    results.push({ platform: key, scenario: scenarios[next++], status: "pass" });
  }
  try {
    await runner.begin(key);
    await step(async () => {
      await runner.goto(fixtureURL(key));
      await until(() => runner.source(() => !!document.querySelector("#gpt-paragraph-nav")), "正式内容脚本未注入");
    });
    await step(async () => {
      await runner.openPanel();
      const favicon = SUPPORTED_PLATFORMS.find(platform => platform.key === key).favicon;
      await until(() => runner.panel(favicon => document.querySelector(".window-platform-icon")?.src.endsWith("/" + favicon),favicon), "侧栏未识别当前平台 " + key);
      await until(() => runner.panel(() => {
        const tab = document.querySelector('[data-window-tab="chapters"]');
        if (!tab) return false;
        if (tab.getAttribute("aria-pressed") !== "true") tab.click();
        return true;
      }), "原生侧栏未显示");
      await until(() => runner.panel(text => [...document.querySelectorAll(".chapter-node-title")].some(n => n.textContent.includes(text)), a.prompts[0]), "目录未收到首轮消息 " + a.prompts[0]);
    });
    await step(async () => {
      await runner.panel(text => {
        const title = [...document.querySelectorAll(".chapter-node-title")].find(n => n.textContent.includes(text));
        if (title?.getAttribute("aria-expanded") === "false") title.click();
      }, a.prompts[0]);
      await runner.source(() => { document.querySelector("main").scrollTop = 0; });
      assert.equal(await runner.source(() => {
        const main = document.querySelector("main").getBoundingClientRect();
        return document.querySelector("#fixture-heading").getBoundingClientRect().top < main.bottom;
      }), false, "跳转前目标应在滚动容器外");
      await runner.panel(text => {
        const title = [...document.querySelectorAll(".chapter-node-title")].find(n => n.textContent.includes(text));
        if (!title) throw Error("找不到跳转标题 " + text);
        title.closest(".chapter-node-row").querySelector(".chapter-node-dot").click();
        const locate = [...document.querySelectorAll(".chapter-menu-item")].find(n => /定位原文|Locate in conversation/i.test(n.textContent));
        if (!locate || locate.disabled) throw Error("定位操作不可用");
        locate.click();
      }, a.heading);
      await until(() => runner.source(() => {
        const r = document.querySelector("#fixture-heading").getBoundingClientRect();
        const main = document.querySelector("main").getBoundingClientRect();
        return r.top >= Math.max(0, main.top)-1 && r.bottom <= Math.min(innerHeight, main.bottom)+1;
      }), "跳转目标在视口外");
    });
    await step(() => verifyExport(key,"A"));
    if (browser !== "chrome") return;
    await step(async () => {
      await runner.panel(text => {
        const node = [...document.querySelectorAll(".chapter-node-title")].find(n => n.textContent.includes(text));
        if (!node) throw Error("找不到折叠节点");
        const old = node.getAttribute("aria-expanded"); node.click();
        const fresh = [...document.querySelectorAll(".chapter-node-title")].find(n => n.textContent.includes(text));
        if (fresh?.getAttribute("aria-expanded") === old) throw Error("展开状态未变化");
        const input = document.querySelector(".window-search input"); input.value = text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, a.prompts[0]);
      await until(() => runner.panel(([query, other]) => {
        const titles = [...document.querySelectorAll(".chapter-node-title")].map(n => n.textContent);
        return titles.some(title => title.includes(query)) && titles.every(title => !title.includes(other));
      }, a.prompts), "搜索结果与预期轮次不符");
      await runner.panel(() => { const input = document.querySelector(".window-search input"); input.value = ""; input.dispatchEvent(new Event("input",{bubbles:true})); });
    });
    await step(async () => {
      await runner.source(() => document.querySelector("#fixture-stream").click());
      await until(() => runner.panel(text => {
        for (const node of document.querySelectorAll('.chapter-node-title[aria-expanded="false"]')) node.click();
        return [...document.querySelectorAll(".chapter-node-title")].filter(n => n.textContent.includes(text)).length === 1;
      }, a.streamedHeading), "流式标题缺失或重复");
      await runner.source(() => document.querySelector("#fixture-switch").click());
      await until(() => runner.panel(text => document.querySelector(".chapter-tree-reader")?.textContent.includes(text), expected("B").prompts[0]), "目录未切换至 B");
      assert.equal(await runner.panel(text => document.querySelector(".chapter-tree-reader").textContent.includes(text), a.prompts[0]), false);
      await verifyExport(key,"B");
    });
  } catch (error) {
    await runner.capture(key).catch(() => {});
    results.push({ platform:key, scenario:scenarios[next++], status:"fail", detail:error.message });
  } finally {
    while(next < scenarios.length) results.push({ platform:key, scenario:scenarios[next++], status:"skip", detail:"前置步骤失败" });
    await runner.end(key, results.some(r => r.platform === key && r.status === "fail"));
    console.log(key, Date.now()-start, results.filter(r=>r.platform===key).map(r=>r.status).join("/"));
  }
}

try {
  const module = await import(browser === "firefox" ? "./firefox.mjs" : "./chromium.mjs");
  runner = await module.launch({browser, profile, out, packagePath:path.resolve(packagePath), fixturePage, fixtureURL, until});
  version = runner.version;
  for (const {key} of SUPPORTED_PLATFORMS) await runPlatform(key);
} catch (error) {
  console.error(error.message);
  for (const {key} of SUPPORTED_PLATFORMS) for (const scenario of scenarios) {
    if (!results.some(r => r.platform===key && r.scenario===scenario)) results.push({platform:key,scenario,status:"skip",detail:error.message});
  }
} finally {
  try { await runner?.close(); } finally {
    await writeFile(path.join(out,"results.json"),JSON.stringify({browser,version,results},null,2));
    await rm(profile,{recursive:true,force:true});
  }
}
if (results.some(row=>row.status!=="pass")) process.exitCode=1;
