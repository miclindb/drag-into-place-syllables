// Level content: loading, normalization and validation.
//
// Each language pack's `lang/<code>/levels.json` is the single source of truth
// for that language. The same `validateLevels()` runs at startup (invalid
// levels are skipped and reported) and in `scripts/validate-content.mjs`
// (invalid content fails the check).

import { DEFAULT_LANG } from "./launch.js";

/** Root of a language pack, relative to index.html. */
export function langDir(lang = DEFAULT_LANG) {
  return `lang/${lang}`;
}

export function levelsPath(lang = DEFAULT_LANG) {
  return `./${langDir(lang)}/levels.json`;
}

export function syllableAudioDir(lang = DEFAULT_LANG) {
  return `${langDir(lang)}/audios/syllables`;
}

const ROMAN = /^[a-z]+$/i;

// XHR instead of the Fetch API: on the container's file:// WebView Fetch is
// blocked, while XHR succeeds with status 0.
export function loadJSON(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = "text";
    xhr.onload = () => {
      if (xhr.status !== 200 && xhr.status !== 0) {
        reject(new Error(`loadJSON ${url} → ${xhr.status}`));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch (error) {
        reject(new Error(`loadJSON ${url}: ${error.message}`));
      }
    };
    xhr.onerror = () => reject(new Error(`loadJSON XHR error: ${url}`));
    xhr.send();
  });
}

// Accepts both the syllable schema (`syllables`/`syllable_foils`) and the
// original brief's letter schema (`letters`/`foils`).
export function normalizeLevel(raw, lang = DEFAULT_LANG) {
  return {
    level_id: raw.level_id,
    target_word: raw.target_word,
    syllables: raw.syllables ?? raw.letters ?? [],
    foils: raw.syllable_foils ?? raw.foils ?? [],
    image: raw.image ?? "",
    audio: raw.audio ?? "",
    syllable_audio_overrides: raw.syllable_audio_overrides ?? {},
    syllable_audio_dir: syllableAudioDir(lang),
  };
}

function isRelativePath(value) {
  return typeof value === "string"
    && value.length > 0
    && !value.startsWith("/")
    && !/^[a-z][a-z0-9+.-]*:/i.test(value);
}

function isRomanList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && ROMAN.test(item));
}

// Audio must ship inside the level's own language pack, so each lang ZIP is
// self-contained.
function isInLangPack(value, lang) {
  return isRelativePath(value) && value.startsWith(`${langDir(lang)}/audios/`) && !value.split("/").includes("..");
}

/** Returns a list of human-readable problems; empty means the level is valid. */
export function validateLevel(raw, lang = DEFAULT_LANG) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ["level must be an object"];
  const problems = [];
  const level = normalizeLevel(raw, lang);

  if (!Number.isInteger(level.level_id)) problems.push("level_id must be an integer");
  const wordOk = typeof level.target_word === "string" && ROMAN.test(level.target_word);
  if (!wordOk) problems.push("target_word must contain only Roman letters (a-z)");

  if (!level.syllables.length || !isRomanList(level.syllables)) {
    problems.push("syllables must be a non-empty list of Roman-letter strings");
  } else if (wordOk && level.syllables.join("").toLowerCase() !== level.target_word.toLowerCase()) {
    problems.push(`syllables "${level.syllables.join("+")}" do not spell "${level.target_word}"`);
  }

  if (!isRomanList(level.foils)) {
    problems.push("foils must be a list of Roman-letter strings");
  } else if (isRomanList(level.syllables)) {
    const real = new Set(level.syllables.map((syllable) => syllable.toLowerCase()));
    level.foils
      .filter((foil) => real.has(foil.toLowerCase()))
      .forEach((foil) => problems.push(`foil "${foil}" is also a real syllable of the word`));
  }

  const audioRule = `must be a relative path inside ${langDir(lang)}/audios/`;
  if (level.audio && !isInLangPack(level.audio, lang)) problems.push(`audio ${audioRule}`);
  Object.entries(level.syllable_audio_overrides).forEach(([slot, path]) => {
    const index = Number(slot);
    if (!Number.isInteger(index) || index < 0 || index >= level.syllables.length) {
      problems.push(`syllable_audio_overrides key "${slot}" is not a valid slot index`);
    }
    if (!isInLangPack(path, lang)) problems.push(`syllable_audio_overrides["${slot}"] ${audioRule}`);
  });
  return problems;
}

/**
 * Validates a whole level list. Valid levels come back normalized; each
 * invalid level is reported as `{ index, level_id, problems }`.
 */
export function validateLevels(rawLevels, lang = DEFAULT_LANG) {
  if (!Array.isArray(rawLevels)) {
    return { levels: [], errors: [{ index: -1, level_id: null, problems: ["levels file must be a JSON array"] }] };
  }
  const levels = [];
  const errors = [];
  const seenIds = new Set();
  rawLevels.forEach((raw, index) => {
    const problems = validateLevel(raw, lang);
    const id = raw?.level_id;
    if (Number.isInteger(id)) {
      if (seenIds.has(id)) problems.push(`duplicate level_id ${id}`);
      seenIds.add(id);
    }
    if (problems.length) errors.push({ index, level_id: id ?? null, problems });
    else levels.push(normalizeLevel(raw, lang));
  });
  return { levels, errors };
}

// Some syllables (e.g. the repeated "na" in banana, or "to" in tomato) are
// pronounced differently depending on where they land in the word, so a
// level can override the shared per-spelling clip for a specific slot index.
export function syllableAudioPath(level, slotIndex) {
  const override = level.syllable_audio_overrides?.[String(slotIndex)];
  return override || `${level.syllable_audio_dir}/${level.syllables[slotIndex].toLowerCase()}.wav`;
}

/** Every audio file a level may play (for preloading and the asset check). */
export function levelAudioPaths(level) {
  const paths = level.syllables.map((_, slotIndex) => syllableAudioPath(level, slotIndex));
  if (level.audio) paths.unshift(level.audio);
  return [...new Set(paths)];
}
