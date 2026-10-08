// tools/bridge/inkscape.mjs — finding Inkscape and running ONE conversion
// (2026-10-09, design D2). Discovery order: `--inkscape <path>` flag →
// INKSCAPE_PATH → PATH → the platform's default install folders. The version
// is read with `inkscape --version` on EVERY call (so installing Inkscape
// while the helper runs is seen live, RULE 24). A conversion writes the SVG
// to its own temp folder, runs Inkscape with a timeout, reads the EPS back
// and deletes the folder in `finally` — a kill or a crash never leaves a
// half file for the browser (RULE 23 holds there: the browser commits).

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const INSTALL_FIX = "install Inkscape 1.x (inkscape.org) or set INKSCAPE_PATH";
const VERSION_RE = /Inkscape\s+(\d+[\w.+-]*)/;

const WINDOWS_DEFAULTS = [
  "C:\\Program Files\\Inkscape\\bin\\inkscape.com",
  "C:\\Program Files\\Inkscape\\bin\\inkscape.exe",
  "C:\\Program Files (x86)\\Inkscape\\bin\\inkscape.com",
];
const MAC_DEFAULTS = ["/Applications/Inkscape.app/Contents/MacOS/inkscape"];
const UNIX_DEFAULTS = ["/usr/bin/inkscape", "/usr/local/bin/inkscape", "/snap/bin/inkscape"];

/** The candidates in discovery order; `explicit` is the --inkscape flag. */
export function candidates(explicit, env = process.env) {
  const list = [explicit, env.INKSCAPE_PATH].filter((p) => typeof p === "string" && p !== "");
  list.push("inkscape"); // on PATH
  if (process.platform === "win32") list.push(...WINDOWS_DEFAULTS);
  else if (process.platform === "darwin") list.push(...MAC_DEFAULTS, ...UNIX_DEFAULTS);
  else list.push(...UNIX_DEFAULTS);
  return list;
}

/** `{ found, path, version }` — or `{ found: false, fix }` when nothing answers `--version`. */
export function findInkscape(explicit, env = process.env) {
  for (const candidate of candidates(explicit, env)) {
    if (candidate !== "inkscape" && !existsSync(candidate)) continue;
    const version = versionOf(candidate, env);
    if (version !== null) return { found: true, path: candidate, version };
  }
  return { found: false, path: null, version: null, fix: INSTALL_FIX };
}

/** The command + leading args that run a candidate: a `.mjs`/`.js` "binary" runs under node (the test fake). */
function commandFor(bin) {
  return /\.m?js$/.test(bin) ? [process.execPath, [bin]] : [bin, []];
}

function versionOf(bin, env) {
  const [cmd, lead] = commandFor(bin);
  const run = spawnSync(cmd, [...lead, "--version"], { encoding: "utf8", timeout: 15000, env, windowsHide: true });
  if (run.error || run.status !== 0) return null;
  const m = VERSION_RE.exec(`${run.stdout}\n${run.stderr}`);
  return m === null ? null : m[1];
}

const EXPORT_ARGS = ["--export-type=eps", "--export-area-page", "--export-text-to-path", "--export-ps-level=3"];

/**
 * One SVG → EPS. Resolves `{ ok: true, eps }` or `{ ok: false, status, reason }`
 * (502 Inkscape failed · 504 timed out · 499 the caller went away).
 * `opts.timeoutMs` kills Inkscape; `opts.onKill(fn)` lets the server kill it
 * when the browser's request closes (RULE 7).
 */
export async function convertEps(bin, svgText, opts) {
  const dir = mkdtempSync(path.join(opts.tmpRoot ?? tmpdir(), "iconsplitter-"));
  try {
    const input = path.join(dir, "in.svg");
    const output = path.join(dir, "out.eps");
    writeFileSync(input, svgText, "utf8");
    const run = await runInkscape(bin, [input, ...EXPORT_ARGS, `--export-filename=${output}`], opts);
    if (!run.ok) return run;
    if (!existsSync(output)) return { ok: false, status: 502, reason: "Inkscape finished but wrote no EPS" };
    return { ok: true, eps: readFileSync(output, "utf8") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runInkscape(bin, args, opts) {
  const [cmd, lead] = commandFor(bin);
  return new Promise((resolve) => {
    const child = spawn(cmd, [...lead, ...args], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stderr = "";
    let verdict = null;
    const finish = (v) => { if (verdict === null) verdict = v; };
    const timer = setTimeout(() => { finish(timedOut(opts.timeoutMs)); child.kill(); }, opts.timeoutMs);
    opts.onKill?.(() => { finish({ ok: false, status: 499, reason: "the request was cancelled" }); child.kill(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => { clearTimeout(timer); resolve({ ok: false, status: 502, reason: `Inkscape could not start: ${error.message}` }); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (verdict === null) finish(code === 0 ? { ok: true } : { ok: false, status: 502, reason: exitReason(code, stderr) });
      resolve(verdict);
    });
  });
}

function timedOut(ms) {
  return { ok: false, status: 504, reason: `Inkscape did not finish within ${ms / 1000} s — the file was killed, nothing was written` };
}

/** The exit code and the LAST non-empty stderr line (Inkscape's own words, nothing of ours). */
function exitReason(code, stderr) {
  const last = stderr.split("\n").map((l) => l.trim()).filter((l) => l !== "").at(-1);
  return `Inkscape exited with code ${code}${last ? `: ${last}` : ""}`;
}
