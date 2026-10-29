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
//   Getty web: [--getty-headed] [--getty-cdp <loopback devtools url>]
//              [--getty-profile <dir>]  (reuse a profile so Getty remembers it)
//              [--getty-check]  (launch, verify the DevTools socket, exit)
//              [--getty-reset]  (end a stuck Getty browser, clear its profile)
//   env: INKSCAPE_PATH, BRIDGE_TIMEOUT_MS (60000), BRIDGE_MAX_BYTES (20 MB)

import { createServer, request as httpRequest } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDistStale, rebuildDistAsync } from "./distfresh.mjs";
import { handleEspOAuthCallback, handleEspOAuthStart, handleEspOAuthStatus } from "./esp/oauth.mjs";
import { connectBrowser, findBrowser, resetProfile, resolveProfileDir } from "./gettyweb/browser.mjs";
import { openCdp } from "./gettyweb/cdp.mjs";
import {
  gettyWebHealth, handleGettyWebClose, handleGettyWebFinish, handleGettyWebTest, handleGettyWebUpload,
} from "./gettyweb/routes.mjs";
import { cdpFailureReason } from "./gettyweb/session.mjs";
import { convertEps, findInkscape } from "./inkscape.mjs";
import { handleFtpsClose, handleFtpsTest, handleFtpsUpload } from "./ftps/routes.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const DEFAULT_PORT = 47391;
const ALLOWED_ORIGIN = /^(null|https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

/** --flag value pairs from argv; a flag with no value becomes `true`. */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) { out[argv[i].slice(2)] = true; continue; }
    out[argv[i].slice(2)] = value;
    i += 1;
  }
  return out;
}

/** Getty web flags so a first run can be watched without setting env vars. */
function applyGettyFlags(parsed) {
  if (["1", "true", true].includes(parsed["getty-headed"])) process.env.GETTY_WEB_HEADED = "1";
  if (typeof parsed["getty-cdp"] === "string" && parsed["getty-cdp"] !== "") {
    process.env.GETTY_WEB_CDP = parsed["getty-cdp"];
  }
  if (typeof parsed["getty-profile"] === "string" && parsed["getty-profile"] !== "") {
    process.env.GETTY_WEB_PROFILE = parsed["getty-profile"];
  }
}

