import http from "node:http";
import tls from "node:tls";
import net from "node:net";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

// Handle CONNECT locally so the real site URL and production host permissions apply.
// Unknown hosts, subresources and requests outside the active case are rejected.
async function fixtureProxy(profile, fixtureURL, fixturePage) {
  let key;
  const sockets = new Set();
  const cert = path.join(profile, "qa-cert.pem");
  const pem = path.join(profile, "qa-key.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-subj", "/CN=Polaris local fixtures", "-keyout", pem, "-out", cert], { stdio: "ignore" });
  const deny = (_, res) => { res.writeHead(403); res.end(); };
  const pages = http.createServer((req, res) => {
    const session = key && ["A", "B"].find(s => fixtureURL(key, s) === "https://" + req.headers.host + req.url);
    if (!session) return deny(req, res);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(fixturePage(key, session));
  });
  const secure = tls.createServer({ key: await readFile(pem), cert: await readFile(cert) },
    socket => pages.emit("connection", socket));
  const proxy = http.createServer(deny);
  proxy.on("connection", socket => {
    sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.on("error", () => {});
  });
  proxy.on("connect", (req, socket, head) => {
    if (!key || req.url !== new URL(fixtureURL(key)).host + ":443") return socket.destroy();
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length) socket.unshift(head);
    secure.emit("connection", socket);
  });
  const port = await listen(proxy);
  return { port, select(platform) { key = platform; }, close() {
    for (const socket of sockets) socket.destroy();
    proxy.close();
  } };
}

export async function launch({ profile, out, packagePath, fixturePage, fixtureURL, until }) {
  const proxy = await fixtureProxy(profile, fixtureURL, fixturePage);
  const reservation = net.createServer();
  const port = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  const executable = process.env.GECKODRIVER_PATH || "geckodriver";
  const gecko = spawn(executable, ["--host", "127.0.0.1", "--port", String(port), "--allow-system-access"], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  let startError;
  gecko.on("error", error => { startError = error; });
  const log = createWriteStream(path.join(out, "geckodriver.log"));
  gecko.stdout.pipe(log, {end:false}); gecko.stderr.pipe(log, {end:false});
  const base = "http://127.0.0.1:" + port;
  let session, context;
  const downloadDir = path.join(profile, "downloads");
  const entries = [];
  async function request(method, endpoint, data) {
    const response = await fetch(base + endpoint, {
      method, headers: { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(30000)
    });
    const {value} = await response.json();
    if (!response.ok) throw Error(endpoint + ": " + (value?.message || response.status));
    return value;
  }
  const command = (endpoint, data) => request("POST", "/session/" + session + endpoint, data);
  async function setContext(value) {
    if (context !== value) { await command("/moz/context", {context:value}); context = value; }
  }
  async function execute(script, args = []) { return command("/execute/sync", {script,args}); }
  async function close() {
    try { if (session) await request("DELETE", "/session/" + session); }
    finally { gecko.kill(); proxy.close(); log.end(); }
  }
  try {
    await until(async () => startError || await request("GET", "/status"), "geckodriver 启动失败");
    if (startError) throw startError;
    await mkdir(downloadDir);
    const result = await request("POST", "/session", {capabilities:{alwaysMatch:{
      browserName:"firefox", acceptInsecureCerts:true,
      proxy:{proxyType:"manual", httpProxy:"127.0.0.1:"+proxy.port, sslProxy:"127.0.0.1:"+proxy.port},
      "moz:firefoxOptions":{
        ...(process.env.POLARIS_FIREFOX_PATH && {binary:process.env.POLARIS_FIREFOX_PATH}),
        args:["-headless"], prefs:{
          "browser.download.dir":downloadDir, "browser.download.folderList":2, "browser.download.useDownloadDir":true,
          "browser.download.always_ask_before_handling_new_types":false,
          "browser.helperApps.neverAsk.saveToDisk":"text/markdown,text/plain,application/octet-stream",
          "network.captive-portal-service.enabled":false, "network.connectivity-service.enabled":false,
          "network.trr.mode":5, "browser.safebrowsing.downloads.remote.enabled":false
        }
      }
    }}});
    session = result.sessionId;
    const archive = path.join(profile, "candidate.xpi");
    execFileSync("zip", ["-qr", archive, "."], {cwd:packagePath});
    const addonId = await command("/moz/addon/install", {path:archive,temporary:true});
    const manifest = JSON.parse(await readFile(path.join(packagePath,"manifest.json"), "utf8"));
    if (addonId !== manifest.browser_specific_settings.gecko.id) throw Error("Firefox 附加组件 ID 不匹配");
    const sidebarId = addonId.replace(/[^a-z0-9_-]/gi, "_").toLowerCase() + "-sidebar-action";
    async function panel(fn,arg) {
      await setContext("chrome");
      // The extension runs out-of-process. Target the actual sidebar document
      // through its Marionette actor, keeping the conversation tab active.
      return execute(`
        const sidebar = window.SidebarController.browser.browsingContext;
        const extension = sidebar.getAllBrowsingContextsInSubtree().find(bc =>
          bc.currentWindowGlobal?.documentURI.spec.startsWith("moz-extension:") &&
          bc.currentWindowGlobal.documentURI.spec.includes("sidepanel.html"));
        if (!extension) throw Error("Firefox 侧栏文档未就绪");
        const actor = extension.currentWindowGlobal.getActor("MarionetteCommands");
        return actor.executeScript(arguments[0], [], {});
      `, ["return (" + fn.toString() + ")(" + (JSON.stringify(arg) ?? "") + ");"]);
    }
    return {
      version:result.capabilities.browserVersion, downloadDir,
      async begin(key) { proxy.select(key); entries.length = 0; entries.push("平台 " + key); },
      async goto(url) { entries.push("打开 " + url); await setContext("content"); await command("/url",{url}); },
      async source(fn,arg) { entries.push("读取样本页 " + fn); await setContext("content"); return execute("return (" + fn + ")(arguments[0]);",[arg ?? null]); },
      async openPanel() {
        entries.push("打开 Firefox 原生侧栏"); await setContext("chrome");
        await execute("return window.SidebarController.show(arguments[0]);",[sidebarId]);
        await until(() => panel(() => !!document.body), "Firefox 原生侧栏没有挂载");
        await panel(() => { document.querySelector(".onboarding-close")?.click(); document.querySelector(".release-notice-close")?.click(); });
      },
      async panel(fn,arg) { entries.push("操作侧栏 " + fn); return panel(fn,arg); },
      async capture(key) {
        await setContext("chrome");
        const png = await request("GET","/session/" + session + "/screenshot");
        await writeFile(path.join(out,key+".png"),Buffer.from(png,"base64"));
      },
      async end(key,failed) { if (failed) await writeFile(path.join(out,key+"-webdriver.log"),entries.join("\n")); },
      close
    };
  } catch (error) { await close(); throw error; }
}
