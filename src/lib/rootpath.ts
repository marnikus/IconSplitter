// rootpath.ts — the full path of a picked root, and the copy text built from it
// (feature §2). Why a memory: the File System Access API gives a page only the
// picked folder's NAME ("test_processing") — the drive and the folders above it
// are invisible to the browser for privacy, so a pasteable Windows path has to
// come from the user. It is captured when they pick a folder (the clipboard
// normally still holds Explorer's "Copy as path"), remembered per folder name,
// reused by every tab, and never invented (I-35): with no memory the copy falls
// back to the name. `pickroot`/`clipboardpath` do the capturing; this file owns
// the string rules and the one storage.
//
// The copy itself names a FOLDER, never a file (the user's request): inside a
// run's output tree it stops at the batch folder — the one a human opens in
// Explorer — and anywhere else it keeps the item's own folder.

import { readKey, writeKey } from "../state/safestorage";
import { isRecord } from "./isrecord";

/** `{ [folderName]: { path, how } }`; one key so a root has one path everywhere. */
export const ROOT_PATH_KEY = "iconSplitter.rootpaths.v1";

/** The app's own output tree: `_split_output/<YYYY-MM>/<YYYY-MM-DD_HH-mm-ss>`. */
const MONTH = /^\d{4}-\d{2}$/;
const STAMP = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;
const OUTPUT_DIR = "_split_output";

/** How a remembered path was obtained (I-36 — the UI says which one it is). */
export type PathHow = "copied" | "completed" | "pasted";

export interface RootPathInfo {
  path: string;
  /** null only when no path is known at all. */
  how: PathHow | null;
}

const UNKNOWN: RootPathInfo = { path: "", how: null };

/**
 * The path as Explorer would show it: no surrounding quotes (its "Copy as
 * path" adds them — a half-pasted one is forgiven too), forward slashes as
 * backslashes, no doubled separators (except an UNC share's leading pair) and
 * no trailing separator — so `F:\` and a drive-only root both join as `F:\x`.
 */
export function normalizeRootPath(text: string): string {
  const bare = text.trim().replace(/^["']+/, "").replace(/["']+$/, "").trim();
  const slashes = bare.replace(/\//g, "\\");
  const unc = slashes.startsWith("\\\\") ? "\\\\" : ""; // an UNC share's own pair
  const rest = slashes.replace(/^\\+/, "").replace(/\\{2,}/g, "\\");
  return (unc + rest).replace(/\\+$/, "");
}

/** The last name in a path: `F:\a\b\` -> `b`, `F:\` -> `F:`, "" -> "". */
export function pathLeaf(text: string): string {
  const parts = normalizeRootPath(text).split("\\");
  return parts[parts.length - 1] ?? "";
}

/**
 * The real path of the folder named `folderName`, as told by a copied path
 * (I-35): text whose leaf IS the folder name is adopted as it is; a folder
 * path whose leaf is something else — the parent the user copied — gets the
 * picked name appended and is marked `completed`, so the UI can ask for a
 * second look. A file path and an ordinary word are refused: nothing is
 * invented, and a wrong path is worse than none.
 */
export function pathFromCopied(copied: string, folderName: string): RootPathInfo {
  const path = normalizeRootPath(copied);
  if (folderName === "" || path === "" || !isPathLike(path)) return UNKNOWN;
  const leaf = pathLeaf(path);
  if (leaf.toLowerCase() === folderName.toLowerCase()) return { path, how: "copied" };
  return isFolderPath(path) ? { path: `${path}\\${folderName}`, how: "completed" } : UNKNOWN;
}

/**
 * Path-like at all: a drive or UNC root, or something with a separator in it.
 * A bare word ("hello", or even the folder's own name with no drive) is not a
 * path — storing it would make a copy look authoritative while naming no drive.
 */
function isPathLike(path: string): boolean {
  return /^[A-Za-z]:/.test(path) || path.startsWith("\\\\") || path.includes("\\");
}

/** A drive or UNC root ("F:", "\\\\server\\share") — the only completable base. */
function isRootOnly(path: string): boolean {
  return /^[A-Za-z]:$/.test(path) || /^\\\\[^\\]+\\[^\\]+$/.test(path);
}

function isFolderPath(path: string): boolean {
  return isRootOnly(path) || !/\.[A-Za-z0-9]{1,8}$/.test(path);
}

/** The remembered full path of a root, or "" when none was captured. */
export function loadRootPath(rootName: string): string {
  return loadRootPathInfo(rootName).path;
}

/** The remembered path with the way it was obtained (I-36). */
export function loadRootPathInfo(rootName: string): RootPathInfo {
  const value = readPaths()[rootName];
  if (typeof value === "string") return fromString(value); // written before `how` existed
  if (!isRecord(value)) return UNKNOWN;
  const path = typeof value.path === "string" ? normalizeRootPath(value.path) : "";
  return path === "" ? UNKNOWN : { path, how: readHow(value.how) };
}

function fromString(value: string): RootPathInfo {
  const path = normalizeRootPath(value);
  return path === "" ? UNKNOWN : { path, how: "pasted" };
}

function readHow(value: unknown): PathHow {
  return value === "copied" || value === "completed" || value === "pasted" ? value : "pasted";
}

/**
 * Remembers (or, with an empty value, forgets) a root's full path. Returns the
 * stored info unchanged when nothing moved, so a caller can stay quiet about a
 * repeat.
 */
export function saveRootPathInfo(rootName: string, text: string, how: PathHow = "pasted"): RootPathInfo {
  if (rootName === "") return UNKNOWN;
  const path = normalizeRootPath(text);
  const info: RootPathInfo = path === "" ? UNKNOWN : { path, how };
  const before = loadRootPathInfo(rootName);
  if (before.path === info.path && before.how === info.how) return info;
  const all = readPaths();
  if (info.path === "") delete all[rootName];
  else all[rootName] = { path: info.path, how: info.how };
  writePaths(all);
  return info;
}

/** Remembers a pasted path (the field's own action). */
export function saveRootPath(rootName: string, text: string): void {
  saveRootPathInfo(rootName, text, "pasted");
}

/** What every copy starts with: the remembered path, else the folder's name. */
export function rememberedRootPath(rootName: string): string {
  return loadRootPath(rootName) || rootName;
}

/**
 * Revision + subscribers: the root pills show the full path, and a path captured
 * at pick time must reach them without a reload (I-36). Same-origin tabs notify
 * each other too, so the other tab's pill is right as well.
 */
let revision = 0;
const listeners = new Set<() => void>();
let watching = false;

export function subscribeRootPaths(fn: () => void): () => void {
  listeners.add(fn);
  watchStorage();
  return () => { listeners.delete(fn); };
}

export function rootPathRevision(): number {
  return revision;
}

function watchStorage(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  window.addEventListener("storage", (e) => { if (e.key === ROOT_PATH_KEY) notify(); });
}

function writePaths(all: Record<string, unknown>): void {
  writeKey(ROOT_PATH_KEY, JSON.stringify(all));
  notify();
}

function notify(): void {
  revision += 1;
  for (const fn of listeners) fn();
}

/**
 * The text a copy action hands over: a folder path, full when one was captured,
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
function readPaths(): Record<string, unknown> {
  const raw = readKey(ROOT_PATH_KEY);
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