const args = parseArgs(process.argv.slice(2));
applyGettyFlags(args);
const config = {
  port: Number(args.port ?? process.env.BRIDGE_PORT ?? DEFAULT_PORT),
  inkscape: args.inkscape,
  dist: path.resolve(args.dist ?? path.join(REPO_ROOT, "dist")),
  autoBuildDist: args.dist === undefined && !process.env.VITEST && args["no-auto-build"] === undefined,
  timeoutMs: Number(process.env.BRIDGE_TIMEOUT_MS ?? 60000),
  maxBytes: Number(process.env.BRIDGE_MAX_BYTES ?? 20 * 1024 * 1024),
  ftpMaxBytes: Number(process.env.BRIDGE_FTP_MAX_BYTES ?? 120 * 1024 * 1024),
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
  res.setHeader("access-control-allow-headers", "content-type, x-ftps-config, x-getty-web-config");
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

function readBinaryBody(req, limit) {
  if (Number(req.headers["content-length"] ?? 0) > limit) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) { req.pause(); resolve(null); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function health(res, port) {
  const inkscape = findInkscape(config.inkscape);
  return json(res, 200, {
    ok: inkscape.found, inkscape, ftps: { ready: true }, sftp: { ready: true }, esp: { ready: true },
    gettyWeb: gettyWebHealth(), port,
  });
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
async function serveDist(url, res) {
  const rel = url === "/" ? "index.html" : decodeURIComponent(url.slice(1));
  const file = path.resolve(config.dist, rel);
  if (rel === "index.html" && config.autoBuildDist) {
    const watch = [path.join(REPO_ROOT, "src"), path.join(REPO_ROOT, "index.html")];
    if (isDistStale(file, watch)) {
      console.log("Source files are newer than dist/index.html — rebuilding latest UI (`npm run build`)...");
      const built = await rebuildDistAsync(REPO_ROOT);
      if (!built.ok) console.error(`Auto-build failed: ${built.reason}`);
    }
  }
  if (!file.startsWith(config.dist + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
    const hint = rel === "index.html" ? `no built app at ${config.dist} — run "npm run build" (or run_app_inkscape.bat) first` : "not found";
    return json(res, 404, { reason: hint });
  }
  const data = readFileSync(file);
  res.writeHead(200, {
    "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
    "content-length": data.length,
    "cache-control": "no-store",
  });
  res.end(data);
  return data.length;
}

async function route(req, res, port) {
  const url = (req.url ?? "/").split("?")[0];
  if (req.method === "GET" && url === "/esp/oauth/callback") return handleEspOAuthCallback(req, res, port);
  if (!cors(req, res)) return json(res, 403, { reason: "only a local page (file://, localhost, 127.0.0.1) may use this helper" });
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return 0; }
  if (req.method === "POST" && url === "/shutdown" && req.headers["x-bridge-control"] === "restart") {
    const out = json(res, 200, { ok: true });
    setTimeout(() => process.exit(0), 50);
    return out;
  }
  if (req.method === "GET" && url === "/health") return health(res, port);
  if (req.method === "POST" && url === "/convert/eps") return convert(req, res);
  if (req.method === "POST" && url === "/esp/oauth/start") return handleEspOAuthStart(req, res, port, json);
  if (req.method === "GET" && url === "/esp/oauth/status") return handleEspOAuthStatus(req, res, port, json);
  if (req.method === "POST" && url === "/ftps/test") return handleFtpsTest(req, res, json);
  if (req.method === "POST" && url === "/ftps/upload") return handleFtpsUpload(req, res, config.ftpMaxBytes, json);
  if (req.method === "POST" && url === "/ftps/close") return handleFtpsClose(req, res, json);
  if (req.method === "POST" && url === "/getty-web/upload") {
    return handleGettyWebUpload(req, res, readBinaryBody, json, config.ftpMaxBytes);
  }
  if (req.method === "POST" && url === "/getty-web/test") return handleGettyWebTest(req, res, readBody, json);
  if (req.method === "POST" && url === "/getty-web/finish") return handleGettyWebFinish(req, res, readBody, json);
  if (req.method === "POST" && url === "/getty-web/close") return handleGettyWebClose(req, res, readBody, json);
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

let retriedReplace = false;
function requestPreviousHelperExit(port, cb) {
  const req = httpRequest(
    { host: "127.0.0.1", port, path: "/shutdown", method: "POST", headers: { "x-bridge-control": "restart" }, timeout: 800 },
    (res) => { res.resume(); setTimeout(() => cb(res.statusCode === 200), 250); },
  );
  req.on("error", () => cb(false));
  req.end();
}

function startListening() {
  server.listen(config.port, "127.0.0.1", () => {
    const port = server.address().port;
    const inkscape = findInkscape(config.inkscape);
    console.log("FTPS upload helper: READY (/ftps/test, /ftps/upload, /ftps/close — FTPS :21 + SFTP :22, Inkscape not required)");
    console.log(inkscape.found ? `Inkscape ${inkscape.version} at ${inkscape.path}` : `Inkscape NOT found (optional, only for Inkscape EPS conversion) — ${inkscape.fix}`);
    console.log(`serving ${existsSync(path.join(config.dist, "index.html")) ? "the built app" : "NO built app yet"} from ${config.dist}`);
    if (process.env.GETTY_WEB_HEADED === "1") console.log("Getty web browser: VISIBLE window (--getty-headed)");
    console.log(`Local helper listening on http://127.0.0.1:${port}  (loopback only)`);
  });
}

/**
 * `--getty-reset`: end the browser that still holds the Getty profile folder
 * (only that one) and clear its stale locks, without touching any other window.
 */
async function runGettyReset() {
  const profileDir = resolveProfileDir(process.env.GETTY_WEB_PROFILE);
  if (profileDir === null) {
    console.log("reset: no profile folder to reset — pass --getty-profile <folder> (env GETTY_WEB_PROFILE) or use --getty-check");
    return 1;
  }
  const result = await resetProfile(profileDir);
  if (result.reset !== true) {
    console.log(`reset: FAILED — ${result.reason ?? "the browser could not be ended"}`);
    return 1;
  }
  const ended = result.killed.length === 0
    ? "no browser was using the folder; its stale locks were cleared"
    : `ended ${result.killed.length} browser process(es) using the folder`;
  console.log(`reset: OK — ${ended}`);
  return 0;
}

/**
 * `--getty-check`: prove the Getty web browser can be launched and driven on
 * this machine, print exactly which step fails, and exit — no app needed.
 */
async function runGettyCheck() {
  const found = findBrowser();
  console.log(found.found ? `browser: ${found.path}` : `browser: NOT FOUND — ${found.fix}`);
  if (!found.found) return 1;
  const started = await connectBrowser({
    headed: process.env.GETTY_WEB_HEADED === "1",
    profileDir: process.env.GETTY_WEB_PROFILE,
    cdpUrl: process.env.GETTY_WEB_CDP,
  });
  if (!started.ok) {
    console.log(`launch: FAILED — ${started.reason}`);
    return 1;
  }
  console.log(`devtools: port ${started.port}`);
  const connection = openCdp(started.socket);
  const visible = process.env.GETTY_WEB_HEADED === "1";
  try {
    await connection.ready;
    console.log("socket: OK — the Getty web upload can drive this browser");
    return 0;
  } catch (error) {
    const profileDir = resolveProfileDir(process.env.GETTY_WEB_PROFILE) ?? undefined;
    console.log(`socket: FAILED — ${cdpFailureReason(error, { port: started.port, profileDir })}`);
    return 1;
  } finally {
    connection.close();
    if (visible) console.log("window: LEFT OPEN — close it when you are done looking");
    else started.stop();
  }
}

if (args["getty-reset"] === true) {
  runGettyReset()
    .then((code) => process.exit(code))
    .catch((error) => { console.log(`reset: FAILED — ${error?.message ?? "unknown error"}`); process.exit(1); });
}

if (args["getty-check"] === true) {
  runGettyCheck()
    .then((code) => process.exit(code))
    .catch((error) => { console.log(`check: FAILED — ${error?.message ?? "unknown error"}`); process.exit(1); });
}

server.on("error", (error) => {
  if (error.code === "EADDRINUSE" && config.port === DEFAULT_PORT && !retriedReplace) {
    retriedReplace = true;
    requestPreviousHelperExit(config.port, (replaced) => {
      if (replaced) { startListening(); return; }
      console.error(`port ${config.port} is already in use — close the older helper window first (or pass --port)`);
      process.exit(1);
    });
    return;
  }
  console.error(error.code === "EADDRINUSE" ? `port ${config.port} is already in use — is the helper already running? (or pass --port)` : error.message);
  process.exit(1);
});

if (args["getty-check"] !== true && args["getty-reset"] !== true) startListening();
