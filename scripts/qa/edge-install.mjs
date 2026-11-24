import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const exec = promisify(execFile);

// The folder chooser belongs to the browser process; Playwright's page
// filechooser event only covers file inputs owned by a web page.
async function selectLinuxFolder(directory, browserPid) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const { stdout } = await exec("xdotool", ["search", "--onlyvisible", "--pid", String(browserPid), "--name", "[Ss]elect|[Ff]older|[Dd]irectory|[Oo]pen"])
      .catch(() => ({ stdout: "" }));
    for (const id of stdout.trim().split(/\s+/).filter(Boolean)) {
      const {stdout: title} = await exec("xdotool", ["getwindowname", id]);
      if (!/select|folder|directory|open/i.test(title) || /microsoft edge/i.test(title)) continue;
      await exec("xdotool", ["windowfocus", "--sync", id]);
      await exec("xdotool", ["key", "--clearmodifiers", "ctrl+l"]);
      await delay(200);
      await exec("xdotool", ["type", "--clearmodifiers", "--delay", "2", directory]);
      await exec("xdotool", ["key", "Return"]);
      await delay(500);
      const {stdout: windows} = await exec("xdotool", ["search", "--onlyvisible", "--pid", String(browserPid)]).catch(() => ({stdout: ""}));
      if (windows.trim().split(/\s+/).includes(id)) await exec("xdotool", ["key", "--window", id, "Return"]);
      return;
    }
    await delay(250);
  }
  throw new Error("Edge 系统目录选择器未出现，请检查 DISPLAY、GTK 和 xdotool");
}

async function selectMacFolder(directory, browserPid) {
  const script = `on run args
    set wantedPID to item 1 of args as integer
    set wantedPath to item 2 of args
    tell application "System Events"
      set edgeProcess to first application process whose unix id is wantedPID
      tell edgeProcess
        set foundChooser to false
        repeat 40 times
          if exists window 1 then
            if (exists sheet 1 of window 1) or (subrole of window 1 is "AXDialog") then
              set foundChooser to true
              exit repeat
            end if
          end if
          delay 0.25
        end repeat
        if not foundChooser then error "Edge 系统目录选择器未出现"
        set frontmost to true
        keystroke "g" using {command down, shift down}
        delay 0.4
        keystroke wantedPath
        key code 36
        delay 0.6
        key code 36
      end tell
    end tell
  end run`;
  await exec("osascript", ["-e", script, String(browserPid), directory], {timeout: 20000});
}

export async function installEdgeExtension(context, extensionPath, evidencePath) {
  const directory = await realpath(extensionPath);
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  const page = await context.newPage();
  const session = await context.browser().newBrowserCDPSession();
  if (evidencePath) await context.tracing.start({ screenshots: true, snapshots: true });
  let failed = false;
  try {
    const {processInfo} = await session.send("SystemInfo.getProcessInfo");
    const pid = processInfo.find(p => p.type === "browser")?.id;
    if (!pid) throw new Error("无法确认 Edge 测试进程");
    await page.goto("edge://extensions/");
    const load = page.getByText(/^(Load unpacked(?: extension)?|加载解压缩(?:的扩展)?|加载已解压(?:的扩展程序)?|加载解包(?:的扩展)?)[…\.]?$/i).first();
    if (!(await load.isVisible())) {
      const toggle = page.locator("fluent-switch#dev-switch");
      await toggle.click({timeout: 10000});
      if (!await toggle.evaluate(el => el.checked || el.getAttribute("aria-checked") === "true")) {
        throw new Error("Edge 开发人员模式未开启");
      }
    }
    await load.click({timeout: 10000, noWaitAfter: true});
    if (process.platform === "darwin") await selectMacFolder(directory, pid);
    else if (process.platform === "linux") await selectLinuxFolder(directory, pid);
    else throw new Error("Edge 自动目录选择当前支持 macOS 和 Linux");
    await page.getByText(/Polaris/i).first().waitFor({timeout: 15000});
    const extensionWorker = context.serviceWorkers().find(worker => worker.url().startsWith("chrome-extension://") && worker.url().endsWith(manifest.background.service_worker));
    const worker = extensionWorker || await context.waitForEvent("serviceworker", {
      predicate: worker => worker.url().startsWith("chrome-extension://") && worker.url().endsWith(manifest.background.service_worker),
      timeout: 10000
    });
    let installed;
    for (let attempt = 0; attempt < 25 && !installed; attempt++) {
      installed = await worker.evaluate(() => globalThis.chrome?.runtime?.getManifest?.()?.version);
      if (!installed) await delay(200);
    }
    if (installed !== manifest.version) throw new Error("已安装的 Edge 扩展版本与候选包不符");
  } catch (error) {
    failed = true;
    if (evidencePath) await writeFile(path.join(evidencePath, "edge-manager.txt"), await page.locator("body").ariaSnapshot().catch(() => "无法读取扩展管理页")).catch(() => {});
    if (evidencePath) await page.screenshot({ path: path.join(evidencePath, "edge-manager.png"), timeout: 3000 }).catch(() => {});
    throw error;
  } finally {
    if (evidencePath) await context.tracing.stop(failed ? { path: path.join(evidencePath, "edge-install-trace.zip") } : {});
    await session.detach();
    await page.close();
  }
}
