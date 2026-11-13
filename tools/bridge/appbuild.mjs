// appbuild.mjs — the app bundle is rebuilt beside `dist/`, never in it (2026-11-13).
// `npm run build` used to write straight into dist/: a build that failed half
// way, or two builds at once (the supervisor's and the helper's), could leave a
// page with a broken or mismatched bundle. Now the build writes into a staging
// folder next to dist (vite.config reads ICONSPLITTER_OUT_DIR), and the result
// is swapped in only when it is complete and stamped for exactly the sources it
// was built from. A failure leaves the previous bundle served, untouched.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { computeSrcFingerprint } from "./distfresh.mjs";

const BUILD_TIMEOUT_MS = 5 * 60_000;
const STAMP_RE = /name="iconsplitter-src-hash"\s+content="([^"]+)"/;
let inFlight = null;

function runBuild(cmd, cwd, outDir, inherit) {
  return new Promise((resolve) => {
    const child = spawn(cmd, {
      cwd, shell: true, windowsHide: true,
      stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
      env: { ...process.env, ICONSPLITTER_OUT_DIR: outDir },
    });
    let stderr = "";
    child.stderr?.on("data", (c) => { stderr = (stderr + c.toString("utf8")).slice(-8_000); });
    const timer = setTimeout(() => child.kill(), BUILD_TIMEOUT_MS);
    child.on("error", (err) => { clearTimeout(timer); resolve({ ok: false, reason: err.message }); });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? { ok: true } : { ok: false, reason: lastLines(stderr) || `the build exited ${code}` });
    });
  });
}

/** The build's own error, without a screen of stack frames. */
function lastLines(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("at "));
  return lines.slice(-4).join(" | ");
}

/** Windows can hold a file for a moment (an open read, a sync client): try again briefly. */
function renameWithRetry(from, to) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      if (existsSync(to) && statSync(to).isDirectory()) rmSync(to, { recursive: true, force: true });
      renameSync(from, to);
      return;
    } catch (err) {
      if (attempt >= 20) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
}

/** Is the staged bundle complete and built from these sources? */
function stagedVerdict(staging, expected) {
  const index = path.join(staging, "index.html");
  if (!existsSync(index) || statSync(index).size === 0) return { ok: false, reason: "the build wrote no index.html" };
  const stamp = STAMP_RE.exec(readFileSync(index, "utf8"))?.[1] ?? null;
  if (stamp !== expected) {
    return { ok: false, retry: true, reason: "the sources changed while the bundle was being built — it is built again" };
  }
  return { ok: true };
}

async function buildOnce({ cmd, cwd, dist, appDirs, inherit = false }) {
  const expected = computeSrcFingerprint(appDirs);
  mkdirSync(path.resolve(dist), { recursive: true });
  const staging = mkdtempSync(path.join(path.dirname(path.resolve(dist)), ".dist-staging-"));
  try {
    const run = await runBuild(cmd, cwd, staging, inherit);
    if (!run.ok) return run;
    const verdict = stagedVerdict(staging, expected);
    if (!verdict.ok) return verdict;
    // The fingerprint is checked again: an edit during the build means a stale bundle.
    if (computeSrcFingerprint(appDirs) !== expected) return stagedVerdict(staging, "moved");
    for (const name of readdirSync(staging)) renameWithRetry(path.join(staging, name), path.join(dist, name));
    return { ok: true, stamp: expected };
  } catch (err) {
    return { ok: false, retry: true, reason: `the new bundle could not be put in place (${err.message})` };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * One staged build at a time in this process; a second caller shares the first.
 * Resolves `{ ok, stamp? , reason?, retry? }` and never throws.
 */
export function buildAppStaged(options) {
  if (inFlight !== null) return inFlight;
  inFlight = buildOnce(options).finally(() => { inFlight = null; });
  return inFlight;
}

/** True while a staged build runs here: the helper does not exit under it. */
export function appBuildRunning() {
  return inFlight !== null;
}
