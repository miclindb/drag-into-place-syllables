#!/usr/bin/env node
// Packages the game for the Curious Reader container as a Layout A (2-tier)
// game: one engine ZIP plus one ZIP per language pack, each with its tile icon.
//
//   dist/<engine>-core.zip             index.html, styles.css, src/ (no lang/)
//   dist/<engine>-lang-<code>.zip      lang/<code>/ only
//   dist/<engine>-lang-<code>.png      tile icon, uploaded next to the lang ZIP
//   dist/upload-manifest.json          sizes and sha256 for the upload step
//   build/                             engine + every pack merged, as on a device
//
// Every content, offline and format check runs first; any failure aborts
// before anything is written.
//
// Usage: node scripts/package.mjs
// Exit 0 = packages written. Exit 1 = a check failed.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createZip } from "./lib/zip.mjs";
import { scan } from "./check-offline.mjs";
import { languageCodes, validatePack } from "./validate-content.mjs";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");

// Permanent CMS identity. Agree it with Curious Learning before the first
// upload: once reserved it can never be renamed or reused.
export const ENGINE_SLUG = "syllables-drag-into-place";

// Everything the engine tier ships, relative to the repository root.
export const ENGINE_PATHS = ["index.html", "styles.css", "src", "assets"];

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
export const INLINE_UPLOAD_BYTES = 10 * 1024 * 1024;
const MIN_ICON_SIZE = 192;
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav"]);

export const engineZipName = (slug = ENGINE_SLUG) => `${slug}-core.zip`;
export const langZipName = (lang, slug = ENGINE_SLUG) => `${slug}-lang-${lang}.zip`;
export const iconName = (lang, slug = ENGINE_SLUG) => `${slug}-lang-${lang}.png`;

function toPosix(relative) {
  return relative.split(path.sep).join("/");
}

function walk(root, relative) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) return [];
  if (fs.statSync(full).isFile()) return [toPosix(relative)];
  return fs.readdirSync(full, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => walk(root, path.join(relative, entry.name)));
}

const MAGIC = {
  ".png": (data) => data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  ".jpg": (data) => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff,
  ".jpeg": (data) => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff,
  ".webp": (data) => data.toString("latin1", 0, 4) === "RIFF" && data.toString("latin1", 8, 12) === "WEBP",
  ".wav": (data) => data.toString("latin1", 0, 4) === "RIFF" && data.toString("latin1", 8, 12) === "WAVE",
  ".mp3": (data) => data.toString("latin1", 0, 3) === "ID3" || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0),
};

/** A file must really be the format its extension claims (spec §4). */
export function formatProblem(name, data) {
  const check = MAGIC[path.extname(name).toLowerCase()];
  return check && !check(data) ? `${name} is not a true ${path.extname(name).slice(1).toUpperCase()} file` : null;
}

export function iconProblems(name, data) {
  if (!data) return [`missing tile icon ${name}`];
  const format = formatProblem(name, data);
  if (format || path.extname(name).toLowerCase() !== ".png") return [format ?? `${name} must be a PNG`];
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (width !== height) return [`${name} must be square (is ${width}×${height})`];
  if (width < MIN_ICON_SIZE) return [`${name} must be at least ${MIN_ICON_SIZE}×${MIN_ICON_SIZE} (is ${width}×${height})`];
  return [];
}

function readEntries(root, files) {
  return files.map((name) => ({ name, data: fs.readFileSync(path.join(root, name)) }));
}

// Directory entries for the parent folders, so any extractor recreates them.
// `skip` leading levels are left out: a lang ZIP holds only `lang/<code>/…`,
// not the shared `lang/` folder itself.
function withDirectories(entries, skip = 0) {
  const dirs = new Set();
  for (const { name } of entries) {
    const parts = name.split("/").slice(0, -1);
    parts.forEach((_, index) => {
      if (index >= skip) dirs.add(`${parts.slice(0, index + 1).join("/")}/`);
    });
  }
  return [...[...dirs].sort().map((name) => ({ name })), ...entries];
}

/**
 * Collects and checks everything. Returns `{ problems, engine, packs }`; the
 * package is only written when `problems` is empty.
 */
