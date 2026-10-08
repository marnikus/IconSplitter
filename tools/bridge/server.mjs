// tools/bridge/server.mjs — the Inkscape helper (2026-10-09, design D2): a
// tiny HTTP server on 127.0.0.1 that lets the browser app run Inkscape on
// this machine. Routes: `GET /health` (is Inkscape here, which version),
// `POST /convert/eps` (SVG text in, EPS text out — or a JSON `{ reason }`,
// never a half file), and `/` serving `dist/` so `run_app_inkscape.bat` can
// open the app from the SAME origin (no CORS at all). Privacy (RULE 20
// adapted): loopback only; the log names method, status, duration and byte
// counts — never content, never a file name from the package. No dependencies.
//
//   node tools/bridge/server.mjs [--port 47391] [--inkscape <path>] [--dist <dir>]
//   env: INKSCAPE_PATH, BRIDGE_TIMEOUT_MS (60000), BRIDGE_MAX_BYTES (20 MB)

import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convertEps, findInkscape } from "./inkscape.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 47391;
const ALLOWED_ORIGIN = /^(null|https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

/** --flag value pairs from argv. */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) { out[argv[i].slice(2)] = argv[i + 1]; i += 1; }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const config = {
  port: Number(args.port ?? process.env.BRIDGE_PORT ?? DEFAULT_PORT),
  inkscape: args.inkscape,
  dist: path.resolve(args.dist ?? path.join(HERE, "..", "..", "dist")),
  timeoutMs: Number(process.env.BRIDGE_TIMEOUT_MS ?? 60000),
  maxBytes: Number(process.env.BRIDGE_MAX_BYTES ?? 20 * 1024 * 1024),
  tmpRoot: process.env.BRIDGE_TMP,
};

let queue = Promise.resolve(); // one conversion at a time; the batch is sequential anyway

/** CORS/PNA headers for an allowed origin; false when the origin is foreign. */
function cors(req, res) {
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  if (!ALLOWED_ORIGIN.test(origin)) return false;
  res.setHeader("access-control-allow-origin", origin);
  res.setHeader("vary", "origin");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("access-control-expose-headers", "x-inkscape-version");
  if (req.headers["access-control-request-private-network"] === "true") res.setHeader("access-control-allow-private-network", "true");
  return true;
}

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(text) });
  res.end(text);
  return Buffer.byteLength(text);
}

/** Reads the body up to the limit; null when it is larger (the caller answers 413 and the connection closes). */
function readBody(req, limit) {
  if (Number(req.headers["content-length"] ?? 0) > limit) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) { req.pause(); resolve(null); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function health(res, port) {
  const inkscape = findInkscape(config.inkscape);
  return json(res, 200, { ok: inkscape.found, inkscape, port });
}

async function convert(req, res) {
  const body = await readBody(req, config.maxBytes);
  if (body === null) {
    res.setHeader("connection", "close"); // the rest of the body is never read
    return json(res, 413, { reason: `the SVG is larger than the helper's limit (${config.maxBytes} bytes)` });
  }
  if (!/<svg[\s>]/.test(body)) return json(res, 400, { reason: "the body is not an SVG document" });
  const inkscape = findInkscape(config.inkscape);
  if (!inkscape.found) return json(res, 503, { reason: `Inkscape was not found — ${inkscape.fix}` });
  const result = await enqueue(() => convertEps(inkscape.path, body, {
    timeoutMs: config.timeoutMs, tmpRoot: config.tmpRoot, onKill: (kill) => res.once("close", () => { if (!res.writableEnded) kill(); }), // the browser went away (RULE 7)
  }));
  if (!result.ok) return json(res, result.status, { reason: result.reason });
  const bytes = Buffer.byteLength(result.eps);
  res.writeHead(200, { "content-type": "application/postscript", "content-length": bytes, "x-inkscape-version": inkscape.version });
  res.end(result.eps);
  return bytes;
}

function enqueue(job) {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
}

/** `dist/` at `/`: index.html for `/`, files below dist only (no path escape), honest 404s. */
function serveDist(url, res) {
  const rel = url === "/" ? "index.html" : decodeURIComponent(url.slice(1));
  const file = path.resolve(config.dist, rel);
  if (!file.startsWith(config.dist + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
    const hint = rel === "index.html" ? `no built app at ${config.dist} — run "npm run build" (or run_app_inkscape.bat) first` : "not found";
    return json(res, 404, { reason: hint });
  }
  const data = readFileSync(file);
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "content-length": data.length });
  res.end(data);
  return data.length;
}

async function route(req, res, port) {
  const url = (req.url ?? "/").split("?")[0];
  if (!cors(req, res)) return json(res, 403, { reason: "only a local page (file://, localhost, 127.0.0.1) may use this helper" });
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return 0; }
  if (req.method === "GET" && url === "/health") return health(res, port);
  if (req.method === "POST" && url === "/convert/eps") return convert(req, res);
  if (req.method === "GET") return serveDist(url, res);
  return json(res, 404, { reason: "not found" });
}

function logLine(req, res, started, bytes) {
  const ms = Date.now() - started;
  console.log(`${new Date().toISOString()} ${req.method} ${(req.url ?? "/").split("?")[0]} → ${res.statusCode} · ${ms} ms · ${bytes} B`);
}

const server = createServer((req, res) => {
  const started = Date.now();
  route(req, res, server.address()?.port ?? config.port)
    .then((bytes) => logLine(req, res, started, bytes ?? 0))
    .catch((error) => {
      if (!res.headersSent) json(res, 500, { reason: `helper error: ${error.message}` });
      logLine(req, res, started, 0);
    });
});

server.listen(config.port, "127.0.0.1", () => {
  const port = server.address().port;
  const inkscape = findInkscape(config.inkscape);
  console.log(`Inkscape helper listening on http://127.0.0.1:${port}  (loopback only)`);
  console.log(inkscape.found ? `Inkscape ${inkscape.version} at ${inkscape.path}` : `Inkscape NOT found — ${inkscape.fix}`);
  console.log(`serving ${existsSync(path.join(config.dist, "index.html")) ? "the built app" : "NO built app yet"} from ${config.dist}`);
});
server.on("error", (error) => {
  console.error(error.code === "EADDRINUSE" ? `port ${config.port} is already in use — is the helper already running? (or pass --port)` : error.message);
  process.exit(1);
});
