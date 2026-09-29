#!/usr/bin/env node
// Minimal static server for local development (ES modules and XHR need an
// http:// origin in desktop browsers). Usage: node scripts/serve.mjs [port]

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8765);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

http.createServer((request, response) => {
  const { pathname } = new URL(request.url, "http://localhost");
  const relative = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const file = path.join(ROOT, path.normalize(relative));
  if (!file.startsWith(ROOT + path.sep)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    response.end(data);
  });
}).listen(PORT, () => console.log(`Serving ${ROOT} at http://localhost:${PORT}/`));
