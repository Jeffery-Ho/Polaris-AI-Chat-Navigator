import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createLocateFlash } from "../src/locate-flash.js";

function setup({ reduced = false } = {}) {
  const dom = new JSDOM("<main><h2>目标</h2><h3>下一个</h3></main>", { url: "https://chatgpt.com/c/one" });
  const win = dom.window; const frames = []; const animations = [];
  // Polls run on timers; animation frames must not be needed (Dia pauses them).
  win.requestAnimationFrame = () => { throw new Error("animation frames are not used"); };
  win.setTimeout = (callback) => frames.push(callback);
  win.clearTimeout = () => {};
  win.matchMedia = (query) => ({ matches: reduced && query === "(prefers-reduced-motion: reduce)" });
  Object.defineProperty(win, "innerHeight", { value: 800 });
  let top = 400;
  win.HTMLElement.prototype.getBoundingClientRect = () => ({ top, bottom: top + 40, left: 100, width: 300 });
  win.HTMLElement.prototype.animate = function (keyframes, options) {
    const animation = { element: this, keyframes, options, cancelled: false, cancel() { this.cancelled = true; } };
    animations.push(animation); return animation;
  };
  const step = (count = 1) => { for (let i = 0; i < count; i++) frames.shift()?.(); };
  const overlay = () => win.document.querySelector("[data-polaris-locate-flash]");
  return { win, animations, step, overlay, move: (value) => { top = value; },
    heading: (index = 0) => win.document.querySelectorAll("main > *")[index], finish: () => dom.window.close() };
}

test("the tint waits until the target is on screen and still, then shows for about 1s above it", () => {
  const s = setup(); const flash = createLocateFlash({ window: s.win });
  try {
    s.move(2000);
    flash.flash(s.heading(), { theme: "light" });
    s.step(6);
    assert.equal(s.overlay(), null, "a still but off-screen target is not tinted before the scroll starts");
    s.move(1200); s.step(); s.move(300); s.step(3);
    assert.equal(s.overlay(), null, "no tint while the smooth scroll is still settling");
    s.step(2);
    const overlay = s.overlay();
    assert.ok(overlay, "the tint is an overlay, so bubble backgrounds cannot hide it");
    assert.equal(overlay.style.borderRadius, "12px");
    assert.match(overlay.style.border, /2px solid/);
    assert.equal(overlay.style.background, "rgba(184, 92, 58, 0.08)");
    assert.equal(overlay.style.top, "292px"); assert.equal(overlay.style.pointerEvents, "none");
    const [animation] = s.animations;
    assert.equal(animation.options.duration * animation.keyframes[1].offset, 1000);
    assert.equal(animation.keyframes.at(-1).opacity, 0);
    animation.onfinish();
    assert.equal(s.overlay(), null);
  } finally { s.finish(); }
});

test("dark pages use the dark accent, reduced motion skips the fade, and a new jump replaces the old tint", () => {
  const s = setup({ reduced: true }); const flash = createLocateFlash({ window: s.win });
  try {
    flash.flash(s.heading(), { theme: "dark" }); s.step(6);
    assert.equal(s.overlay().style.background, "rgba(230, 154, 120, 0.12)");
    assert.equal(s.animations[0].options.duration, 1000);
    assert.equal(s.animations[0].options.easing, "step-end");
    flash.flash(s.heading(1)); s.step(6);
    assert.equal(s.animations[0].cancelled, true);
    assert.equal(s.win.document.querySelectorAll("[data-polaris-locate-flash]").length, 1);
  } finally { s.finish(); }
});

test("a target remounted by the host list during the scroll is found again and still tinted", () => {
  const s = setup(); const reports = [];
  const flash = createLocateFlash({ window: s.win, onReport: (outcome) => reports.push(outcome) });
  try {
    const original = s.heading();
    flash.flash(original, { resolve: () => s.win.document.querySelector("main > h2") });
    s.step();
    const replacement = s.win.document.createElement("h2"); replacement.textContent = "目标";
    original.replaceWith(replacement);
    s.step(6);
    assert.ok(s.overlay(), "the tint is drawn for the remounted node");
    assert.deepEqual(reports, ["shown"]);
    flash.flash(s.win.document.createElement("h2"));
    assert.deepEqual(reports, ["shown", "lost"], "a target that cannot be found is reported");
  } finally { s.finish(); }
});
