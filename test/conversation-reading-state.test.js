import test from "node:test";
import assert from "node:assert/strict";
import { stepStates, conversationReadingState } from "../src/conversation-reading-state.js";

test("step states map data reading and native preparation separately", () => {
  assert.deepEqual(stepStates({ phase: "loading", native: { phase: "preparing" } }), { read: "active", prepare: "active" });
  assert.deepEqual(stepStates({ phase: "loading", native: { phase: "ready" } }), { read: "active", prepare: "done" });
  assert.deepEqual(stepStates({ phase: "loading", native: { phase: "loading" } }), { read: "active", prepare: "pending" });
  assert.deepEqual(stepStates({ phase: "complete", native: { phase: "loading" } }), { read: "done", prepare: "active" });
  assert.deepEqual(stepStates({ phase: "complete", native: { phase: "preparing" } }), { read: "done", prepare: "active" });
  assert.deepEqual(stepStates({ phase: "complete", native: { phase: "error" } }), { read: "done", prepare: "error" });
  assert.deepEqual(stepStates({ phase: "partial", native: { phase: "loading" } }), { read: "error", prepare: "pending" });
  assert.deepEqual(stepStates({ phase: "error" }), { read: "error", prepare: "pending" });
});


test("reading state gates unfinished messages without a website card or native DOM dependency", () => {
  for (const count of [0, 21]) {
    assert.equal(conversationReadingState({ phase: "loading", count }).loading, true);
    assert.equal(conversationReadingState({ phase: "complete", count, native: { phase: "preparing" } }).loading, true);
    assert.equal(conversationReadingState({ phase: "complete", count, native: { phase: "ready" } }).loading, false);
  }
  assert.equal(conversationReadingState(null).loading, false);
  assert.equal(conversationReadingState({ phase: "loading", refreshing: true, native: { phase: "ready" } }).loading, false);
});

test("explicit empty failures expose recovery while partial reads can be dismissed", () => {
  for (const phase of ["error", "partial"]) {
    assert.equal(conversationReadingState({ phase, count: 0 }).loading, false);
    assert.equal(conversationReadingState({ phase, count: 0 }).stalled, true);
    assert.equal(conversationReadingState({ phase, count: 21 }).loading, true);
    assert.equal(conversationReadingState({ phase, count: 21 }).stalled, false);
  }
  assert.equal(conversationReadingState({ phase: "complete", count: 21, native: { phase: "error" } }).failed, true);
});
