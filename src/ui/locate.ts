// locate.ts — every tab's "Location" (2026-11-16). The full path is always copied
// (a file's own path when the item is a file, else the folder's), and the local
// helper opens Windows Explorer at it — the file selected in its folder
// (POST /open-folder, tools/bridge/openfolder.mjs). A browser cannot open
// Explorer by itself, so without the helper — or before the folder's full path
// was captured (Ctrl+Shift+C in Explorer when picking it) — the path is still
// copied and the message says exactly why (RULE 9). Path texts come from
// lib/copypath + lib/rootpath, so every tab names the same place.
import { probePath, type DirHandleLike } from "../lib/fs";
import { splitOutputBase } from "../lib/copypath";
import { boundRootPathInfo } from "../lib/knownroots";
import { folderCopyText, normalizeRootPath } from "../lib/rootpath";
import { loadBridgeConfig } from "../upload/configstore";

type Say = (msg: string, err?: boolean) => void;

/** A full Windows / UNC / POSIX path — only those can be opened. */
const isFullPath = (p: string) => /^[A-Za-z]:|^\\\\|^\//.test(p);
/** The last segment names a file (it has an extension). */
const looksLikeFile = (rel: string) => /\.[A-Za-z0-9]{1,6}$/.test(rel.split("/").pop() ?? "");

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** Asks the helper to open `folder` (selecting `file`); null = opened, else the reason. */
export async function openInExplorer(folder: string, file?: string): Promise<string | null> {
  try {
    const res = await fetch(`${loadBridgeConfig().url}/open-folder`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(file === undefined ? { path: folder } : { path: folder, select: file }),
    });
    const out = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
    return out.ok === true ? null : out.reason ?? `the helper answered HTTP ${res.status}`;
  } catch {
    return "the helper is not running (start run_app.bat)";
  }
}

/** Copies `text`, then opens the place when its full path is known; one honest message. */
export async function revealPath(p: { folder: string; file?: string; say: Say }): Promise<void> {
  const text = p.file ?? p.folder;
  const copied = await copy(text);
  const copyNote = copied ? "path copied" : "the path could not be copied";
  if (!isFullPath(p.folder)) {
    p.say(`${copied ? "Path copied" : "Could not copy the path"} — the folder's full path is unknown (Ctrl+Shift+C in Explorer, then Rescan): ${text}`, !copied);
    return;
  }
  const failed = await openInExplorer(p.folder, p.file);
  p.say(failed === null ? `Opened in Explorer · ${copyNote}: ${text}` : `${copied ? "Path copied" : "Path"}: ${text} — Explorer: ${failed}`, failed !== null && !copied);
}

/** This folder's captured path, else its name. */
function baseOf(handle: DirHandleLike | null): string {
  return handle === null ? "" : boundRootPathInfo(handle).path || handle.name;
}

/** True when the file at `relPath` exists under `handle` (only an existing file is copied / selected). */
async function fileExists(handle: DirHandleLike | null, relPath: string): Promise<boolean> {
  if (handle === null || !looksLikeFile(relPath)) return false;
  const cut = relPath.lastIndexOf("/");
  const dir = await probePath(handle, cut < 0 ? "" : relPath.slice(0, cut));
  if (dir === null) return false;
  try { await dir.getFileHandle(relPath.slice(cut + 1), { create: false }); return true; } catch { return false; }
}

/** An item under a scanned folder: an EXISTING file's own path copied and selected in its folder; else its folder. */
export async function locateFolder(handle: DirHandleLike | null, relPath: string, say: Say): Promise<void> {
  const base = baseOf(handle);
  const folder = folderCopyText(base, relPath);
  const file = base !== "" && await fileExists(handle, relPath) ? normalizeRootPath(`${base}/${relPath}`) : undefined;
  await revealPath({ folder, file, say });
}

/** A processed row's split folder (relative to the split output). */
export async function locateSplitFolder(dest: DirHandleLike | null, root: DirHandleLike | null, outRel: string, say: Say): Promise<void> {
  await revealPath({ folder: normalizeRootPath(`${splitOutputBase(dest, root)}/${outRel}`), say });
}
