#!/usr/bin/env node
// inkscape-host.mjs — loopback SVG→EPS helper. Binds 127.0.0.1 only (I-61).
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PORT = 7788;
export const HOST = "127.0.0.1";
const SHARED = ["--export-area-page", "--export-text-to-path"];

export function parseInkscapeVersion(text) {
  const m = /Inkscape\s+(\d+)\.(\d+)/i.exec(text);
  return m === null ? null : { major: Number(m[1]), minor: Number(m[2]) };
}

export function inkscapeArgv(version, paths) {
  if (version.major >= 1) {
    return [`--export-filename=${paths.output}`, "--export-type=eps", ...SHARED, "--export-ps-level=3", paths.input];
  }
  return ["--without-gui", `--export-eps=${paths.output}`, ...SHARED, paths.input];
}

export function healthPayload(info) {
  if (info === null) return { ok: false, reason: "inkscape: not found" };
  return { ok: true, inkscape: { version: info.version, path: info.path } };
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, x-iconsplitter-cli",
    "content-length": Buffer.byteLength(json),
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export async function handleRequest(req, res, inkscape) {
  if (req.method === "OPTIONS") { send(res, 204, {}); return; }
  if (req.url === "/health" && req.method === "GET") { send(res, 200, healthPayload(inkscape)); return; }
  if (req.url === "/eps" && req.method === "POST") { await handleEps(req, res, inkscape); return; }
  send(res, 404, { ok: false, reason: "not found" });
}

async function handleEps(req, res, inkscape) {
  if (inkscape === null) { send(res, 503, { ok: false, reason: "inkscape: not found" }); return; }
  let payload;
  try { payload = JSON.parse(await readBody(req)); }
  catch { send(res, 400, { ok: false, reason: "invalid json" }); return; }
  if (typeof payload.svg !== "string" || payload.svg.length === 0) {
    send(res, 400, { ok: false, reason: "missing svg" }); return;
  }
  try {
    send(res, 200, { ok: true, eps: await convertSvg(payload.svg, inkscape), version: inkscape.version });
  } catch (err) {
    send(res, 500, { ok: false, reason: err instanceof Error ? err.message : "convert failed" });
  }
}

async function convertSvg(svg, inkscape) {
  const dir = await mkdtemp(path.join(tmpdir(), "iconsplitter-eps-"));
  const input = path.join(dir, "in.svg");
  const output = path.join(dir, "out.eps");
  try {
    await writeFile(input, svg, "utf8");
    const version = parseInkscapeVersion(inkscape.version) ?? { major: 1, minor: 0 };
    await run(inkscape.path, inkscapeArgv(version, { input, output }));
    return await readFile(output, "utf8");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function run(bin, argv) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, argv, { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => { child.kill(); reject(new Error("inkscape timed out")); }, 30_000);
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`inkscape exited ${code}`));
    });
  });
}

export function probeInkscape() {
  return new Promise((resolve) => {
    const child = spawn("inkscape", ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (c) => { out += c; });
    child.stderr.on("data", (c) => { out += c; });
    child.on("error", () => resolve(null));
    child.on("close", () => {
      const version = parseInkscapeVersion(out);
      resolve(version === null ? null : { version: out.trim().split("\n")[0], path: "inkscape" });
    });
  });
}

export function createHostServer(inkscape) {
  return http.createServer((req, res) => { void handleRequest(req, res, inkscape); });
}

async function main() {
  const inkscape = await probeInkscape();
  createHostServer(inkscape).listen(PORT, HOST, () => {
    const state = inkscape === null ? "inkscape: not found" : inkscape.version;
    console.log(`IconSplitter Inkscape helper on http://${HOST}:${PORT} (${state})`);
  });
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === here) void main();
