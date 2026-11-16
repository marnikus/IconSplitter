// distfresh.mjs — detects when `dist/index.html` is missing, older than `src/`,
// or stamped with a different `src/` SHA-256 (e.g. after `git pull` / `git rebase`)
// and triggers an automatic single-flight build (`npm run build` by default).
//
// 2026-11-02: a pull that changes only the APP now rebuilds the bundle while the
// helper keeps running (see server.mjs `watchAppSources`). That is what makes the
// open page reach the new build without closing the window — the helper's own
// restart is for helper code only.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** The app's own inputs, repository-relative: what `npm run build` reads. */
export const APP_WATCH = Object.freeze(["src", "index.html"]);

/** `APP_WATCH` resolved under a checkout — the one list every staleness check uses. */
export function appWatchPaths(repoRoot) {
  return APP_WATCH.map((rel) => path.join(path.resolve(repoRoot), rel)).filter((p) => existsSync(p));
}

function collectWatchedFiles(targetPath, out) {
  if (!existsSync(targetPath)) return;
  const st = statSync(targetPath);
  if (!st.isDirectory()) {
    out.push(targetPath);
    return;
  }
  const entries = readdirSync(targetPath, { withFileTypes: true })
    .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "dist")
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    collectWatchedFiles(path.join(targetPath, entry.name), out);
  }
}

export function computeSrcFingerprint(watchPaths) {
  const hash = createHash("sha256");
  for (const root of watchPaths) {
    const resolvedRoot = path.resolve(root);
    const files = [];
    collectWatchedFiles(resolvedRoot, files);
    for (const file of files) {
      const rel = path.relative(resolvedRoot, file).replace(/\\/g, "/");
      hash.update(`${rel}\0`, "utf8");
      hash.update(readFileSync(file));
      hash.update("\0", "utf8");
    }
  }
  return hash.digest("hex");
}

function newestMtimeMs(watchPaths) {
  let newest = 0;
  for (const root of watchPaths) {
    const files = [];
    collectWatchedFiles(root, files);
    for (const file of files) {
      const mtime = statSync(file).mtimeMs;
      if (mtime > newest) newest = mtime;
    }
  }
  return newest;
}

export function isDistStale(distHtmlPath, watchPaths) {
  if (!existsSync(distHtmlPath)) return true;
  const distStat = statSync(distHtmlPath);
  if (!distStat.isFile() || distStat.size === 0) return true;
  if (newestMtimeMs(watchPaths) > distStat.mtimeMs) return true;
  const expected = computeSrcFingerprint(watchPaths);
  const html = readFileSync(distHtmlPath, "utf8");
  return !html.includes(`name="iconsplitter-src-hash" content="${expected}"`);
}

const STAMP_RE = /name="iconsplitter-src-hash"\s+content="([^"]+)"/;
let cachedServed = { key: null, value: null };

/**
 * The stamp written into the page the helper serves, plus the moment that file
 * was written — what the open tab compares itself against to know the bundle
 * under it changed. `null` for a dist the helper cannot read.
 * Cached by mtime+size so a page polling `/health` costs one `stat`.
 */
export function servedBundle(distHtmlPath) {
  let stat;
  try {
    stat = statSync(distHtmlPath);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size === 0) return null;
  const key = `${distHtmlPath}\0${stat.mtimeMs}\0${stat.size}`;
  if (cachedServed.key === key) return cachedServed.value;
  let stamp = null;
  try {
    const m = STAMP_RE.exec(readFileSync(distHtmlPath, "utf8"));
    if (m !== null) stamp = m[1];
  } catch {
    return null;
  }
  const value = { stamp, builtAt: new Date(stat.mtimeMs).toISOString() };
  cachedServed = { key, value };
  return value;
}

let inFlightBuild = null;

/**
 * One build at a time, anywhere in the helper. `build.cmd` is a command LINE (a
 * shell runs it), so a launcher can point it at something other than npm; a
 * failure resolves `{ ok: false, reason }` and never throws at the caller.
 */
export function rebuildDistAsync(repoRoot, build = {}) {
  if (inFlightBuild) return inFlightBuild;
  const cmd = build.cmd ?? "npm run build";
  const cwd = build.cwd ?? repoRoot;
  inFlightBuild = new Promise((resolve) => {
    const child = spawn(cmd, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (c) => { stderr += c.toString("utf8"); });
    child.on("error", (err) => resolve({ ok: false, reason: err.message }));
    child.on("close", (code) => {
      resolve(code === 0 ? { ok: true } : { ok: false, reason: stderr.trim() || `the build exited ${code}` });
    });
  }).finally(() => {
    inFlightBuild = null;
  });
  return inFlightBuild;
}
