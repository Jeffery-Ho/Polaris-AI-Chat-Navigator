import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createVirtualList } from "../src/virtual-list.js";

function setup() {
  const dom = new JSDOM('<div id="list"></div>', { pretendToBeVisual: true });
  const win = dom.window; let y = 0;
  Object.defineProperty(win, "scrollY", { get: () => y });
  Object.defineProperty(win, "innerHeight", { value: 800 });
  win.scrollTo = ({ top }) => { y = top; };
  const list = win.document.getElementById("list");
  list.getBoundingClientRect = () => ({ top: -y, width: 300, height: 0 });
  const virtual = createVirtualList({ element: list, estimateHeight: 40, gap: 0, createRow(item) {
    const row = win.document.createElement("button"); row.textContent = item.title; return row;
  } });
  return { dom, win, list, virtual };
}

test("20,000 logical rows stay bounded and an off-screen target can receive keyboard focus", () => {
  const s = setup();
  const items = Array.from({ length: 20000 }, (_, i) => ({ key: String(i), title: `行 ${i}` }));
  s.virtual.setItems(items);
  assert.ok(s.list.querySelectorAll("button").length <= 120);
  assert.equal(s.virtual.scrollToKey("15000", { focus: true }), true);
  assert.equal(s.win.document.activeElement.dataset.virtualKey, "15000");
  assert.ok(s.list.querySelectorAll("button").length <= 120);
  s.win.document.activeElement.dispatchEvent(new s.win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  assert.equal(s.win.document.activeElement.dataset.virtualKey, "15001");
  s.virtual.dispose(); assert.equal(s.list.children.length, 0); s.dom.window.close();
});

test("prepending history retains the logical scroll anchor and recycling removes old nodes", () => {
  const s = setup();
  const items = Array.from({ length: 1000 }, (_, i) => ({ key: String(i), title: String(i) }));
  s.virtual.setItems(items); s.virtual.scrollToKey("500");
  const before = s.win.scrollY;
  const row = s.list.querySelector('[data-virtual-key="500"]');
  s.virtual.setItems([...Array.from({ length: 50 }, (_, i) => ({ key: `old${i}`, title: "更早" })), ...items]);
  assert.equal(s.win.scrollY - before, 2000);
  s.virtual.scrollToKey("900");
  assert.equal(row.isConnected, false);
  assert.ok(s.list.querySelector('[data-virtual-spacer]'));
  s.virtual.dispose(); s.dom.window.close();
});
