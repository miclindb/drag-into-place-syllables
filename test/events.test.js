import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { emit, emitSummary, initEvents, MAX_MESSAGE_BYTES, PAYLOAD_VERSION, SUB_APP_ID } from "../src/game/events.js";

let posted;
let dispatched;

beforeEach(() => {
  posted = [];
  dispatched = [];
  const win = new EventTarget();
  win.addEventListener("cr_event", (event) => dispatched.push(event.detail));
  win.ReactNativeWebView = { postMessage: (message) => posted.push(JSON.parse(message)) };
  globalThis.window = win;
  initEvents({ userId: "user-42", lang: "en", book: "book-7" });
});

afterEach(() => {
  delete globalThis.window;
});

test("user_sessions_data envelope carries the required fields", () => {
  emit("level_start", { level_id: 3 });
  assert.equal(posted.length, 1);
  const { type, payload } = posted[0];
  assert.equal(type, "cr_event");
  assert.match(payload.payload_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(payload.cr_user_id, "user-42");
  assert.equal(payload.sub_app_id, SUB_APP_ID);
  assert.equal(payload.payload_version, PAYLOAD_VERSION);
  assert.equal(payload.collection, "user_sessions_data");
  assert.ok(!Number.isNaN(Date.parse(payload.timestamp)));
  assert.deepEqual(payload.data, { type: "level_start", lang: "en", book: "book-7", level_id: 3 });
  assert.equal("options" in payload, false);
});

test("the same envelope is dispatched on window for local observation", () => {
  emit("game_start");
  assert.equal(dispatched.length, 1);
  assert.deepEqual(dispatched[0], posted[0].payload);
});

test("summary_data sends per-word deltas with merge options", () => {
  emitSummary({ timePlayedSeconds: 12, lastLevelId: 4 });
  const { payload } = posted[0];
  assert.equal(payload.collection, "summary_data");
  assert.deepEqual(payload.data, { lang: "en", words_completed: 1, total_time_played: 12, last_level_id: 4 });
  assert.deepEqual(payload.options, { lang: "replace", words_completed: "add", total_time_played: "add", last_level_id: "replace" });
});

test("every payload gets a fresh id", () => {
  emit("a");
  emit("b");
  assert.notEqual(posted[0].payload.payload_id, posted[1].payload.payload_id);
});

test("oversize messages are dropped instead of posted", (t) => {
  t.mock.method(console, "warn", () => {});
  emit("huge", { blob: "x".repeat(MAX_MESSAGE_BYTES) });
  assert.equal(posted.length, 0);
});

test("is a silent no-op outside the container and never throws", () => {
  delete globalThis.window.ReactNativeWebView;
  assert.doesNotThrow(() => emit("game_start"));
  globalThis.window.ReactNativeWebView = { postMessage: () => { throw new Error("bridge down"); } };
  assert.doesNotThrow(() => emit("game_start"));
  delete globalThis.window;
  assert.doesNotThrow(() => emit("game_start"));
});

test("defaults to the catalog code for English", () => {
  initEvents();
  emit("game_start");
  assert.equal(posted[0].payload.data.lang, "english");
  assert.equal(posted[0].payload.cr_user_id, "");
});
