#!/usr/bin/env node
// Offline-delivery check: fails if shipped game files contain patterns that
// break inside the Curious Reader file:// WebView (network loads, media
// elements, absolute paths). A self-test canary runs first so a broken regex
// can't silently let bad code through.
//
// Usage: node scripts/check-offline.mjs
// Exit 0 = all checks pass. Exit 1 = one or more failures.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");

export const FORBIDDEN_PATTERNS = [
  {
    label: "absolute-path-attr",
    regex: /(src|href|srcset)\s*=\s*["']\//,
    description: 'absolute local path in src/href/srcset (="/…") breaks file:// loading',
    fixture: '<link href="/styles.css">',
  },
  {
    label: "absolute-url-css",
    regex: /url\(["']?\//,
    description: "absolute CSS url(/…) breaks file:// loading",
    fixture: "background: url(/images/bg.png);",
  },
  {
    label: "http-url",
    regex: /(src|href)\s*=\s*["']https?:\/\/|url\(["']?https?:\/\/|@import\s+["']https?:\/\/|\bfrom\s+["']https?:\/\//,
    description: "external URL in a resource-loading context breaks offline use",
    fixture: '<script src="https://cdn.example.com/lib.js">',
  },
  {
    label: "at-import",
    regex: /@import\b/,
    description: "CSS @import triggers an extra load; keep styles in one file",
    fixture: '@import "variables.css";',
  },
  {
    label: "fetch-call",
    regex: /\bfetch\s*\(/,
    description: "fetch() fails on file://; use XHR (loadJSON/loadBinary)",
    fixture: "const res = await fetch('./levels.json');",
  },
  {
    label: "network-api",
    regex: /\bnew\s+(WebSocket|EventSource)\s*\(|\bsendBeacon\s*\(/,
    description: "WebSocket/EventSource/sendBeacon need a network; the container blocks them",
    fixture: "const socket = new WebSocket(url);",
  },
  {
    label: "service-worker",
    regex: /\bserviceWorker\b/,
    description: "Service Workers always fail on file://; the container stubs them out",
    fixture: "navigator.serviceWorker.register('./sw.js');",
  },
  {
    label: "cache-storage",
    regex: /\bcaches\.(open|match|has|keys|delete)\s*\(/,
    description: "the Cache Storage API rejects file:// requests",
    fixture: "const cache = await caches.open('game-assets');",
  },
  {
    label: "source-map",
    regex: /[#@]\s*sourceMappingURL=/,
    description: "source maps must not ship",
    fixture: "//# sourceMappingURL=main.js.map",
  },
  {
    label: "audio-element",
    regex: /<audio[\s>]|\bnew\s+Audio\s*\(/i,
    description: "media elements fail on file://; use XHR + Web Audio (src/game/audio.js)",
    fixture: "const player = new Audio();",
  },
];

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

export function shippedFiles() {
  return [
    path.join(ROOT, "index.html"),
    path.join(ROOT, "styles.css"),
    ...listFiles(path.join(ROOT, "src")).filter((file) => file.endsWith(".js")),
  ];
}

export function scan(files) {
  const hits = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.regex.test(line)) {
          hits.push({ label: pattern.label, description: pattern.description, where: `${path.relative(ROOT, file)}:${index + 1}`, snippet: line.trim().slice(0, 120) });
        }
      }
    });
  }
  return hits;
}

function main() {
  let failed = false;
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (!pattern.regex.test(pattern.fixture)) {
      console.error(`❌ Pattern self-test: "${pattern.label}" did not match its fixture ${JSON.stringify(pattern.fixture)}`);
      failed = true;
    }
  }
  if (failed) process.exit(1);

  const files = shippedFiles();
  const hits = scan(files);
  if (hits.length) {
    console.error(`❌ ${hits.length} offline-compatibility problem(s):`);
    hits.forEach((hit) => console.error(`   - [${hit.label}] ${hit.where}: ${hit.snippet}\n     ${hit.description}`));
    process.exit(1);
  }
  console.log(`✅ ${files.length} shipped file(s) scanned; no offline-breaking patterns.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
