// knownroots.ts — the folders this app has already picked, each with the full
// path captured for it (I-51). Why they matter: the File System Access API never
// tells a page the drive path of a picked folder (I-35), so the clipboard is the
// only source of the FIRST path — but its own `resolve()` does tell the page that
// one folder contains another. With a folder already known, the next pick inside
// it can be named exactly: the known path plus the segments `resolve()` returns.
// Session state only, plus whatever the tabs restore at boot; nothing is stored,
// because a handle is the record (RULE 13: an unanswerable question stays
// unanswered, never guessed).

import type { DirHandleLike } from "../lib/fs";

interface KnownRoot {
  handle: DirHandleLike;
  path: string;
}

const known: KnownRoot[] = [];

/** Remembers a picked folder with the full path captured for it (newest wins). */
export function rememberKnownRoot(handle: DirHandleLike, path: string): void {
  const at = known.findIndex((k) => k.handle === handle);
  if (at >= 0) known.splice(at, 1);
  known.push({ handle, path });
}

/** The known folders, deepest path first — the order derivation should try. */
export function knownRoots(): KnownRoot[] {
  return [...known].sort((a, b) => b.path.length - a.path.length);
}

/** Tests only: forget every known folder. */
export function clearKnownRoots(): void {
  known.length = 0;
}

/**
 * The exact full path of `handle`, derived from a folder this app already picked
 * — or null when no known folder contains it (or the platform refuses). The
 * answer is only ever `known path + the segments resolve() reported`, so it can
 * never be a guess.
 */
export async function deriveRootPath(handle: DirHandleLike): Promise<string | null> {
  for (const root of knownRoots()) {
    if (root.path === "") continue;
    const segments = await resolveSegments(root.handle, handle);
    if (Array.isArray(segments)) return joinPath(root.path, segments);
  }
  return null;
}

/**
 * True when a folder this app already named proves that `folderPath` cannot be
 * the parent of `handle`: the copied folder lies under (or is) that known folder,
 * and the known folder's own `resolve(handle)` answers null — "not below me".
 * The reported mistake (2026-10-09): a folder of the PREVIOUS root still on the
 * clipboard, a sibling tree picked, and the two completed into one wrong path.
 * A refusal to answer (no `resolve`, a throw) proves nothing and yields false.
 */
export async function provenOutside(handle: DirHandleLike, folderPath: string): Promise<boolean> {
  const copied = comparable(folderPath);
  for (const root of knownRoots()) {
    if (root.path === "" || !isWithin(copied, comparable(root.path))) continue;
    if ((await resolveSegments(root.handle, handle)) === "outside") return true;
  }
  return false;
}

/** `path` is `base` itself or a folder below it (both already `comparable`). */
function isWithin(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}\\`);
}

/** Case-folded, without a trailing separator — Windows paths compare that way. */
function comparable(path: string): string {
  return path.replace(/\\+$/, "").toLowerCase();
}

/**
 * `parent.resolve(child)`: the segments when it is a descendant, "outside" when
 * the platform answered null (a definite no), "unknown" when it could not say.
 */
async function resolveSegments(parent: DirHandleLike, child: DirHandleLike): Promise<string[] | "outside" | "unknown"> {
  const resolve = (parent as unknown as { resolve?: (h: DirHandleLike) => Promise<unknown> }).resolve;
  if (typeof resolve !== "function") return "unknown";
  try {
    const answer = await resolve.call(parent, child);
    if (answer === null) return "outside";
    return Array.isArray(answer) && answer.every((s) => typeof s === "string") ? answer : "unknown";
  } catch {
    return "unknown"; // a lost permission or a foreign file system: no path, never an error
  }
}

/** A captured path plus segments, with the app's one separator and no doubling. */
function joinPath(base: string, segments: readonly string[]): string {
  const tail = segments.filter((s) => s !== "").join("\\");
  if (tail === "") return base;
  return `${base.replace(/\\+$/, "")}\\${tail}`;
}
