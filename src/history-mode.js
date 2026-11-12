// Preserve the old preference without retaining its automatic loading behavior.
export function normalizeHistoryMode(value) {
  return value === "loaded" || value === "complete" ? "loaded" : "default";
}
