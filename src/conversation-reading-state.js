// Reading data and preparing the native conversation are independent steps.
export function stepStates(snapshot) {
  const readFailed = ["error", "partial"].includes(snapshot.phase);
  const read = readFailed ? "error" : snapshot.phase === "complete" ? "done" : "active";
  const native = snapshot.native?.phase;
  const prepare = native === "ready" ? "done" : native === "error" ? "error"
    : native === "preparing" || read === "done" ? "active" : "pending";
  return { read, prepare };
}

export function conversationReadingState(snapshot) {
  if (!snapshot) return { loading: false, stalled: false, failed: false };
  const steps = stepStates(snapshot);
  const failed = steps.read === "error" || steps.prepare === "error";
  const ready = snapshot.native?.phase === "ready" && (snapshot.phase === "complete" || snapshot.refreshing);
  return { ...steps, failed, loading: !ready && (!failed || Number(snapshot.count) > 0), stalled: !ready && failed && !Number(snapshot.count) };
}
