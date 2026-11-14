// Hides programmatic scrolling of the website's message list. The list stays laid
// out (so the site's own lazy loaders still fire) but is transparent beneath a
// still cover until its original position has been restored.
//
// The cover renders its card inside a Shadow DOM so the website's
// own CSS cannot restyle it, and picks a light or dark card from the page's
// background so it reads as part of the page in either theme.

const THEMES = {
  light: {
    card: "#ffffff", border: "#e0ddd7", text: "#2a2724", secondary: "#57534c", tertiary: "#77726a",
    accent: "#b85c3a", accentText: "#a04c2f", accentSubtle: "#fbf4f0", skeleton: "#edebe7",
    shadow: "0 1px 2px rgba(40,37,34,.06), 0 12px 32px rgba(40,37,34,.12)"
  },
  dark: {
    card: "#222120", border: "#3a3835", text: "#f3f1ed", secondary: "#c4c0b8", tertiary: "#9a958c",
    accent: "#e69a78", accentText: "#e69a78", accentSubtle: "#35251f", skeleton: "#33312e",
    shadow: "0 1px 2px rgba(0,0,0,.3), 0 12px 32px rgba(0,0,0,.45)"
  }
};

function parseRgb(color) {
  const match = String(color || "").match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  return match ? match.slice(1, 4).map(Number) : null;
}

function isDarkColor(color, win) {
  const rgb = parseRgb(color);
  if (!rgb) return Boolean(win.matchMedia?.("(prefers-color-scheme: dark)").matches);
  const [r, g, b] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.35;
}

function cardStyles(theme) {
  return `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .stage {
      position: absolute; inset: 0; display: grid; place-items: center; padding: 16px;
      font: 14px/1.5 system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      color: ${theme.text}; -webkit-font-smoothing: antialiased;
    }
    .card {
      width: min(320px, 100%); padding: 18px 18px 14px; border: 1px solid ${theme.border};
      border-radius: 16px; background: ${theme.card}; box-shadow: ${theme.shadow};
      animation: enter 220ms cubic-bezier(.2,0,0,1) both;
    }
    .head { display: flex; align-items: center; gap: 10px; }
    .logo {
      flex: 0 0 auto; width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center;
      background: ${theme.accentSubtle}; overflow: hidden;
    }
    .logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .logo svg { width: 16px; height: 16px; fill: none; stroke: ${theme.accent}; stroke-width: 2; stroke-linecap: round; }
    .heading { min-width: 0; display: grid; gap: 1px; }
    .title { margin: 0; font-size: 14px; font-weight: 600; letter-spacing: -.01em; color: ${theme.text}; }
    .count { margin: 0; font-size: 12px; color: ${theme.secondary}; font-variant-numeric: tabular-nums; }
    .feed {
      position: relative; height: 64px; margin: 14px 0 12px; overflow: hidden;
      -webkit-mask-image: linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent);
      mask-image: linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent);
    }
    .rows { display: grid; gap: 8px; animation: feed 2.4s linear infinite; }
    .row { display: flex; align-items: center; gap: 8px; height: 14px; }
    .dot { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 50%; background: ${theme.accent}; opacity: .55; }
    .bar { height: 8px; border-radius: 999px; background: ${theme.skeleton}; }
    .foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .hint { margin: 0; min-width: 0; font-size: 12px; color: ${theme.tertiary}; }
    button {
      all: unset; flex: 0 0 auto; box-sizing: border-box; min-height: 28px; padding: 4px 14px;
      border: 1px solid ${theme.border}; border-radius: 999px; background: ${theme.card};
      color: ${theme.text}; font-family: inherit; font-size: 12px; font-weight: 500; line-height: 1.5; cursor: pointer;
      transition: border-color 120ms, color 120ms, background 120ms;
    }
    button:hover { border-color: ${theme.accent}; color: ${theme.accentText}; background: ${theme.accentSubtle}; }
    button:focus-visible { outline: 2px solid ${theme.accent}; outline-offset: 2px; }
    @keyframes feed { from { transform: translateY(-50%); } to { transform: translateY(0); } }
    @keyframes enter { from { opacity: 0; transform: translateY(4px) scale(.98); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .rows, .card { animation: none; } }
  `;
}

