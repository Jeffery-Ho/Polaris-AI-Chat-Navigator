// Passive DOM indexing exposes three states: a brief initial load, a failed
// read with no content, and a failed or partial read with retained content.
export function stepStates(snapshot) {
  const read = ["error", "partial"].includes(snapshot.phase) ? "error" : snapshot.phase === "complete" ? "done" : "active";
  return { read, prepare: read === "done" ? "done" : "pending" };
}

export function conversationReadingState(snapshot) {
  if (!snapshot) return { loading: false, stalled: false, failed: false };
  return {
    loading: snapshot.phase === "loading",
    stalled: snapshot.phase === "error" && !Number(snapshot.count),
    failed: ["error", "partial"].includes(snapshot.phase)
  };
}
