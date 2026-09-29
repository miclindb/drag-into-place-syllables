import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { levelAudioPaths, levelsPath, normalizeLevel, syllableAudioPath, validateLevel, validateLevels } from "../src/game/content.js";
import { DEFAULT_LANG } from "../src/game/launch.js";
import { languageCodes, validatePack } from "../scripts/validate-content.mjs";
import { bananaLevel } from "./helpers.js";

test("every shipped language pack is valid", () => {
  const langs = languageCodes();
  assert.ok(langs.includes(DEFAULT_LANG));
  for (const lang of langs) {
    const raw = JSON.parse(fs.readFileSync(new URL(`../${levelsPath(lang).slice(2)}`, import.meta.url), "utf8"));
    const { levels, errors } = validateLevels(raw, lang);
    assert.deepEqual(errors, [], lang);
    assert.equal(levels.length, raw.length);
    assert.deepEqual(validatePack(lang).problems, [], lang);
  }
});

test("content paths live inside the language pack", () => {
  assert.equal(levelsPath("english"), "./lang/english/levels.json");
  assert.equal(levelsPath("isixhosa"), "./lang/isixhosa/levels.json");
  assert.equal(levelsPath(), `./lang/${DEFAULT_LANG}/levels.json`);
});

test("normalizeLevel accepts the brief's letters/foils schema", () => {
  const level = normalizeLevel({ level_id: 3, target_word: "cat", letters: ["c", "a", "t"], foils: ["x"] });
  assert.deepEqual(level.syllables, ["c", "a", "t"]);
  assert.deepEqual(level.foils, ["x"]);
  assert.deepEqual(validateLevel({ level_id: 3, target_word: "cat", letters: ["c", "a", "t"], foils: ["x"] }), []);
});

test("rejects syllables that do not spell the word", () => {
  const problems = validateLevel({ ...bananaLevel, syllables: ["ba", "na"] });
  assert.ok(problems.some((problem) => problem.includes("do not spell")));
});

test("rejects non-Roman letters in words, syllables and foils", () => {
  assert.ok(validateLevel({ ...bananaLevel, target_word: "bañana" }).length);
  assert.ok(validateLevel({ ...bananaLevel, syllables: ["ба", "na", "na"] }).length);
  assert.ok(validateLevel({ ...bananaLevel, syllable_foils: ["b3"] }).length);
});

test("rejects a foil that is also a real syllable", () => {
  const problems = validateLevel({ ...bananaLevel, syllable_foils: ["NA"] });
  assert.ok(problems.some((problem) => problem.includes("also a real syllable")));
});

test("rejects absolute or remote audio paths and bad override slots", () => {
  assert.ok(validateLevel({ ...bananaLevel, audio: "/lang/english/audios/banana.wav" }).length);
  assert.ok(validateLevel({ ...bananaLevel, audio: "https://example.com/banana.wav" }).length);
  assert.ok(validateLevel({ ...bananaLevel, syllable_audio_overrides: { 7: "lang/english/audios/x.wav" } }).length);
});

test("rejects audio outside the level's own language pack", () => {
  assert.deepEqual(validateLevel(bananaLevel, "english"), []);
  assert.ok(validateLevel({ ...bananaLevel, audio: "assets/audio/banana.wav" }).length);
  assert.ok(validateLevel({ ...bananaLevel, audio: "lang/english/audios/../../x.wav" }).length);
  assert.ok(validateLevel(bananaLevel, "isixhosa").some((problem) => problem.includes("lang/isixhosa/audios/")));
});

test("validateLevels skips invalid and duplicate levels but keeps valid ones", () => {
  const { levels, errors } = validateLevels([
    bananaLevel,
    { ...bananaLevel },
    { level_id: 2, target_word: "cat", syllables: ["dog"] },
  ]);
  assert.equal(levels.length, 1);
  assert.deepEqual(errors.map((error) => error.index), [1, 2]);
  assert.ok(errors[0].problems.some((problem) => problem.includes("duplicate")));
});

test("validateLevels rejects a non-array file", () => {
  const { levels, errors } = validateLevels({ level_id: 1 });
  assert.equal(levels.length, 0);
  assert.equal(errors.length, 1);
});

test("syllable clips default to the language pack's audios/syllables/", () => {
  const raw = { ...bananaLevel, audio: "lang/isixhosa/audios/banana.wav", syllable_audio_overrides: {} };
  const level = validateLevels([raw], "isixhosa").levels[0];
  assert.equal(syllableAudioPath(level, 0), "lang/isixhosa/audios/syllables/ba.wav");
});

test("syllable audio uses per-slot overrides for position-dependent sounds", () => {
  const level = normalizeLevel(bananaLevel);
  assert.equal(syllableAudioPath(level, 1), "lang/english/audios/syllables/na.wav");
  assert.equal(syllableAudioPath(level, 2), "lang/english/audios/syllables/na_unstressed.wav");
  assert.deepEqual(levelAudioPaths(level), [
    "lang/english/audios/banana.wav",
    "lang/english/audios/syllables/ba.wav",
    "lang/english/audios/syllables/na.wav",
    "lang/english/audios/syllables/na_unstressed.wav",
  ]);
});
