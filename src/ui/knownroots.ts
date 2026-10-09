// knownroots.ts — the folders this app has already picked, each with the full
// path captured for it (I-51). Why they matter: the File System Access API never
// tells a page the drive path of a picked folder (I-35), so the clipboard is the
// only source of the FIRST path — but its own `resolve()` does tell the page that
// one folder contains another. With a folder already known, the next pick inside
// it can be named exactly: the known path plus the segments `resolve()` returns.
// Session state only, plus whatever the tabs restore at boot; nothing is stored,
// because a handle is the record (RULE 13: an unanswerable question stays
// unanswered, never guessed). Only an EXACT capture is a path here: a stored
// guess reads as none (lib/rootpath, I-59), so a derivation can never start
// from one — that is what glued `…\export\test_process_3\_split_output`.

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
    if (segments !== null) return joinPath(root.path, segments);
  }
  return null;
}

/**
 * A capture that arrived AFTER the pick — `Rescan` or the user's own Ctrl+V
 * (I-52) — names every known handle of that name that has no path yet, so the
 * next pick inside it derives an exact path (I-51). A handle that already has
 * a path keeps it: a later same-named folder is not this one.
 */
export function nameKnownRoot(name: string, path: string): void {
  if (name === "" || path === "") return;
  for (const root of known) {
    if (root.handle.name === name && root.path === "") root.path = path;
  }
}

/** `parent.resolve(child)`, or null when it is not a descendant / not allowed. */
async function resolveSegments(parent: DirHandleLike, child: DirHandleLike): Promise<string[] | null> {
  const resolve = (parent as unknown as { resolve?: (h: DirHandleLike) => Promise<unknown> }).resolve;
  if (typeof resolve !== "function") return null;
  try {
    const answer = await resolve.call(parent, child);
    return Array.isArray(answer) && answer.every((s) => typeof s === "string") ? answer : null;
  } catch {
    return null; // a lost permission or a foreign file system: no path, never an error
  }
}

/** A captured path plus segments, with the app's one separator and no doubling. */
function joinPath(base: string, segments: readonly string[]): string {
  const tail = segments.filter((s) => s !== "").join("\\");
  if (tail === "") return base;
  return `${base.replace(/\\+$/, "")}\\${tail}`;
}
