import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { installEdgeExtension } from "./edge-install.mjs";

// Native side panels are CDP "other" targets. Playwright Page covers the
// source tab; attach to the actual panel target to operate its document.
async function devtools(profile) {
  const [port, endpoint] = (await readFile(path.join(profile,"DevToolsActivePort"),"utf8")).trim().split("\n");
  const socket = new WebSocket("ws://127.0.0.1:" + port + endpoint);
  await new Promise((resolve,reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = ({data}) => {
    const message = JSON.parse(data);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(Error(message.error.message)); else waiter.resolve(message.result);
  };
  const call = (method, params = {}, sessionId) => new Promise((resolve,reject) => {
    const current = ++id;
    const timer = setTimeout(() => {pending.delete(current); reject(Error("CDP timeout: " + method));},8000);
    pending.set(current,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
    socket.send(JSON.stringify({id:current,method,params,sessionId}));
  });
  return {call,close:()=>socket.close()};
}

export async function launch({ browser, profile, out, packagePath, fixturePage, fixtureURL, until }) {
  const isEdge = browser === "edge";
  const executablePath = process.env[isEdge ? "POLARIS_EDGE_PATH" : "POLARIS_CHROME_PATH"];
  assert.ok(executablePath,"缺少 " + (isEdge ? "POLARIS_EDGE_PATH" : "POLARIS_CHROME_PATH"));
  if (!isEdge) assert.match(execFileSync(executablePath,["--version"],{encoding:"utf8"}),/Google Chrome for Testing/i,"需要 Chrome for Testing");
  const downloadDir = path.join(profile,"downloads");
  await mkdir(downloadDir);
  const context = await chromium.launchPersistentContext(profile,{
    executablePath,headless:false,acceptDownloads:true,serviceWorkers:"allow",
    ignoreDefaultArgs:["--disable-extensions"],env:{...process.env,GTK_USE_PORTAL:"0",LANG:"C.UTF-8"},
    args:["--lang=en-US","--enable-unsafe-extension-debugging","--remote-debugging-port=0","--disable-background-networking",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost",
      ...(isEdge ? [] : ["--disable-extensions-except="+packagePath,"--load-extension="+packagePath])]
  });
  let cdp;
  try {
    if (isEdge) await installEdgeExtension(context,packagePath,out);
    const manifest = JSON.parse(await readFile(path.join(packagePath, "manifest.json"), "utf8"));
    const isCandidate = worker => worker.url().startsWith("chrome-extension://") &&
      new URL(worker.url()).pathname === "/" + manifest.background.service_worker;
    const worker = context.serviceWorkers().find(isCandidate) || await context.waitForEvent("serviceworker",{predicate:isCandidate, timeout:12000});
    const extensionOrigin = "chrome-extension://" + new URL(worker.url()).host;
    cdp = await devtools(profile);
    const workerTarget = (await cdp.call("Target.getTargets")).targetInfos.find(t => t.url === worker.url());
    const setup = (await cdp.call("Target.attachToTarget",{targetId:workerTarget.targetId,flatten:true})).sessionId;
    await until(async () => (await cdp.call("Runtime.evaluate",{expression:'typeof chrome !== "undefined" && !!chrome.storage',returnByValue:true},setup)).result.value, "候选包后台扩展 API 初始化超时");
    const build = await cdp.call("Runtime.evaluate",{expression:"chrome.runtime.getManifest().version",returnByValue:true},setup);
    assert.equal(build.result.value,manifest.version,"安装版本与候选包不一致");
    const stored = await cdp.call("Runtime.evaluate",{expression:'chrome.storage.local.set({"polaris-onboarding-version":1,"polaris-release-notice-version":chrome.runtime.getManifest().version})',awaitPromise:true},setup);
    await cdp.call("Target.detachFromTarget",{sessionId:setup});
    if (stored.exceptionDetails) throw Error(worker.url() + ": " + stored.exceptionDetails.exception?.description);
    const { product, userAgent } = await cdp.call("Browser.getVersion");
    if (isEdge) assert.match(userAgent,/Edg\//);
    const version = isEdge ? userAgent.match(/Edg\/([\d.]+)/)[1] : product;
    await cdp.call("Browser.grantPermissions",{origin:extensionOrigin,permissions:["clipboardReadWrite","clipboardSanitizedWrite"]});
    await cdp.call("Browser.setDownloadBehavior",{behavior:"allow",downloadPath:downloadDir});
    let fixtureKey;
    await context.route(/^https?:\/\//, route => {
      if (fixtureKey && route.request().isNavigationRequest()) {
        const url = route.request().url();
        for (const session of ["A","B"]) if (url === fixtureURL(fixtureKey,session)) return route.fulfill({contentType:"text/html; charset=utf-8",body:fixturePage(fixtureKey,session)});
      }
      return route.abort();
    });
    const page = await context.newPage();
    await page.bringToFront();
    let sessionId;
    let actions = [];
    async function evaluate(fn,arg) {
      actions.push({ time: new Date().toISOString(), scope: "panel", operation: fn.toString(), argument: arg });
      const expression = '(' + fn.toString() + ')(' + (JSON.stringify(arg) ?? '') + ')';
      const response = await cdp.call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true,userGesture:true},sessionId);
      if(response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result.value;
    }
    return {
      version,downloadDir,
      async begin(key) { fixtureKey=key; actions = []; await context.tracing.start({screenshots:true,snapshots:true}); },
      async goto(url) { await page.goto(url,{timeout:15000}); },
      source:(fn,arg)=>page.evaluate(fn,arg),
      async openPanel() {
        const all = async () => (await cdp.call("Target.getTargets")).targetInfos;
        const targets = await all();
        const open = targets.find(t => t.url.startsWith(extensionOrigin+"/") && t.url.includes("sidepanel.html"));
        if (!open) {
          const tabs = (await cdp.call("Target.getTargets",{filter:[{type:"tab"}]})).targetInfos;
          const source = tabs.find(t => t.url === page.url());
          if (!source) throw Error("找不到样本标签页 " + JSON.stringify(tabs));
          await cdp.call("Extensions.triggerAction",{id:new URL(worker.url()).host,targetId:source.targetId});
        }
        const panel=await until(async ()=>(await all()).find(t=> t.url.startsWith(extensionOrigin+"/") && t.url.includes("sidepanel.html")),"未找到原生侧栏目标");
        if(sessionId) await cdp.call("Target.detachFromTarget",{sessionId}).catch(()=>{});
        sessionId=(await cdp.call("Target.attachToTarget",{targetId:panel.targetId,flatten:true})).sessionId;
        await cdp.call("Emulation.setFocusEmulationEnabled",{enabled:true},sessionId);
      },
      panel:evaluate,
      async clickPanel(selector) {
        // Native panels can appear before the browser has transferred mouse
        // focus into their view. Activate the focused button via its real
        // keyboard path, and verify that the panel received the trusted click.
        await evaluate(selector => {
          const node = document.querySelector(selector);
          if (!node || node.disabled) throw Error("侧栏操作不可用 " + selector);
          node.focus();
          if (document.activeElement !== node) throw Error("侧栏按钮未获得焦点 " + selector);
          window.__polarisQaActivation = null;
          node.addEventListener("click", event => {
            window.__polarisQaActivation = { trusted:event.isTrusted, disabled:node.disabled };
          },{once:true});
        },selector);
        const key = { key:"Enter",code:"Enter",windowsVirtualKeyCode:13,nativeVirtualKeyCode:13 };
        await cdp.call("Input.dispatchKeyEvent",{...key,type:"rawKeyDown"},sessionId);
        await cdp.call("Input.dispatchKeyEvent",{...key,type:"keyUp"},sessionId);
        const activation = await evaluate(() => window.__polarisQaActivation);
        actions.push({ time:new Date().toISOString(), scope:"panel", selector, activation });
        assert.ok(activation?.trusted && !activation.disabled,"侧栏未收到原生按钮激活事件 " + selector);
      },
      async capture(key) {
        await writeFile(path.join(out,key+"-actions.json"), JSON.stringify(actions,null,2));
        await page.screenshot({path:path.join(out,key+".png")});
        if (sessionId) {
          const dump = await evaluate(() => document.body.innerText).catch(()=>"");
          await writeFile(path.join(out,key+"-panel.txt"),dump);
          const image = await cdp.call("Page.captureScreenshot",{},sessionId).catch(()=>null);
          if (image?.data) await writeFile(path.join(out,key+"-panel.png"),Buffer.from(image.data,"base64"));
        }
      },
      end:(key,failed)=>context.tracing.stop(failed?{path:path.join(out,key+"-trace.zip")} : {}),
      async close(){ cdp.close(); await context.close(); }
    };
  } catch(error) { cdp?.close(); await context.close(); throw error; }
}
