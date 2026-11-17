// tools/bridge/openfolder.mjs — "show this folder in Explorer" for the app
// (2026-11-16). A browser cannot open Explorer, so the helper does it on the
// user's own machine. Only an EXISTING FOLDER given as a full path is opened —
// never a file, never a relative path — and the file manager is started with
// the path as its ONLY argument (execFile-style, no shell), so nothing in the
// path can run as a command.

import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";

/** `{ ok: true, path }` for an existing folder given as a full path; else `{ ok: false, reason }`. */
export function checkFolder(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return { ok: false, reason: "no folder path was given" };
  if (!path.isAbsolute(raw)) return { ok: false, reason: "the folder path must be a full path" };
  const full = path.resolve(raw);
  try {
    if (!statSync(full).isDirectory()) return { ok: false, reason: "that path is not a folder" };
  } catch {
    return { ok: false, reason: "that folder does not exist (yet)" };
  }
  return { ok: true, path: full };
}

/** The platform's file manager. */
function managerOf(platform) {
  if (platform === "win32") return "explorer.exe";
  if (platform === "darwin") return "open";
  return "xdg-open";
}

function launchDetached(cmd, args) {
  // Explorer parses `/select,"<file>"` itself: Node's own quoting of an argument holding spaces
  // makes Explorer OPEN the file instead of selecting it (2026-11-16) — so it gets the text verbatim.
  const child = spawn(cmd, args, { detached: true, stdio: "ignore", shell: false, windowsHide: false, windowsVerbatimArguments: cmd === "explorer.exe" });
  child.on("error", () => undefined); // a missing file manager is reported by the caller's check, never fatal
  child.unref();
}

/** Opens the folder; `deps` (tests) inject the launcher and the platform. */
export function openFolder(raw, deps = {}) {
  const checked = checkFolder(raw);
  if (!checked.ok) return checked;
  const file = checkSelect(checked.path, deps.select);
  if (!file.ok) return file;
  const platform = deps.platform ?? process.platform;
  const launch = deps.launch ?? launchDetached;
  try {
    launch(managerOf(platform), argsOf(platform, checked.path, file.path));
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `the file manager did not start: ${err instanceof Error ? err.message : "unknown error"}` };
  }
}

/** A file to select (2026-11-16): it must exist and sit directly inside the folder. */
function checkSelect(folder, raw) {
  if (raw === undefined || raw === null || raw === "") return { ok: true, path: null };
  if (typeof raw !== "string" || !path.isAbsolute(raw)) return { ok: false, reason: "the file path must be a full path" };
  const full = path.resolve(raw);
  if (path.dirname(full) !== folder) return { ok: false, reason: "the file is not in that folder" };
  try {
    if (!statSync(full).isFile()) return { ok: false, reason: "that path is not a file" };
  } catch {
    return { ok: false, reason: "that file does not exist (yet)" };
  }
  return { ok: true, path: full };
}

/** The file manager's arguments: the folder, or the file selected in it (each ONE argument, no shell). */
function argsOf(platform, folder, file) {
  if (file === null) return platform === "win32" ? [`"${folder}"`] : [folder]; // verbatim on Windows: quoted here
  if (platform === "win32") return [`/select,"${file}"`]; // a Windows path holds no quote
  if (platform === "darwin") return ["-R", file];
  return [folder]; // xdg-open has no "select": the folder
}

/** POST /open-folder `{ "path": "<folder>", "select"?: "<file in it>" }` → `{ ok: true }` or 400 with a reason. */
export async function handleOpenFolder(req, res, readBody, json) {
  let body;
  try { body = JSON.parse(await readBody(req, 8192)); } catch { return json(res, 400, { ok: false, reason: "the request is not JSON" }); }
  const out = openFolder(body?.path, { select: body?.select });
  return json(res, out.ok ? 200 : 400, out);
}
