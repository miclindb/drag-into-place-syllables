import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { crc32, createZip, readZip } from "../scripts/lib/zip.mjs";
import {
  buildPackages, ENGINE_SLUG, engineZipName, formatProblem, iconName, iconProblems, langZipName, planPackages,
} from "../scripts/package.mjs";
import { levelAudioPaths } from "../src/game/content.js";
import { languageCodes, validatePack } from "../scripts/validate-content.mjs";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "package-test-"));
}

function hasUnzip() {
  try {
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test("crc32 matches the reference value", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
});

test("createZip round-trips files and directories and is reproducible", () => {
  const entries = [{ name: "a/" }, { name: "a/b.txt", data: Buffer.from("hello") }, { name: "c.bin", data: Buffer.from([0, 255, 7]) }];
  const zip = createZip(entries);
  assert.deepEqual(createZip(entries), zip);
  const back = readZip(zip);
  assert.deepEqual(back.map((entry) => entry.name), ["a/", "a/b.txt", "c.bin"]);
  assert.equal(back[1].data.toString(), "hello");
  assert.deepEqual([...back[2].data], [0, 255, 7]);
});

test("createZip rejects unsafe or duplicate names", () => {
  assert.throws(() => createZip([{ name: "/abs.txt", data: Buffer.from("x") }]));
  assert.throws(() => createZip([{ name: "a/../b.txt", data: Buffer.from("x") }]));
  assert.throws(() => createZip([{ name: "x", data: Buffer.from("1") }, { name: "x", data: Buffer.from("2") }]));
});

test("createZip output passes unzip -t", { skip: !hasUnzip() && "unzip not installed" }, () => {
  const dir = tempDir();
  try {
    const file = path.join(dir, "t.zip");
    fs.writeFileSync(file, createZip([{ name: "d/" }, { name: "d/x.txt", data: Buffer.from("x".repeat(1000)) }]));
    execFileSync("unzip", ["-tq", file], { stdio: "pipe" });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("format checks catch files that lie about their extension", () => {
  const png = fs.readFileSync(new URL("../icons/english.png", import.meta.url));
  assert.equal(formatProblem("x.png", png), null);
  assert.match(formatProblem("x.png", Buffer.from("RIFF0000WEBPVP8 ")), /not a true PNG/);
  assert.match(formatProblem("x.wav", Buffer.from("ID3....")), /not a true WAV/);
  assert.deepEqual(iconProblems("icons/english.png", png), []);
  assert.match(iconProblems("icons/x.png", null)[0], /missing/);
  const wide = Buffer.from(png);
  wide.writeUInt32BE(1024, 16);
  assert.match(iconProblems("icons/x.png", wide)[0], /square/);
});

test("the repository passes every packaging check", () => {
  assert.deepEqual(planPackages().problems, []);
});

test("packages follow the Layout A tier contract and merge cleanly", () => {
  const dir = tempDir();
  try {
    const outDir = path.join(dir, "dist");
    const buildDir = path.join(dir, "build");
    const { problems, artifacts } = buildPackages({ outDir, buildDir });
    assert.deepEqual(problems, []);
    const langs = languageCodes();
    assert.deepEqual(
      artifacts.map((artifact) => artifact.file).sort(),
      [engineZipName(), ...langs.flatMap((lang) => [langZipName(lang), iconName(lang)])].sort(),
    );
    assert.ok(engineZipName().startsWith(`${ENGINE_SLUG}-core`));

    const engine = readZip(fs.readFileSync(path.join(outDir, engineZipName()))).map((entry) => entry.name);
    assert.ok(engine.includes("index.html"), "index.html at the engine ZIP root");
    assert.ok(engine.includes("src/main.js"));
    assert.ok(!engine.some((name) => name.startsWith("lang/")), "engine ZIP has no lang/");
    assert.ok(!engine.some((name) => name.endsWith(".map")));

    const seen = new Set(engine.filter((name) => !name.endsWith("/")));
    for (const lang of langs) {
      const names = readZip(fs.readFileSync(path.join(outDir, langZipName(lang)))).map((entry) => entry.name);
      assert.ok(names.every((name) => name.startsWith(`lang/${lang}/`)), `${lang} ZIP holds only lang/${lang}/`);
      assert.ok(names.includes(`lang/${lang}/levels.json`));
      for (const level of validatePack(lang).levels) {
        levelAudioPaths(level).forEach((audio) => assert.ok(names.includes(audio), `${audio} is packed`));
      }
      for (const name of names.filter((entry) => !entry.endsWith("/"))) {
        assert.ok(!seen.has(name), `${name} would be overwritten`);
        seen.add(name);
      }
      assert.equal(formatProblem("icon.png", fs.readFileSync(path.join(outDir, iconName(lang)))), null);
    }

    assert.ok(fs.existsSync(path.join(buildDir, "index.html")));
    assert.ok(fs.existsSync(path.join(buildDir, "lang", langs[0], "levels.json")));
    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "upload-manifest.json"), "utf8"));
    assert.equal(manifest.engineSlug, ENGINE_SLUG);
    assert.equal(manifest.hasCoreLevel, false);
    assert.ok(manifest.artifacts.every((artifact) => /^[0-9a-f]{64}$/.test(artifact.sha256)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("packaging refuses to write anything when a check fails", () => {
  const dir = tempDir();
  try {
    fs.writeFileSync(path.join(dir, "index.html"), '<script src="https://cdn.example.com/x.js"></script>');
    fs.mkdirSync(path.join(dir, "lang", "english"), { recursive: true });
    fs.writeFileSync(path.join(dir, "lang", "english", "levels.json"), "[]");
    const outDir = path.join(dir, "dist");
    const { problems } = buildPackages({ root: dir, outDir, buildDir: path.join(dir, "build") });
    assert.ok(problems.some((problem) => problem.includes("http-url")));
    assert.ok(problems.some((problem) => problem.includes("no levels")));
    assert.ok(problems.some((problem) => problem.includes("missing tile icon")));
    assert.equal(fs.existsSync(outDir), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
