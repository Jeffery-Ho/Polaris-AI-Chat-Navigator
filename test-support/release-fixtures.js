import { readFileSync, readdirSync } from "node:fs";
import { SUPPORTED_PLATFORMS } from "../src/supported-platforms.js";

const directory = new URL("./release-pages/", import.meta.url);
export const fixtureKeys = readdirSync(directory).filter(name => name.endsWith(".html")).map(name => name.slice(0, -5)).sort();
const paths = {
  chatgpt: "/c/", claude: "/chat/", gemini: "/app/", grok: "/c/", doubao: "/chat/",
  kimi: "/chat/", qianwen: "/chat/", yuanbao: "/chat/naQivTmsDa/", xiaohongshu: "/chat/",
  manus: "/app/", deepseek: "/a/chat/s/"
};

export function fixtureURL(key, session = "A") {
  const platform = SUPPORTED_PLATFORMS.find(p => p.key === key);
  return new URL(paths[key] + "polaris-sample-" + session, platform.url).href;
}

export function expected(session = "A") {
  return {
    prompts: [session + " orchard inventory", session + " weather forecast"],
    heading: session + " Fruit catalog", subheading: session + " Pear varieties",
    streamedHeading: session + " Rain outlook", listItem: session + " green pear",
    tableCell: (session === "A" ? "Pomelostar" : "Limewater") + " conference pear", code: "# " + session + " literal code"
  };
}

function conversation(template, session) {
  const e = expected(session);
  const answers = [
    `<h1 id="fixture-heading">${e.heading}</h1><p>Inventory notes.</p><h2 id="fixture-subheading">${e.subheading}</h2>
      <ul><li>${e.listItem}</li></ul><table><thead><tr><th>Variety</th></tr></thead><tbody><tr><td>${e.tableCell}</td></tr></tbody></table>
      <pre><code>${e.code}</code></pre>`,
    `<p>${session} Initial forecast.</p><div id="fixture-stream-body"></div>`
  ];
  return template.replace(/<!-- turns -->([\s\S]+?)<!-- \/turns -->/, (_, turn) =>
    e.prompts.map((prompt, i) => turn.replaceAll("{q}", prompt).replaceAll("{a}", answers[i])
      .replaceAll("{turn}", session + (i + 1)).replaceAll("{u}", String(i * 2 + 1)).replaceAll("{r}", String(i * 2 + 2))).join(""));
}

export function fixturePage(key, session = "A") {
  if (!fixtureKeys.includes(key) || !["A", "B"].includes(session)) throw Error("Unknown release fixture");
  const template = readFileSync(new URL(key + ".html", directory), "utf8");
  const nextHTML = conversation(template, "B");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Orchard notebook</title>
    <style>main{height:75vh;overflow-y:auto} main h1{margin-top:90vh} main h2{margin-top:85vh} main{padding-bottom:2rem} user-query,model-response,message-content{display:block}</style></head>
    <body><button id="fixture-stream">Stream answer</button><button id="fixture-switch">Switch conversation</button>
    <main>${conversation(template, session)}</main><script>
    let session = ${JSON.stringify(session)};
    document.querySelector("#fixture-stream").onclick = function () {
      this.disabled = true;
      const body = document.querySelector("#fixture-stream-body");
      body.insertAdjacentHTML("beforeend", "<p>Forecast update.</p>");
      setTimeout(() => {
        if (!body.isConnected) return;
        const h = document.createElement("h2");
        h.id = "fixture-stream-heading"; h.textContent = session + " Rain outlook";
        body.append(h, document.createTextNode("Clear by morning."));
      }, 60);
    };
    document.querySelector("#fixture-switch").onclick = () => {
      history.pushState({}, "", ${JSON.stringify(fixtureURL(key, "B"))});
      session = "B";
      document.querySelector("main").innerHTML = ${JSON.stringify(nextHTML)};
      document.querySelector("main").scrollTop = 0;
      document.querySelector("#fixture-stream").disabled = false;
    };</script></body></html>`;
}
