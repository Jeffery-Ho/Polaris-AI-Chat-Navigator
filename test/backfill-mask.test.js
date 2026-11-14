import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createBackfillMask } from "../src/backfill-mask.js";

function setup(background = "rgb(255, 255, 255)") {
  const dom = new JSDOM('<!doctype html><body><main id="list" style="opacity: 0.9"></main></body>');
  const win = dom.window;
  win.document.body.style.backgroundColor = background;
  const scroller = win.document.getElementById("list");
  scroller.getBoundingClientRect = () => ({ left: 10, top: 20, width: 300, height: 400 });
  return { win, scroller };
}

test("cover renders an isolated card with title, progress, hint and stop", () => {
  const { win, scroller } = setup();
  let stopped = 0;
  const mask = createBackfillMask({ window: win, scroller, title: "Loading earlier messages", text: "3 messages read",
    hint: "Scroll or click the page to stop", iconUrl: "https://extension.test/icon.png", stopLabel: "Stop", onStop: () => { stopped += 1; } });
  const cover = win.document.querySelector("[data-polaris-backfill]");
  assert.equal(cover, mask.element);
  assert.equal(scroller.style.getPropertyValue("opacity"), "0");
  assert.match(cover.style.cssText, /left: 10px/);
  const root = cover.shadowRoot;
  assert.ok(root, "card lives in a shadow root so site CSS cannot restyle it");
  assert.equal(root.querySelector(".title").textContent, "Loading earlier messages");
  assert.equal(root.querySelector(".count").textContent, "3 messages read");
  assert.equal(root.querySelector(".hint").textContent, "Scroll or click the page to stop");
  assert.equal(root.querySelector(".logo img").getAttribute("src"), "https://extension.test/icon.png");
  assert.equal(root.querySelector(".feed").getAttribute("aria-hidden"), "true");
  assert.match(root.querySelector("style").textContent, /prefers-reduced-motion: reduce/);
  mask.update("12 messages read");
  assert.equal(root.querySelector(".count").textContent, "12 messages read");
  root.querySelector("button").click();
  assert.equal(stopped, 1);
  mask.remove();
  assert.equal(win.document.querySelector("[data-polaris-backfill]"), null);
  assert.equal(scroller.style.getPropertyValue("opacity"), "0.9");
});

test("cover follows a dark page background and falls back to a drawn mark without an icon", () => {
  const { win, scroller } = setup("rgb(33, 33, 33)");
  const mask = createBackfillMask({ window: win, scroller, title: "Loading", text: "0" });
  const root = mask.element.shadowRoot;
  assert.match(root.querySelector("style").textContent, /#222120/, "dark card surface");
  assert.ok(root.querySelector(".logo svg"));
  mask.remove();
  const light = setup();
  const lightMask = createBackfillMask({ window: light.win, scroller: light.scroller, title: "Loading", text: "0" });
  assert.match(lightMask.element.shadowRoot.querySelector("style").textContent, /background: #ffffff/);
  lightMask.remove();
});

test("without a separate title the progress text stays the headline", () => {
  const { win, scroller } = setup();
  const mask = createBackfillMask({ window: win, scroller, text: "Loading… 2 read" });
  const root = mask.element.shadowRoot;
  assert.equal(root.querySelector(".title").textContent, "Loading… 2 read");
  mask.update("Loading… 5 read");
  assert.equal(root.querySelector(".title").textContent, "Loading… 5 read");
  mask.remove();
});
