// rootpath.ts — the full path of a picked root, and the copy text built from it
// (feature §2). Why a memory: the File System Access API gives a page only the
// picked folder's NAME — the drive and the folders above it are invisible to the
// browser, so a usable Windows path has to come from the user. It is captured
// from the clipboard when they open the folder (ui/pickroot, I-35), remembered
// per folder name, reused by every tab, and never invented or completed by
// guessing (I-29/I-35). Only ever an Explorer FOLDER path — markup, URLs, words
// and file names are refused on the way in and again on the way out (I-39). The
// path is shown as read-only text in one row per tab (ui/FolderBar,
// design 2026-10-05-folder-ui); nothing up here accepts a typed path any more.
// `clipboardpath` does the capturing; this file owns the string rules and the
// one storage.
//
// The copy itself names a FOLDER, never a file (the user's request): inside a
// run's output tree it stops at the batch folder — the one a human opens in
// Explorer — and anywhere else it keeps the item's own folder.

import { readKey, writeKey } from "../state/safestorage";
import { isRecord } from "./isrecord";

/** `{ [folderName]: path }`; one key so a root has one path everywhere. */
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
 * True only for what Explorer can hand over (I-39): a drive path (`F:`, `F:\`,
 * `F:\a\b` — forward slashes and surrounding quotes forgiven), or a UNC path
 * (`\\server\share`, `\\server\share\folder`). Markup, URLs, bare words,
 * relative paths and file names are all refused — a wrong path in the memory is
 * worse than none, and the app must never invent one.
 */
const FORBIDDEN = /[<>"|?*]/; // the characters Windows forbids in a name

export function isFolderPathText(text: string): boolean {
  const path = normalizeRootPath(text);
  if (path === "" || hasControl(path) || FORBIDDEN.test(path)) return false;
  const rest = path.replace(/^[A-Za-z]:/, ""); // the drive's own colon is legal
  if (rest.includes(":")) return false;
  if (/^[A-Za-z]:$/.test(path)) return true; // the drive root itself
  if (/^[A-Za-z]:\\/.test(path)) return true;
  return /^\\\\[^\\]+\\[^\\]+(\\|$)/.test(path); // \\server\share[\…]
}

/** A control character — a newline pasted along with the text, say: never a path. */
function hasControl(path: string): boolean {
  return [...path].some((ch) => ch.charCodeAt(0) < 0x20);
}

/**
 * The real path of the folder named `folderName`, as told by copied text
 * (I-35/I-39): adopted only when the copied path's leaf IS that folder's name,
 * so "the folder I copied" and "the folder I opened" are provably the same one.
 * Everything else — the parent it lives in, a file, a word, markup — is refused
 * with "", because the app never invents or completes a drive path.
 */
export function pathFromCopied(copied: string, folderName: string): string {
  if (folderName === "" || !isFolderPathText(copied)) return "";
  const path = normalizeRootPath(copied);
  return pathLeaf(path).toLowerCase() === folderName.toLowerCase() ? path : "";
}

/** The remembered full path of a root, or "" when none was captured. */
export function loadRootPath(rootName: string): string {
  const path = normalizeRootPath(storedText(readPaths()[rootName]));
  return path !== "" && isFolderPathText(path) ? path : "";
}

/** Both payloads an earlier build could have written: `{ path, … }` or a string. */
function storedText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return "";
  return typeof value.path === "string" ? value.path : "";
}

/**
 * Remembers a root's full path — the only writer, so the guard runs on every
 * write (I-39). Anything that is not an Explorer folder path (markup, a URL, a
 * bare word, a file name, empty text) is refused and the previous value is
 * kept: no memory beats a wrong one. Returns true when the memory holds `text`.
 */
export function saveRootPath(rootName: string, text: string): boolean {
  const path = normalizeRootPath(text);
  if (rootName === "" || path === "" || !isFolderPathText(path)) return false;
  if (loadRootPath(rootName) === path) return true; // nothing moved: stay quiet
  const all = readPaths();
  all[rootName] = path;
  writePaths(all);
  return true;
}

/** What every copy starts with: the remembered path, else the folder's name. */
export function rememberedRootPath(rootName: string): string {
  return loadRootPath(rootName) || rootName;
}

/**
 * Revision + subscribers: the path rows show the full path, and a path captured
 * at pick time must reach them without a reload (I-36). Same-origin tabs notify
 * each other too, so the other tab's row is right as well.
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
