// Curious Reader data-reporting bridge (cr_event contract).
//
// Every message is posted over the WebView JS bridge as one JSON string:
//   { "type": "cr_event", "payload": { …envelope… } }
// The envelope carries payload_id, cr_user_id, sub_app_id, payload_version,
// collection, timestamp, data and — for summary_data only — options.
//
// The same envelope is also dispatched as a `cr_event` CustomEvent on `window`
// so the events can be observed in a plain browser during development.
// Reporting is fire-and-forget, exception-safe and makes no network requests.
// The contract makes one puzzle (word) the finest granularity: individual
// drops are summarized in `level_complete`, never reported one by one.

import { DEFAULT_LANG } from "./launch.js";

// Stable across releases: changing it orphans previously collected data.
export const SUB_APP_ID = "syllables_drag_into_place";
export const PAYLOAD_VERSION = 1;
export const MAX_MESSAGE_BYTES = 64 * 1024;

const context = { userId: "", lang: DEFAULT_LANG, book: "" };

export function initEvents({ userId = "", lang = DEFAULT_LANG, book = "" } = {}) {
  context.userId = userId;
  context.lang = lang;
  context.book = book;
}

function uuidv4() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (cryptoApi?.getRandomValues) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex.slice(10).join("")}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export function buildPayload(collection, data, options) {
  const payload = {
    payload_id: uuidv4(),
    cr_user_id: context.userId,
    sub_app_id: SUB_APP_ID,
    payload_version: PAYLOAD_VERSION,
    collection,
    timestamp: new Date().toISOString(),
    data,
  };
  if (collection === "summary_data") payload.options = options ?? {};
  return payload;
}

function post(collection, data, options) {
  try {
    const win = globalThis.window;
    if (!win) return;
    const payload = buildPayload(collection, data, options);
    if (typeof win.dispatchEvent === "function" && typeof CustomEvent === "function") {
      win.dispatchEvent(new CustomEvent("cr_event", { detail: payload }));
    }
    if (typeof win.ReactNativeWebView?.postMessage !== "function") return;
    const json = JSON.stringify({ type: "cr_event", payload });
    // The container rejects oversize messages whole and silently; drop here
    // instead, where a developer can see why.
    if (new TextEncoder().encode(json).length > MAX_MESSAGE_BYTES) {
      console.warn(`cr_event dropped: ${data.type ?? collection} exceeds ${MAX_MESSAGE_BYTES} bytes`);
      return;
    }
    win.ReactNativeWebView.postMessage(json);
  } catch {
    // Never let reporting break gameplay.
  }
}

/** user_sessions_data event; always stamped with `type`, `lang` and `book`. */
export function emit(type, data = {}) {
  post("user_sessions_data", { type, lang: context.lang, book: context.book, ...data });
}

/**
 * summary_data: one call per completed word, merged into the player's lifetime
 * record by the container. `add` fields carry this word's delta, never totals.
 */
export function emitSummary({ timePlayedSeconds, lastLevelId }) {
  post(
    "summary_data",
    {
      lang: context.lang,
      words_completed: 1,
      total_time_played: timePlayedSeconds,
      last_level_id: lastLevelId,
    },
    {
      lang: "replace",
      words_completed: "add",
      total_time_played: "add",
      last_level_id: "replace",
    },
  );
}
