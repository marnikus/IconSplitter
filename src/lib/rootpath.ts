// rootpath.ts — the full path of a picked root, and the copy text built from it
// (feature §2). Why a memory: the File System Access API tells a page only the
// picked folder's NAME ("test_processing") — the drive and the folders above it
// are invisible to the browser for privacy, so a pasteable Windows path has to
// come from the user once. It is remembered per folder name, reused by every
// tab, and never invented: with no memory the copy falls back to the name.
//
// The copy itself names a FOLDER, never a file (the user's request): inside a
// run's output tree it stops at the batch folder — the one a human opens in
// Explorer — and anywhere else it keeps the item's own folder.

import { readKey, writeKey } from "../state/safestorage";
import { isRecord } from "./isrecord";

/** `{ [folderName]: fullPath }`; one key so a root has one path everywhere. */
export const ROOT_PATH_KEY = "iconSplitter.rootpaths.v1";

/** The app's own output tree: `_split_output/<YYYY-MM>/<YYYY-MM-DD_HH-mm-ss>`. */
const MONTH = /^\d{4}-\d{2}$/;
const STAMP = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;
const OUTPUT_DIR = "_split_output";

/**
 * The path as Explorer would show it: no surrounding quotes (its "Copy as
 * path" adds them — a half-pasted one is forgiven too), forward slashes as
 * backslashes, no doubled separators (except an UNC share's leading pair) and
 * no trailing separator — so `F:\` and a drive-only root both join as `F:\x`.
 */
export function normalizeRootPath(text: string): string {
  const bare = text.trim().replace(/^["']+/, "").replace(/["']+$/, "").trim();
  const slashes = bare.replace(/\/+/g, "\\");
  const unc = slashes.startsWith("\\\\") ? "\\\\" : ""; // an UNC share's own pair
  const rest = slashes.replace(/^\\+/, "").replace(/\\{2,}/g, "\\");
  return (unc + rest).replace(/\\+$/, "");
}

/** The remembered full path of a root, or "" when none was pasted. */
export function loadRootPath(rootName: string): string {
  const all = readPaths();
  const value = all[rootName];
  return typeof value === "string" ? normalizeRootPath(value) : "";
}

/** Remembers (or, with an empty value, forgets) a root's full path. */
export function saveRootPath(rootName: string, text: string): void {
  if (rootName === "") return;
  const all = readPaths();
  const path = normalizeRootPath(text);
  if (path === "") delete all[rootName];
  else all[rootName] = path;
  writeKey(ROOT_PATH_KEY, JSON.stringify(all));
}

/** What every copy starts with: the remembered path, else the folder's name. */
export function rememberedRootPath(rootName: string): string {
  return loadRootPath(rootName) || rootName;
}

/**
 * The text a copy action hands over: a folder path, full when one was pasted,
 * backslashes throughout, never a file name (invariant I-28).
 */
export function folderCopyText(rootName: string, relPath: string): string {
  const base = normalizeRootPath(rememberedRootPath(rootName));
  const rel = folderOf(relPath);
  if (base === "") return rel;
  return rel === "" ? base : `${base}\\${rel}`;
}

/** The folder a copy should name: the batch folder, else the item's own. */
function folderOf(relPath: string): string {
  const segs = relPath.split("/").filter((s) => s !== "");
  const end = batchEnd(segs);
  return segs.slice(0, end > 0 ? end : segs.length - 1).join("\\");
}

/**
 * Index just past a batch base (`…/_split_output/<month>/<stamp>/`), or -1 when
 * the path is not inside one — a folder that merely looks similar keeps its own
 * folder chain.
 */
function batchEnd(segs: string[]): number {
  const at = segs.findIndex((s) => s.toLowerCase() === OUTPUT_DIR);
  const month = segs[at + 1];
  const stamp = segs[at + 2];
  if (at < 0 || month === undefined || stamp === undefined) return -1;
  return MONTH.test(month) && STAMP.test(stamp) ? at + 3 : -1;
}

/** The stored map, validated on read: anything unexpected is no memory. */
function readPaths(): Record<string, string> {
  const raw = readKey(ROOT_PATH_KEY);
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}
