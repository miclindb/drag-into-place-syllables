import { test } from "node:test";
import assert from "node:assert/strict";
import { createStorage, LEGACY_KEYS, LEGACY_LANG, MOVING_KEY, storageKey } from "../src/game/storage.js";
import { DEFAULT_LANG, readLaunchParams } from "../src/game/launch.js";
import { memoryStorage } from "./helpers.js";

test("progress and score round-trip under language-scoped keys", () => {
  const backing = memoryStorage();
  const storage = createStorage("english", backing);
  storage.saveProgress([{ level_id: 4 }, { level_id: 2 }], 1);
  storage.saveScore({ correct: 3, mistakes: 1 });
  assert.deepEqual(storage.getProgress(), { order: [4, 2], levelIndex: 1 });
  assert.deepEqual(storage.getScore(), { correct: 3, mistakes: 1 });
  assert.ok(backing.dump()[storageKey("english", "progress")]);
});

test("languages do not share progress", () => {
  const backing = memoryStorage();
  createStorage("english", backing).saveScore({ correct: 9, mistakes: 0 });
  assert.deepEqual(createStorage("fr", backing).getScore(), { correct: 0, mistakes: 0 });
});

test("legacy keys are still read for the default language only", () => {
  const backing = memoryStorage({
    [LEGACY_KEYS.progress]: JSON.stringify({ order: [1, 2], levelIndex: 1 }),
    [LEGACY_KEYS.score]: JSON.stringify({ correct: 7, mistakes: 2 }),
    [LEGACY_KEYS.moving]: "true",
  });
  const english = createStorage("english", backing);
  assert.deepEqual(english.getProgress(), { order: [1, 2], levelIndex: 1 });
  assert.deepEqual(english.getScore(), { correct: 7, mistakes: 2 });
  assert.equal(english.getMoving(), true);
  assert.equal(createStorage("fr", backing).getProgress(), null);
});

test("english still reads progress saved under the old `en` code", () => {
  const backing = memoryStorage({
    [storageKey(LEGACY_LANG, "progress")]: JSON.stringify({ order: [3, 1], levelIndex: 0 }),
    [storageKey(LEGACY_LANG, "score")]: JSON.stringify({ correct: 4, mistakes: 1 }),
    [LEGACY_KEYS.score]: JSON.stringify({ correct: 7, mistakes: 2 }),
  });
  const english = createStorage(DEFAULT_LANG, backing);
  assert.deepEqual(english.getProgress(), { order: [3, 1], levelIndex: 0 });
  assert.deepEqual(english.getScore(), { correct: 4, mistakes: 1 });
  english.saveScore({ correct: 5, mistakes: 1 });
  assert.ok(backing.dump()[storageKey(DEFAULT_LANG, "score")]);
  assert.equal(createStorage("isixhosa", backing).getProgress(), null);
});

test("new keys win over legacy keys", () => {
  const backing = memoryStorage({
    [LEGACY_KEYS.score]: JSON.stringify({ correct: 7, mistakes: 2 }),
    [storageKey(LEGACY_LANG, "score")]: JSON.stringify({ correct: 3, mistakes: 3 }),
    [storageKey("english", "score")]: JSON.stringify({ correct: 1, mistakes: 0 }),
    [MOVING_KEY]: "false",
    [LEGACY_KEYS.moving]: "true",
  });
  const storage = createStorage("english", backing);
  assert.deepEqual(storage.getScore(), { correct: 1, mistakes: 0 });
  assert.equal(storage.getMoving(), false);
});

test("corrupt, missing or throwing storage falls back to defaults", () => {
  const corrupt = createStorage("english", memoryStorage({ [storageKey("english", "score")]: "{not json" }));
  assert.deepEqual(corrupt.getScore(), { correct: 0, mistakes: 0 });
  const none = createStorage("english", null);
  assert.equal(none.getProgress(), null);
  assert.doesNotThrow(() => none.saveScore({ correct: 1, mistakes: 0 }));
  const throwing = createStorage("english", { getItem() { throw new Error("denied"); }, setItem() { throw new Error("full"); } });
  assert.equal(throwing.getMoving(), false);
  assert.doesNotThrow(() => throwing.saveMoving(true));
});

test("launch params are read with defaults", () => {
  assert.deepEqual(readLaunchParams("?cr_lang=isixhosa&cr_book=b1&cr_user_id=u9"), { lang: "isixhosa", book: "b1", userId: "u9" });
  assert.deepEqual(readLaunchParams(""), { lang: "english", book: "", userId: "" });
  assert.equal(DEFAULT_LANG, "english");
});

test("cr_lang is normalized and must be a safe catalog code", () => {
  assert.equal(readLaunchParams("?cr_lang=English").lang, "english");
  assert.equal(readLaunchParams("?cr_lang=../../etc").lang, DEFAULT_LANG);
  assert.equal(readLaunchParams("?cr_lang=two%20words").lang, DEFAULT_LANG);
});
