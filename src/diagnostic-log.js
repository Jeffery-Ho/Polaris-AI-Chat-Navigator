export const DIAGNOSTIC_LOG_STORAGE_KEY = "polaris-diagnostic-log:v1";
export const DIAGNOSTIC_LOG_MAX_EVENTS = 200;
export const DIAGNOSTIC_LOG_MAX_CHARACTERS = 128 * 1024;

const SAFE_KEYS = new Set([
  "platform",
  "locale",
  "version",
  "browser",
  "os",
  "viewportWidth",
  "viewportHeight",
  "devicePixelRatio",
  "kind",
  "reason",
  "didDrag",
  "persisted",
  "deltaX",
  "deltaY",
  "pointerType",
  "hasPointerCapture",
  "scrollable",
  "assistantContainers",
  "userContainers",
  "usableHeadings",
  "conversationLength",
  "source",
  "operation",
  "errorName",
  "settingKey",
  "activeControlTab",
  "filename",
  "downloaded",
  "mailOpened",
  "outcome",
  "cacheHit", "cacheMs", "indexMs", "nativeMs", "readMs", "totalMs", "historicalRequests"
]);
const MAX_STRING_LENGTH = 120;

function defaultStorage() {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

function safePrimitive(value) {
  if (typeof value === "string") {
    return value.slice(0, MAX_STRING_LENGTH);
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function sanitizeDetails(details) {
  if (!details || typeof details !== "object") {
    return {};
  }

  return Object.fromEntries(Object.entries(details)
    .filter(([key]) => SAFE_KEYS.has(key))
    .map(([key, value]) => [key, safePrimitive(value)])
    .filter(([, value]) => value !== undefined));
}

function readEvents(storage, storageKey) {
  if (!storage || typeof storage.getItem !== "function") {
    return [];
  }

  try {
    const parsed = JSON.parse(storage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed.filter((event) => event && typeof event === "object") : [];
  } catch {
    return [];
  }
}

export function createDiagnosticLog({
  storage = defaultStorage(),
  storageKey = DIAGNOSTIC_LOG_STORAGE_KEY,
  maxEvents = DIAGNOSTIC_LOG_MAX_EVENTS,
  maxCharacters = DIAGNOSTIC_LOG_MAX_CHARACTERS,
  now = () => Date.now()
} = {}) {
  const eventLimit = Math.max(1, Math.floor(maxEvents));
  const characterLimit = Math.max(1, Math.floor(maxCharacters));
  let events = readEvents(storage, storageKey).map((event) => ({
    timestamp: typeof event.timestamp === "string" ? event.timestamp.slice(0, MAX_STRING_LENGTH) : "",
    type: typeof event.type === "string" ? event.type.slice(0, MAX_STRING_LENGTH) : "event",
    ...sanitizeDetails(event)
  }));

  function trimEvents() {
    while (events.length > eventLimit || JSON.stringify(events).length > characterLimit) {
      events.shift();
    }
  }

  function persist() {
    trimEvents();
    if (!storage || typeof storage.setItem !== "function") {
      return;
    }

    try {
      storage.setItem(storageKey, JSON.stringify(events));
    } catch {
      // Diagnostics must never affect the extension when session storage is unavailable.
    }
  }

  trimEvents();

  return {
    record(type, details = {}) {
      const safeType = typeof type === "string" && type.trim() ? type.trim().slice(0, MAX_STRING_LENGTH) : "event";
      events.push({
        timestamp: new Date(now()).toISOString(),
        type: safeType,
        ...sanitizeDetails(details)
      });
      persist();
    },

    snapshot(context = {}) {
      return {
        schemaVersion: 1,
        generatedAt: new Date(now()).toISOString(),
        context: sanitizeDetails(context),
        events: events.map((event) => ({ ...event }))
      };
    },

    serialize(context = {}) {
      return JSON.stringify(this.snapshot(context), null, 2);
    },

    clear() {
      events = [];
      if (!storage || typeof storage.removeItem !== "function") {
        return;
      }
      try {
        storage.removeItem(storageKey);
      } catch {
        // Diagnostics must never affect the extension when session storage is unavailable.
      }
    }
  };
}
