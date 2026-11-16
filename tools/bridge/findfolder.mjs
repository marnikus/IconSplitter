// tools/bridge/findfolder.mjs — the full path of a folder the user picked in the
// browser (2026-11-16). A browser never reveals where a picked folder is; the
// helper, on the user's own machine, finds it: a folder with that NAME holding
// ALL the given entry names (markers). Searched first around paths the app
// already knows (hints), then the drives and the home folder, breadth first,
// within a time budget. Read-only: only folder listings, never file contents.

import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const SKIP = new Set(["windows", "program files", "program files (x86)", "programdata", "appdata", "node_modules", "system volume information", "$recycle.bin", "recovery"]);
const MAX_DEPTH = 8;

const same = (a, b, win) => (win ? a.toLowerCase() === b.toLowerCase() : a === b);

function listDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith(".") && !d.name.startsWith("$") && !SKIP.has(d.name.toLowerCase())).map((d) => path.join(dir, d.name));
  } catch { return []; }
}

function holdsAll(dir, markers) {
  try {
    const names = new Set(readdirSync(dir));
    return markers.every((m) => names.has(m));
  } catch { return false; }
}

/** Where to look first: the hints, their parents (3 up), then the drives and home. */
function startsOf(hints, platform) {
  const out = [];
  for (const h of hints) {
    let p = path.resolve(h);
    for (let i = 0; i < 4; i++) { out.push(p); const up = path.dirname(p); if (up === p) break; p = up; }
  }
  if (platform === "win32") for (const l of "CDEFGHIJKLMNOPQRSTUVWXYZ") { const d = `${l}:\\`; if (existsSync(d)) out.push(d); }
  else out.push("/");
  out.push(os.homedir());
  return [...new Set(out)];
}

/** `{ ok: true, path }` for the folder named `name` holding every marker; else `{ ok: false, reason }`. */
export function findFolder(body, deps = {}) {
  const name = typeof body?.name === "string" ? body.name : "";
  const markers = Array.isArray(body?.markers) ? body.markers.filter((m) => typeof m === "string" && m !== "").slice(0, 16) : [];
  const hints = Array.isArray(body?.hints) ? body.hints.filter((h) => typeof h === "string" && path.isAbsolute(h)).slice(0, 20) : [];
  if (name === "" || markers.length === 0) return { ok: false, reason: "a folder name and some of its entries are needed" };
  const platform = deps.platform ?? process.platform, win = platform === "win32";
  const budget = Date.now() + (deps.budgetMs ?? 8000);
  const seen = new Set();
  let level = (deps.starts ?? startsOf(hints, platform)).map((p) => [p, 0]);
  while (level.length > 0 && Date.now() < budget) {
    const next = [];
    for (const [dir, depth] of level) {
      if (seen.has(dir)) continue;
      seen.add(dir);
      if (same(path.basename(dir), name, win) && holdsAll(dir, markers)) return { ok: true, path: dir };
      if (depth < MAX_DEPTH) for (const sub of listDirs(dir)) next.push([sub, depth + 1]);
      if (Date.now() >= budget) break;
    }
    level = next;
  }
  return { ok: false, reason: "the folder was not found on this computer" };
}

export async function handleFindFolder(req, res, readBody, json) {
  let body;
  try { body = JSON.parse(await readBody(req, 16384)); } catch { return json(res, 400, { ok: false, reason: "the request is not JSON" }); }
  return json(res, 200, findFolder(body));
}
