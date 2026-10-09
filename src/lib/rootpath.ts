// rootpath.ts — the string rules of a folder's full path (feature §2). Why
// there are rules at all: the File System Access API gives a page only the
// picked folder's NAME ("test_processing") — the drive and the folders above it
// are invisible to the browser for privacy, so a pasteable Windows path has to
// come from the user's own Explorer copy ("Copy as path", Ctrl+Shift+C).
//
// This file owns PURE STRING RULES only and stores nothing (I-63): a captured
// path is bound to the folder's HANDLE (lib/knownroots, persisted by
// lib/rootstore), never to its name — every run of this app creates another
// `_split_output`, and the old name-keyed memory showed one folder's path for
// another (three reports, last on 2026-10-09). `lib/clipboardpath` and
// `ui/pickroot` do the capturing; `ui/FolderBar` shows the result (I-46).
//
// The copy itself names a FOLDER, never a file (I-28/I-56): the folder the
// file LIVES IN, e.g. `…\icon_7\split_04`, not the run folder and never the
// file name.

/** `{ path, how }` — how a path was obtained (`null` = nothing is known). */
export type PathHow = "copied" | "derived";

export interface RootPathInfo {
  path: string;
  /** null only when no path is known at all. */
  how: PathHow | null;
}

export const NO_ROOT_PATH: RootPathInfo = { path: "", how: null };

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
 * One folder up: `F:\a\b` -> `F:\a`, `F:\a` -> `F:` — and "" above the drive
 * or the share root, because `\\srv` is not a folder path anyone can open.
 */
export function pathParent(text: string): string {
  const path = normalizeRootPath(text);
  const at = path.lastIndexOf("\\");
  if (at < 0) return "";
  const parent = path.slice(0, at);
  return isFolderPathText(parent) ? parent : "";
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
 * The real path of the folder named `folderName`, as told by a copied path
 * (I-35/I-39): text whose leaf IS the folder name is adopted as it is
 * (`how: "copied"`), and text whose leaf sits DIRECTLY INSIDE the folder names
 * its parent exactly (`how: "derived"` — one level down is the same root; the
 * third report, 2026-10-09). Anything else — an unrelated folder, a parent,
 * markup, a URL, a word, a file — is refused: appending a picked name to a
 * copied folder IS the glue of all three reports and is never done (I-59).
 */
export function pathFromCopied(copied: string, folderName: string): RootPathInfo {
  if (folderName === "" || !isFolderPathText(copied)) return NO_ROOT_PATH;
  const path = normalizeRootPath(copied);
  const leaf = folderName.toLowerCase();
  if (pathLeaf(path).toLowerCase() === leaf) return { path, how: "copied" };
  const parent = pathParent(path);
  return pathLeaf(parent).toLowerCase() === leaf ? { path: parent, how: "derived" } : NO_ROOT_PATH;
}

/** A captured path plus segments, with the app's one separator and no doubling. */
export function joinPath(base: string, segments: readonly string[]): string {
  const root = normalizeRootPath(base);
  const tail = segments.filter((s) => s !== "").join("\\");
  return tail === "" ? root : `${root}\\${tail}`;
}

/**
 * The reverse join, VERIFIED: `F:\a\test_process_3\_split_output` minus
 * `["_split_output"]` is `F:\a\test_process_3` — only when the tail segments
 * really are the ones `resolve()` reported, and only when the result is still a
 * folder path. Anything else answers null: a tail that does not match strips
 * nothing (never a guess, RULE 13).
 */
export function stripPathTail(path: string, segments: readonly string[]): string | null {
  const norm = normalizeRootPath(path);
  if (norm === "") return null;
  const segs = segments.filter((s) => s !== "");
  const parts = norm.split("\\");
  if (segs.length > parts.length) return null;
  const tail = parts.slice(parts.length - segs.length);
  if (tail.some((part, i) => part.toLowerCase() !== segs[i].toLowerCase())) return null;
  const head = parts.slice(0, parts.length - segs.length).join("\\");
  return head !== "" && isFolderPathText(head) ? head : null;
}

/**
 * The text a copy action hands over: a folder path, full when one was captured
 * for the root, backslashes throughout, never a file name (I-28/I-56). `base`
 * is the root's own bound path — else the folder's name (the honest fallback).
 */
export function folderCopyText(base: string, relPath: string): string {
  const root = normalizeRootPath(base);
  const rel = folderOf(relPath);
  if (root === "") return rel;
  return rel === "" ? root : `${root}\\${rel}`;
}

/**
 * The folder a copy names: the one holding the file at `relPath` — every folder
 * above it is kept, whether or not it looks like a month, a run stamp or a
 * `split_NN` (I-56). Nothing is ever inferred from the file name: the answer is
 * the path the caller handed over, minus its last segment.
 */
function folderOf(relPath: string): string {
  const segs = relPath.split("/").filter((s) => s !== "");
  return segs.slice(0, Math.max(0, segs.length - 1)).join("\\");
}


