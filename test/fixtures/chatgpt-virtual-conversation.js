// A ChatGPT-like conversation whose list is virtualized: every turn keeps a
// sized placeholder (`data-turn-id-container` + `data-is-intersecting`), and
// its content mounts a little after it scrolls into view and unmounts once it
// is far away. Like ChatGPT, each section carries a stable `data-turn-id`.
// Answers carry many images, and some turns are image-only.
export function virtualConversationTurns({ turns = 80, imagesPerAnswer = 3, imageOnlyEvery = 4 } = {}) {
  return Array.from({ length: turns }, (_, index) => {
    const role = index % 2 ? "assistant" : "user";
    const answer = (index - 1) / 2 + 1;
    const imageOnly = role === "assistant" && answer % imageOnlyEvery === 0;
    const images = (count) => Array.from({ length: count }, (_, k) =>
      `<img src="https://files.oaiusercontent.com/file-${index}-${k}/raw" alt="生成图片 ${answer}-${k + 1}" width="512" height="512">`).join("");
    const body = role === "user"
      ? `<div data-message-author-role="user" data-message-id="m${index}"><div class="whitespace-pre-wrap">问题 ${index / 2 + 1}：请继续设计第 ${index / 2 + 1} 张日历</div></div>`
      : imageOnly
        // Image generation turns have no author role and no text Maker.
        ? `<div data-image-gen-result="true">${images(imagesPerAnswer + 1)}</div>`
        : `<div data-message-author-role="assistant" data-message-id="m${index}"><div class="markdown prose"><h2>第 ${answer} 章 方案</h2><p>正文 ${answer}</p>${images(imagesPerAnswer)}</div></div>`;
    return { id: `t${index}`, role, html: `<section data-turn-id="turn-${index}" data-testid="conversation-turn-${index + 1}" data-turn="${role}">${body}</section>` };
  });
}

export function virtualConversationHtml() {
  return '<html><body><main><div data-scroll-root style="overflow-y:auto"></div></main></body></html>';
}

// Installs the layout model on a JSDOM window. Returns a controller that
// reports scroll calls and the mask state seen at each one.
export function attachVirtualList(win, { turns, rowHeight = 150, viewport = 1000, mountDelay = 30, keepAround = 2 }) {
  const doc = win.document;
  const scroller = doc.querySelector("[data-scroll-root]");
  const containers = turns.map((turn) => {
    const node = doc.createElement("div");
    node.dataset.turnIdContainer = turn.id; node.dataset.isIntersecting = "false";
    scroller.append(node);
    return node;
  });
  const height = turns.length * rowHeight;
  let top = height - viewport;
  let timer = 0;
  const scrolls = [];
  const indexOf = (element) => {
    const container = element.closest?.("[data-turn-id-container]");
    return container ? containers.indexOf(container) : -1;
  };
  const prototype = win.HTMLElement.prototype;
  prototype.getBoundingClientRect = function () {
    if (this === scroller) return { top: 0, bottom: viewport, left: 0, right: 800, height: viewport, width: 800 };
    const index = indexOf(this);
    if (index < 0) return { top: 0, bottom: 0, left: 0, right: 0, height: 0, width: 0 };
    const y = index * rowHeight - top;
    return { top: y, bottom: y + rowHeight, left: 0, right: 800, height: rowHeight, width: 800 };
  };
  const visibleRange = () => [Math.floor(top / rowHeight), Math.ceil((top + viewport) / rowHeight)];
  function render() {
    const [first, last] = visibleRange();
    containers.forEach((node, index) => {
      const inView = index >= first && index < last;
      const near = index >= first - keepAround * (last - first) && index < last + keepAround * (last - first);
      if (inView && !node.firstChild) { node.innerHTML = turns[index].html; node.dataset.isIntersecting = "true"; }
      else if (!near && node.firstChild) { node.replaceChildren(); node.dataset.isIntersecting = "false"; }
    });
  }
  Object.defineProperties(scroller, {
    scrollHeight: { get: () => height }, clientHeight: { get: () => viewport },
    scrollTop: {
      get: () => top,
      set(value) {
        top = Math.max(0, Math.min(height - viewport, Number(value) || 0));
        win.clearTimeout(timer); timer = win.setTimeout(render, mountDelay);
      }
    }
  });
  scroller.scrollTo = ({ top: value }) => {
    scrolls.push({ top: value, masked: scroller.style.opacity === "0" && Boolean(doc.querySelector("[data-polaris-backfill]")) });
    scroller.scrollTop = value;
  };
  render();
  return { scroller, scrolls, top: () => top, mounted: () => containers.filter((node) => node.firstChild).length };
}