export function planPackages({ root = ROOT, langs = languageCodes(root) } = {}) {
  const problems = [];
  const engineFiles = ENGINE_PATHS.flatMap((relative) => walk(root, relative));
  if (!engineFiles.includes("index.html")) problems.push("engine: index.html is missing");
  engineFiles.filter((name) => name.startsWith("lang/")).forEach((name) => problems.push(`engine: ${name} must not be under lang/`));

  const textFiles = engineFiles.filter((name) => /\.(html|css|js)$/.test(name)).map((name) => path.join(root, name));
  scan(textFiles).forEach((hit) => problems.push(`engine: [${hit.label}] ${hit.where}: ${hit.description}`));

  const engine = readEntries(root, engineFiles);
  if (!langs.length) problems.push("no language packs found under lang/");

  const packs = langs.map((lang) => {
    const files = walk(root, path.join("lang", lang));
    const { levels, problems: contentProblems } = validatePack(lang, root);
    contentProblems.forEach((problem) => problems.push(`lang/${lang}: ${problem}`));
    files
      .filter((name) => name.startsWith(`lang/${lang}/audios/`) && !AUDIO_EXTENSIONS.has(path.extname(name).toLowerCase()))
      .forEach((name) => problems.push(`${name}: audio must be MP3 or WAV`));
    const iconFile = path.join(root, "icons", `${lang}.png`);
    const icon = fs.existsSync(iconFile) ? fs.readFileSync(iconFile) : null;
    iconProblems(`icons/${lang}.png`, icon).forEach((problem) => problems.push(problem));
    return { lang, levels: levels.length, entries: readEntries(root, files), icon };
  });

  for (const { name, data } of [...engine, ...packs.flatMap((pack) => pack.entries)]) {
    if (name.endsWith(".map")) problems.push(`${name}: source maps must not ship`);
    const format = formatProblem(name, data);
    if (format) problems.push(format);
  }
  return { problems, engine, packs };
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** Runs every check, then writes the ZIPs, icons, upload manifest and build/ tree. */
export function buildPackages({ root = ROOT, outDir = path.join(root, "dist"), buildDir = path.join(root, "build"), langs } = {}) {
  const { problems, engine, packs } = planPackages({ root, langs });
  if (problems.length) return { problems, artifacts: [] };

  const artifacts = [];
  const write = (name, data, extra) => {
    fs.writeFileSync(path.join(outDir, name), data);
    artifacts.push({ file: name, bytes: data.length, sha256: sha256(data), ...extra });
  };

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  write(engineZipName(), createZip(withDirectories(engine)), { tier: "engine" });
  for (const pack of packs) {
    write(langZipName(pack.lang), createZip(withDirectories(pack.entries, 1)), { tier: "lang", langCode: pack.lang, levels: pack.levels });
    write(iconName(pack.lang), pack.icon, { tier: "icon", langCode: pack.lang });
  }
  const manifest = {
    engineSlug: ENGINE_SLUG,
    layout: "A",
    hasCoreLevel: false,
    urlQuery: "?cr_lang={lang}",
    artifacts,
  };
  fs.writeFileSync(path.join(outDir, "upload-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  // The same merged tree a device gets after extracting engine → lang ZIPs.
  fs.rmSync(buildDir, { recursive: true, force: true });
  for (const { name, data } of [...engine, ...packs.flatMap((pack) => pack.entries)]) {
    const target = path.join(buildDir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
  return { problems: [], artifacts };
}

function formatBytes(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

function main() {
  const { problems, artifacts } = buildPackages();
  if (problems.length) {
    console.error(`❌ ${problems.length} packaging problem(s); nothing was written:`);
    problems.forEach((problem) => console.error(`   - ${problem}`));
    process.exit(1);
  }
  console.log(`✅ Packaged engine "${ENGINE_SLUG}" (Layout A) into dist/:`);
  for (const { file, bytes, sha256: hash } of artifacts) {
    console.log(`   ${file.padEnd(48)} ${formatBytes(bytes).padStart(9)}  sha256 ${hash}`);
    if (bytes > MAX_UPLOAD_BYTES) console.warn(`   ⚠️  ${file} exceeds the 200 MB upload limit`);
    else if (file.endsWith(".zip") && bytes > INLINE_UPLOAD_BYTES) console.log("      (over 10 MB: upload with begin_upload/upload_chunk)");
  }
  console.log("   build/ holds the merged tree for the file:// offline test.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