const SPARK_PATH = "M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8";
// Skeleton rows: earlier messages scroll into view from above. Widths repeat
// twice so the translateY(-50%) → 0 loop is seamless.
const ROW_WIDTHS = [72, 54, 86, 40, 66, 58];

export function createBackfillMask({
  window: win, scroller, text = "", title = "", hint = "", iconUrl = "", stopLabel = "Stop", onStop = () => {}
}) {
  const doc = win.document;
  const viewportScroller = scroller === doc.scrollingElement || scroller === doc.documentElement || scroller === doc.body;
  const target = viewportScroller ? doc.body : scroller;
  const saved = { value: target.style.getPropertyValue("opacity"), priority: target.style.getPropertyPriority("opacity") };
  const rect = viewportScroller ? { left: 0, top: 0, width: win.innerWidth, height: win.innerHeight } : scroller.getBoundingClientRect();
  const background = [doc.body, doc.documentElement].map((node) => node && win.getComputedStyle(node).backgroundColor)
    .find((color) => color && !/^(?:transparent|rgba\(\s*0,\s*0,\s*0,\s*0\s*\))$/.test(color)) || "Canvas";
  const theme = THEMES[isDarkColor(background, win) ? "dark" : "light"];
  const cover = doc.createElement("div");
  cover.dataset.polarisBackfill = "true";
  cover.setAttribute("role", "status"); cover.setAttribute("aria-live", "polite");
  cover.style.cssText = [
    "all:initial", "position:fixed", `left:${rect.left}px`, `top:${rect.top}px`, `width:${rect.width}px`, `height:${rect.height}px`,
    "z-index:2147483646", `background:${background}`, "display:block"
  ].join(";");

  const make = (tag, className, content) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (content) node.textContent = content;
    return node;
  };
  const root = typeof cover.attachShadow === "function" ? cover.attachShadow({ mode: "open" }) : cover;
  const style = make("style"); style.textContent = cardStyles(theme);
  const stage = make("div", "stage");
  const card = make("div", "card");
  const head = make("div", "head");
  const logo = make("span", "logo");
  if (iconUrl) {
    const image = make("img"); image.src = iconUrl; image.alt = ""; logo.append(image);
  } else {
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
    const path = doc.createElementNS(svg.namespaceURI, "path"); path.setAttribute("d", SPARK_PATH);
    svg.append(path); logo.append(svg);
  }
  const heading = make("div", "heading");
  const titleNode = make("p", "title", title || text);
  const label = make("p", "count", title ? text : "");
  label.hidden = !title;
  heading.append(titleNode, label);
  head.append(logo, heading);

  const feed = make("div", "feed"); feed.setAttribute("aria-hidden", "true");
  const rows = make("div", "rows");
  for (const width of [...ROW_WIDTHS, ...ROW_WIDTHS]) {
    const row = make("div", "row");
    const bar = make("span", "bar"); bar.style.width = `${width}%`;
    row.append(make("span", "dot"), bar); rows.append(row);
  }
  feed.append(rows);

  const foot = make("div", "foot");
  const stop = make("button", "", stopLabel); stop.type = "button";
  stop.addEventListener("click", () => onStop());
  foot.append(make("p", "hint", hint), stop);
  card.append(head, feed, foot);
  stage.append(card);
  root.append(style, stage);

  target.style.setProperty("opacity", "0", "important");
  (doc.body || doc.documentElement).append(cover);
  const progressNode = title ? label : titleNode;
  let removed = false;
  return {
    element: cover,
    update(value) { if (!removed && progressNode.textContent !== value) progressNode.textContent = value; },
    remove() {
      if (removed) return;
      removed = true;
      if (saved.value) target.style.setProperty("opacity", saved.value, saved.priority);
      else target.style.removeProperty("opacity");
      cover.remove();
    }
  };
}
