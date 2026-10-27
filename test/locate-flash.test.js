import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createLocateFlash } from "../src/locate-flash.js";

function setup({ reduced = false } = {}) {
  const dom = new JSDOM("<main><h2>目标</h2><h3>下一个</h3></main>");
  const win = dom.window; const timers = new Map(); let serial = 0; let time = 0;
  win.requestAnimationFrame = () => { throw new Error("page frames may be paused"); };
  win.setTimeout = (callback) => { timers.set(++serial, callback); return serial; };
  win.clearTimeout = (id) => timers.delete(id);
  win.performance.now = () => time;
  win.matchMedia = () => ({ matches: reduced });
  let top = 300;
  win.HTMLElement.prototype.getBoundingClientRect = () => ({ top, bottom: top + 40, left: 100, right: 400, width: 300, height: 40 });
  const step = (count = 1) => { for (let i = 0; i < count; i++) { time += 50; const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((callback) => callback()); } };
  return { win, step, timers, move: (value) => { top = value; }, heading: () => win.document.querySelector("h2"),
    overlay: () => win.document.querySelector("[data-polaris-locate-flash]"), finish: () => dom.window.close() };
}

test("the tint waits for scrolling to settle before holding and fading", () => {
  const s = setup(); const flash = createLocateFlash({ window: s.win });
  try {
    flash.flash(s.heading());
    assert.equal(s.overlay(), null);
    s.move(250); s.step();
    s.move(200); s.step();
    s.step(2); assert.equal(s.overlay(), null, "no tint during scrolling or the settling interval");
    s.step();
    assert.equal(s.overlay().style.top, "192px");
    assert.equal(s.overlay().parentElement, s.win.document.body);
    assert.equal(s.overlay().style.background, "rgba(184, 92, 58, 0.08)");
    assert.equal(s.overlay().style.pointerEvents, "none");
    s.step(19); assert.equal(s.overlay().style.opacity, "1");
    s.step(); assert.equal(s.overlay().style.opacity, "0");
    s.step(6); assert.equal(s.overlay(), null);
    assert.equal(s.timers.size, 0);
  } finally { s.finish(); }
});

test("offscreen targets settle after entering the viewport; cancelled jumps cannot reappear", () => {
  const s = setup(); const flash = createLocateFlash({ window: s.win });
  try {
    s.move(2000); flash.flash(s.heading()); s.step(3);
    assert.equal(s.overlay(), null);
    s.move(300); s.step(); assert.equal(s.overlay(), null);
    s.step(3); assert.ok(s.overlay());
    flash.cancel(); s.step(40);
    assert.equal(s.overlay(), null); assert.equal(s.timers.size, 0);
  } finally { s.finish(); }
});

test("dark and reduced-motion highlights replace the previous frame and clean up without animation events", () => {
  const s = setup({ reduced: true }); const flash = createLocateFlash({ window: s.win });
  try {
    flash.flash(s.heading(), { theme: "dark" }); s.step(3); const old = s.overlay();
    assert.equal(old.style.background, "rgba(230, 154, 120, 0.12)");
    assert.equal(old.style.transition, "none");
    flash.flash(s.heading(), { theme: "dark" });
    assert.equal(old.isConnected, false);
    assert.equal(s.overlay(), null);
    s.step(3);
    assert.equal(s.win.document.querySelectorAll("[data-polaris-locate-flash]").length, 1);
    s.step(20); assert.equal(s.overlay(), null);
  } finally { s.finish(); }
});

test("empty wrappers use descendant bounds and a visible tint follows a remounted target", () => {
  const s = setup(); const flash = createLocateFlash({ window: s.win });
  try {
    const wrapper = s.win.document.querySelector("main");
    wrapper.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
    flash.flash(wrapper);
    s.step(3);
    assert.equal(s.overlay().style.width, "316px");
    assert.equal(s.overlay().style.top, "292px");
    const original = s.heading();
    flash.flash(original, { resolve: () => s.heading() });
    s.step(3);
    const replacement = s.win.document.createElement("h2"); original.replaceWith(replacement);
    s.move(450); s.step();
    assert.equal(s.overlay().style.visibility, "hidden");
    s.step(3);
    assert.equal(s.overlay().style.top, "442px");
    replacement.remove(); s.step();
    assert.equal(s.overlay().style.visibility, "hidden", "never leave a frame around stale coordinates");
    s.step(60); assert.equal(s.overlay(), null); assert.equal(s.timers.size, 0);
  } finally { s.finish(); }
});

test("a long reply waits for raw bounds to settle even when its clipped frame does not move", () => {
  const s = setup(); const flash = createLocateFlash({ window: s.win });
  try {
    const reply = s.heading(); let top = -500;
    reply.getBoundingClientRect = () => ({ top, bottom: top + 3000, left: 100, right: 400, width: 300, height: 3000 });
    flash.flash(reply, { getViewport: () => ({ top: 88, bottom: 700, left: 40, right: 800 }) });
    for (let i = 0; i < 8; i++) { top -= 50; s.step(); assert.equal(s.overlay(), null); }
    s.step(3);
    assert.equal(s.overlay().style.top, "88px", "never paint over the conversation header");
    assert.equal(s.overlay().style.height, "612px", "stay inside the conversation scrollport");
    s.win.document.querySelector("main").dispatchEvent(new s.win.Event("scroll"));
    assert.equal(s.overlay().style.visibility, "hidden", "scrolling hides the old tint immediately");
    s.step(2); assert.equal(s.overlay().style.visibility, "hidden");
    s.step(); assert.equal(s.overlay().style.visibility, "visible");
  } finally { flash.cancel(); s.finish(); }
});

test("continuous motion times out without showing a tint and cancellation clears pending settling", () => {
  const s = setup(); const flash = createLocateFlash({ window: s.win });
  try {
    flash.flash(s.heading());
    for (let i = 0; i < 100; i++) { s.move(100 + i * 2); s.step(); }
    assert.equal(s.overlay(), null);
    assert.equal(s.timers.size, 0);
    flash.flash(s.heading()); flash.cancel(); s.step(5);
    assert.equal(s.overlay(), null); assert.equal(s.timers.size, 0);
  } finally { s.finish(); }
});
