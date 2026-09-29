// localStorage persistence. Progress and score are scoped per language so a
// device with several language packs keeps them apart. Storage can be
// unavailable in restricted WebViews, so every access fails silently.

import { DEFAULT_LANG } from "./launch.js";

// Keys used before progress became language-scoped. They are still read (for
// the default language only) so existing players keep their progress.
export const LEGACY_KEYS = Object.freeze({
  progress: "dragIntoPlace.progress.v1",
  score: "dragIntoPlace.score.v1",
  moving: "dragIntoPlace.movingTiles.v1",
});

// Before launch codes followed the Curious Learning catalog, English was
// stored under `en`. Those keys are still read for the default language.
export const LEGACY_LANG = "en";

export function storageKey(lang, suffix) {
  return `dip_${lang}_${suffix}`;
}

export const MOVING_KEY = "dip_moving";

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readJSON(storage, key) {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function writeJSON(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled: progress simply isn't kept.
  }
}

function readWithLegacy(storage, lang, suffix, legacyKey) {
  const value = readJSON(storage, storageKey(lang, suffix));
  if (value !== undefined || lang !== DEFAULT_LANG) return value;
  return readJSON(storage, storageKey(LEGACY_LANG, suffix)) ?? readJSON(storage, legacyKey);
}

export function createStorage(lang = DEFAULT_LANG, storage = defaultStorage()) {
  return {
    /** `{ order: level_id[], levelIndex }` or null. */
    getProgress() {
      const saved = readWithLegacy(storage, lang, "progress", LEGACY_KEYS.progress);
      return saved && typeof saved === "object" ? saved : null;
    },
    saveProgress(levels, levelIndex) {
      writeJSON(storage, storageKey(lang, "progress"), { order: levels.map((level) => level.level_id), levelIndex });
    },
    getScore() {
      const saved = readWithLegacy(storage, lang, "score", LEGACY_KEYS.score);
      return {
        correct: Number.isFinite(saved?.correct) ? saved.correct : 0,
        mistakes: Number.isFinite(saved?.mistakes) ? saved.mistakes : 0,
      };
    },
    saveScore(score) {
      writeJSON(storage, storageKey(lang, "score"), { correct: score.correct, mistakes: score.mistakes });
    },
    getMoving() {
      const value = readJSON(storage, MOVING_KEY) ?? readJSON(storage, LEGACY_KEYS.moving);
      return value === true;
    },
    saveMoving(enabled) {
      writeJSON(storage, MOVING_KEY, Boolean(enabled));
    },
  };
}
