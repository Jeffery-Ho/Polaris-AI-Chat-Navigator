import test from "node:test";
import assert from "node:assert/strict";
import { conversationReadingState, stepStates } from "../src/conversation-reading-state.js";

test("passive DOM indexing reports a brief load, failures and retained partial content", () => {
  assert.deepEqual(conversationReadingState(null), { loading: false, stalled: false, failed: false });

  // The initial index build loads while no message has been parsed yet.
  assert.deepEqual(conversationReadingState({ phase: "loading", count: 0 }),
    { loading: true, stalled: false, failed: false });
  assert.equal(conversationReadingState({ phase: "loading", count: 21 }).loading, true);
  assert.deepEqual(stepStates({ phase: "loading" }), { read: "active", prepare: "pending" });
  assert.deepEqual(stepStates({ phase: "complete" }), { read: "done", prepare: "done" });
  assert.deepEqual(stepStates({ phase: "error" }), { read: "error", prepare: "pending" });

  // A completed index never reports loading or stalled, regardless of count.
  for (const count of [0, 21]) {
    assert.equal(conversationReadingState({ phase: "complete", count }).loading, false);
    assert.equal(conversationReadingState({ phase: "complete", count }).stalled, false);
    assert.equal(conversationReadingState({ phase: "complete", count }).failed, false);
  }

  // Partial content keeps its parsed messages readable and is not a stalled empty read.
  assert.deepEqual(conversationReadingState({ phase: "partial", count: 21 }),
    { loading: false, stalled: false, failed: true });

  // A failed empty read is stalled; a failed read with content is not.
  assert.deepEqual(conversationReadingState({ phase: "error", count: 0 }),
    { loading: false, stalled: true, failed: true });
  assert.deepEqual(conversationReadingState({ phase: "error", count: 21 }),
    { loading: false, stalled: false, failed: true });
});
