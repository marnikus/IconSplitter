// distfresh.mjs — detects when `dist/index.html` is missing or older than `src/`
// (e.g. right after `git pull`) and triggers an automatic single-flight `npm run build`.

import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

function newestMtimeMs(targetPath) {
  if (!existsSync(targetPath)) return 0;
  const st = statSync(targetPath);
  if (!st.isDirectory()) return st.mtimeMs;
  let newest = st.mtimeMs;
  for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue;
    const childMax = newestMtimeMs(path.join(targetPath, entry.name));
    if (childMax > newest) newest = childMax;
  }
  return newest;
}

export function isDistStale(distHtmlPath, watchPaths) {
  if (!existsSync(distHtmlPath)) return true;
  const distStat = statSync(distHtmlPath);
  if (!distStat.isFile() || distStat.size === 0) return true;
  const distMtime = distStat.mtimeMs;
  for (const watchPath of watchPaths) {
    if (newestMtimeMs(watchPath) > distMtime) return true;
  }
  return false;
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
