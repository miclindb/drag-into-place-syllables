#!/usr/bin/env node
// Validates every language pack's levels.json with the same rules the game
// applies at startup, and additionally checks that every referenced audio file
// exists inside that pack.
//
// Usage: node scripts/validate-content.mjs [langCode ...]   (default: every pack in lang/)
// Exit 0 = content is valid. Exit 1 = one or more problems.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { langDir, levelAudioPaths, levelsPath, validateLevels } from "../src/game/content.js";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");

export function languageCodes(root = ROOT) {
  const dir = path.join(root, "lang");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Returns `{ levels, problems }` for one language pack under `root`. */
export function validatePack(lang, root = ROOT) {
  const file = path.join(root, levelsPath(lang));
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return { levels: [], problems: [`could not read ${path.relative(root, file)}: ${error.message}`] };
  }
  const { levels, errors } = validateLevels(raw, lang);
  const problems = errors.flatMap(({ index, level_id: id, problems: list }) =>
    list.map((problem) => `level #${index} (level_id ${id}): ${problem}`));
  if (!levels.length && !problems.length) problems.push("no levels");
  for (const level of levels) {
    for (const audioPath of levelAudioPaths(level)) {
      if (!fs.existsSync(path.join(root, audioPath))) {
        problems.push(`level_id ${level.level_id}: missing audio file ${audioPath}`);
      }
    }
  }
  return { levels, problems };
}

function main() {
  const codes = process.argv.slice(2).length ? process.argv.slice(2) : languageCodes();
  if (!codes.length) {
    console.error("❌ No language packs found under lang/.");
    process.exit(1);
  }
  let failed = false;
  for (const lang of codes) {
    const { levels, problems } = validatePack(lang);
    if (problems.length) {
      failed = true;
      console.error(`❌ ${problems.length} content problem(s) in ${langDir(lang)}/:`);
      problems.forEach((problem) => console.error(`   - ${problem}`));
    } else {
      console.log(`✅ ${langDir(lang)}: ${levels.length} level(s) valid; all referenced audio files exist.`);
    }
  }
  if (failed) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
