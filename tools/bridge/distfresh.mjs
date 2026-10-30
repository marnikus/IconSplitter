// distfresh.mjs — detects when `dist/index.html` is missing, older than `src/`,
// or stamped with a different `src/` SHA-256 (e.g. after `git pull` / `git rebase`)
// and triggers an automatic single-flight `npm run build`.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

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

let inFlightBuild = null;

export function rebuildDistAsync(repoRoot) {
  if (inFlightBuild) return inFlightBuild;
  inFlightBuild = new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const child = spawn(isWin ? "npm.cmd" : "npm", ["run", "build"], {
      cwd: repoRoot,
      shell: isWin,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (c) => { stderr += c.toString("utf8"); });
    child.on("error", (err) => resolve({ ok: false, reason: err.message }));
    child.on("close", (code) => {
      resolve(code === 0 ? { ok: true } : { ok: false, reason: stderr.trim() || `npm run build exited ${code}` });
    });
  }).finally(() => {
    inFlightBuild = null;
  });
  return inFlightBuild;
}
