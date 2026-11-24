import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
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
  const downloadDir = path.join(profile,"downloads");
  await mkdir(downloadDir);
  const context = await chromium.launchPersistentContext(profile,{
    executablePath,headless:false,acceptDownloads:true,serviceWorkers:"allow",
    ignoreDefaultArgs:["--disable-extensions"],env:{...process.env,GTK_USE_PORTAL:"0",LANG:"C.UTF-8"},
    args:["--lang=en-US","--remote-debugging-port=0","--disable-background-networking",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost",
      ...(isEdge ? [] : ["--disable-extensions-except="+packagePath,"--load-extension="+packagePath])]
  });
  let cdp;
  try {
    if (isEdge) await installEdgeExtension(context,packagePath);
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker",{timeout:12000});
    const extensionOrigin = new URL(worker.url()).origin === "null" ? worker.url().split("/").slice(0,3).join("/") : new URL(worker.url()).origin;
    await worker.evaluate(async () => {
      await chrome.storage.local.set({"polaris-onboarding-version":1,"polaris-release-notice-version":chrome.runtime.getManifest().version});
    });
    cdp = await devtools(profile);
    const { product, userAgent } = await cdp.call("Browser.getVersion");
    if (isEdge) assert.match(userAgent,/Edg\//);
    else assert.match(await readFile(path.join(path.dirname(executablePath),"../Resources/Info.plist"),"utf8").catch(()=>executablePath), /Chrome for Testing|chrome/i);
    const version = isEdge ? userAgent.match(/Edg\/([\d.]+)/)[1] : product;
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
    async function evaluate(fn,arg) {
      const expression = '(' + fn.toString() + ')(' + (JSON.stringify(arg) ?? '') + ')';
      const response = await cdp.call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true,userGesture:true},sessionId);
      if(response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result.value;
    }
    return {
      version,downloadDir,
      async begin(key) { fixtureKey=key; await context.tracing.start({screenshots:true,snapshots:true}); },
      async goto(url) { await page.goto(url,{timeout:15000}); },
      source:(fn,arg)=>page.evaluate(fn,arg),
      async openPanel() {
        const all = async () => (await cdp.call("Target.getTargets")).targetInfos;
        const target = await until(async ()=>(await all()).find(t=> t.url===worker.url()),"后台 worker 未启动");
        const workerSession = (await cdp.call("Target.attachToTarget",{targetId:target.targetId,flatten:true})).sessionId;
        try {
          const {result:windowId} = await cdp.call("Runtime.evaluate",{expression:"(await chrome.windows.getCurrent()).id",replMode:true,awaitPromise:true,returnByValue:true},workerSession);
          const res = await cdp.call("Runtime.evaluate",{expression:'chrome.sidePanel.open({windowId:'+Number(windowId.value)+'})',awaitPromise:true,userGesture:true},workerSession);
          if (res.exceptionDetails) throw Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
        } finally { await cdp.call("Target.detachFromTarget",{sessionId:workerSession}); }
        const panel=await until(async ()=>(await all()).find(t=> t.url.startsWith(extensionOrigin+"/") && t.url.includes("sidepanel.html")),"未找到原生侧栏目标");
        if(sessionId) await cdp.call("Target.detachFromTarget",{sessionId}).catch(()=>{});
        sessionId=(await cdp.call("Target.attachToTarget",{targetId:panel.targetId,flatten:true})).sessionId;
      },
      panel:evaluate,
      capture:key=>page.screenshot({path:path.join(out,key+".png")}),
      end:(key,failed)=>context.tracing.stop(failed?{path:path.join(out,key+"-trace.zip")} : {}),
      async close(){ cdp.close(); await context.close(); }
    };
  } catch(error) { cdp?.close(); await context.close(); throw error; }
}
