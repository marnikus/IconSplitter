// rootpath.ts — the STRING rules of a Windows folder path, and nothing else.
// It owns: what Explorer's "Copy as path" can hand over (`isFolderPathText`),
// how such a text is normalised, which leaf it names, the path arithmetic a
// derivation needs (join the segments a `resolve()` reported, trim the segments
// back off it), and the one join a copy is made of — base + the folder the file
// lives in (I-56).
//
// Which folder HAS which path is not this file's business: `lib/pathmemory`
// owns that, keyed by handle (I-63). This file stays pure — text in, text out —
// so every caller agrees on separators, quotes and what counts as a path, and
// nothing here can invent one (I-35/I-39).

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

/**
 * A path as the parts a derivation counts: the drive (`F:`) or the whole UNC
 * head (`\\server`) is the first one, so a trim can tell where the root starts.
 * `F:\a\b` -> `["F:", "a", "b"]`, `\\server\share\a` -> `["\\server", "share", "a"]`.
 */
export function pathSegments(text: string): string[] {
  const path = normalizeRootPath(text);
  if (path === "") return [];
  const head = path.startsWith("\\\\") ? "\\\\" : "";
  const parts = path.slice(head.length).split("\\").filter((s) => s !== "");
  return parts.length === 0 ? [] : [head + parts[0], ...parts.slice(1)];
}

/** The last name in a path: `F:\a\b\` -> `b`, `F:\` -> `F:`, "" -> "". */
export function pathLeaf(text: string): string {
  const parts = pathSegments(text);
  return parts[parts.length - 1] ?? "";
}

/** A captured path plus the segments a `resolve()` reported below it. */
export function joinSegments(base: string, segments: readonly string[]): string {
  const head = normalizeRootPath(base);
  const tail = segments.filter((s) => s !== "").join("\\");
  if (tail === "") return head;
  return head === "" ? tail : `${head}\\${tail}`;
}

/**
 * A captured path minus the segments from the pick down to it — the answer for
 * a folder ABOVE a captured one. Trimming that would cut through the drive or
 * the UNC share answers "" instead: no proof, and never a shorter guess.
 */
export function trimSegments(path: string, count: number): string {
  const parts = pathSegments(path);
  const root = parts[0]?.startsWith("\\\\") === true ? 2 : 1; // a share is two names
  if (count <= 0 || count > parts.length - root) return "";
  return parts.slice(0, parts.length - count).join("\\");
}

/**
 * True only for what Explorer can hand over (I-39): a drive path (`F:`, `F:\`,
 * `F:\a\b` — forward slashes and surrounding quotes forgiven), or a UNC path
 * (`\\server\share`, `\\server\share\folder`). Markup, URLs, bare words,
 * relative paths and file names are all refused — a wrong path is worse than
 * none, and the app must never invent one.
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
 * (I-35/I-39): text whose leaf IS the folder name is adopted as it is, and
 * "" is the answer for everything else — a parent folder, another folder,
 * markup, a URL, a word, a file. Nothing is completed into a guess (I-59).
 */
export function pathFromCopied(copied: string, folderName: string): string {
  if (folderName === "" || !isFolderPathText(copied)) return "";
  const path = normalizeRootPath(copied);
  return pathLeaf(path).toLowerCase() === folderName.toLowerCase() ? path : "";
}

/**
 * The text a copy action hands over: a folder path, full when the caller has a
 * proven base and the folder's own name when it does not, backslashes
 * throughout, never a file name (I-28). `lib/copypath` resolves the base from
 * the folder's handle, so the copy and the row can never disagree (I-56/I-63).
 */
export function folderCopyText(basePath: string, relPath: string): string {
  return joinSegments(basePath, folderSegments(relPath));
}

/**
 * The folders above the file at `relPath` — every one of them, whether or not
 * it looks like a month, a run stamp or a `split_NN`. A file sitting directly
 * in the root answers nothing, which leaves the base itself. Nothing is ever
 * inferred from the file name: the answer is the path the caller handed over,
 * minus its last segment (I-56).
 */
function folderSegments(relPath: string): string[] {
  const segs = relPath.split("/").filter((s) => s !== "");
  return segs.slice(0, Math.max(0, segs.length - 1));
}
