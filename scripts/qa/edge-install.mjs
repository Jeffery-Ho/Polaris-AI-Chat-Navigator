import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const executeFile = promisify(execFile);
const exec = (program, args, options) => executeFile(program, args, {timeout: 15000, ...options});

// The folder chooser belongs to the browser process; Playwright's page
// filechooser event only covers file inputs owned by a web page.
async function selectLinuxFolder(directory, browserPid, evidencePath) {
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
      if (windows.trim().split(/\s+/).includes(id)) {
        // GTK keeps focus in the location entry after autocompleting the folder.
        // Its Open action is anchored to the bottom-right of this native window.
        const {stdout: geometry} = await exec("xdotool", ["getwindowgeometry", "--shell", id]);
        const dimension = key => Number(geometry.match(new RegExp("^" + key + "=(\\d+)$", "m"))?.[1]);
        const x = dimension("WIDTH") - 48;
        const y = dimension("HEIGHT") - 22;
        if (!(x > 0 && y > 0)) throw new Error("无法取得 Edge 目录选择器的尺寸");
        await exec("xdotool", ["mousemove", "--window", id, String(x), String(y), "click", "1"]);
        await delay(600);
        const remaining = await exec("xdotool", ["search", "--onlyvisible", "--pid", String(browserPid)]).catch(() => ({stdout: ""}));
        if (remaining.stdout.trim().split(/\s+/).includes(id)) {
          await exec("xdotool", ["mousemove", "--window", id, String(x), String(y), "click", "1"]);
          if (evidencePath && process.env.GITHUB_ACTIONS) {
            await exec("xwd", ["-silent", "-id", id, "-out", path.join(evidencePath, "edge-folder.xwd")]).catch(() => {});
          }
        }
      }
      return;
    }
    await delay(250);
  }
  throw new Error("Edge 系统目录选择器未出现，请检查 DISPLAY、GTK 和 xdotool");
}

async function selectMacFolder(directory, browserPid) {
  const {stdout: sessionState} = await exec("ioreg", ["-n", "Root", "-d1", "-w0"]);
  if (/"CGSSessionScreenIsLocked"=Yes/.test(sessionState)) {
    throw new Error("macOS 屏幕已锁定，无法操作 Edge 的系统目录选择器");
  }
  const script = `on run args
    set wantedPID to item 1 of args as integer
    set wantedPath to item 2 of args
    tell application "System Events"
      set edgeProcess to first application process whose unix id is wantedPID
      tell edgeProcess
        set frontmost to true
        set foundChooser to false
        repeat 40 times
          if exists (first window whose name contains "Extensions") then
            set chooserWindow to first window whose name contains "Extensions"
            if exists sheet 1 of chooserWindow then
              set foundChooser to true
              exit repeat
            end if
          end if
          delay 0.25
        end repeat
        if not foundChooser then error ("Edge 系统目录选择器未出现；窗口 " & (name of windows as string))
        set frontmost to true
        set chooserWindow to first window whose name contains "Extensions"
        set chooserSheet to sheet 1 of chooserWindow
        keystroke "g" using {command down, shift down}
        repeat 30 times
          if exists text field 1 of sheet 1 of chooserSheet then exit repeat
          delay 0.15
        end repeat
        set pathField to text field 1 of sheet 1 of chooserSheet
        set value of pathField to wantedPath
        key code 124
        keystroke "/"
        delay 0.6
        if (value of pathField as string) does not start with wantedPath then error "系统目录输入不符"
        key code 36
        repeat 30 times
          if not (exists sheet 1 of chooserSheet) then exit repeat
          delay 0.15
        end repeat
        delay 0.3
        tell splitter group 1 of chooserSheet
          set chooserFolder to value of pop up button "Where:"
          if not (wantedPath ends with ("/" & chooserFolder)) then error ("系统文件选择器未进入候选目录 (" & chooserFolder & ")")
          click button "Select"
        end tell
      end tell
    end tell
  end run`;
  await exec("osascript", ["-e", script, String(browserPid), directory], {timeout: 20000});
}

export async function installEdgeExtension(context, extensionPath, evidencePath) {
  const directory = await realpath(extensionPath);
  const page = await context.newPage();
  const session = await context.browser().newBrowserCDPSession();
  if (evidencePath) await context.tracing.start({ screenshots: true, snapshots: true });
  let failed = false;
  try {
    const {processInfo} = await session.send("SystemInfo.getProcessInfo");
    const pid = processInfo.find(p => p.type === "browser")?.id;
    if (!pid) throw new Error("无法确认 Edge 测试进程");
    await page.goto("edge://extensions/");
    const load = page.getByText(/^(Load unpacked(?: extension)?|加载解压缩(?:的扩展)?|加载已解压(?:的扩展程序)?|加载解包(?:的扩展)?)[…\.]?$/i).filter({visible:true}).first();
    if (!(await load.isVisible())) {
      const toggle = page.locator("fluent-switch#dev-switch:visible").first();
      await toggle.click({timeout: 10000});
      await load.waitFor({state: "visible", timeout: 5000});
    }
    await load.click({timeout: 10000, noWaitAfter: true});
    if (process.platform === "darwin") await selectMacFolder(directory, pid);
    else if (process.platform === "linux") await selectLinuxFolder(directory, pid, evidencePath);
    else throw new Error("Edge 自动目录选择当前支持 macOS 和 Linux");
    await page.getByText(/Polaris/i).filter({visible:true}).first().waitFor({timeout: 15000});
    const extensions = await page.evaluate(() => new Promise(resolve => chrome.developerPrivate.getExtensionsInfo({}, resolve)));
    if (!extensions.some(item => item.path === directory)) {
      throw new Error("Edge 安装目录与本次候选包路径不符。已加载 " + JSON.stringify(extensions.map(item => item.path)));
    }
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
