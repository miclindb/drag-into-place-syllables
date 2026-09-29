import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FORBIDDEN_PATTERNS, scan, shippedFiles } from "../scripts/check-offline.mjs";

test("every forbidden pattern fires on its fixture", () => {
  for (const pattern of FORBIDDEN_PATTERNS) {
    assert.ok(pattern.regex.test(pattern.fixture), pattern.label);
  }
});

test("the shipped game has no offline-breaking patterns", () => {
  assert.deepEqual(scan(shippedFiles()), []);
});

test("scan reports the file and line of a violation", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "offline-check-"));
  const file = path.join(dir, "bad.js");
  fs.writeFileSync(file, "const ok = 1;\nconst player = new Audio();\nfetch('./levels.json');\n");
  try {
    const hits = scan([file]);
    assert.deepEqual(hits.map((hit) => hit.label).sort(), ["audio-element", "fetch-call"]);
    assert.ok(hits.find((hit) => hit.label === "audio-element").where.endsWith(":2"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
