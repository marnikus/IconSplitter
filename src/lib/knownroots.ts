// knownroots.ts — the folders this app has picked, each bound to the full path
// captured for it (I-51, and since the third report 2026-10-09: I-63 — the
// path belongs to the FOLDER, never to its name). Why they matter: the File
// System Access API never tells a page the drive path of a picked folder
// (I-35), so the clipboard is the only source of the FIRST path — but its own
// `resolve()` does tell the page that one folder contains another. With a
// folder already placed exactly, the next pick related to it is exact in BOTH
// directions: below it (join the segments `resolve()` reports) or above it
// (strip the segments — `test_process_3\_split_output` places its parent).
// Session state plus whatever `lib/rootstore` restores at boot; nothing is
// keyed by name, because a name is not an identity (RULE 13: an unanswerable
// question stays unanswered, never guessed).

import type { DirHandleLike } from "./fs";
import {
  NO_ROOT_PATH, isFolderPathText, joinPath, normalizeRootPath, stripPathTail,
  type PathHow, type RootPathInfo,
} from "./rootpath";
import { lookupRootPath } from "./rootstore";

interface KnownRoot {
  handle: DirHandleLike;
  path: string;
  how: PathHow | null;
}

const known: KnownRoot[] = [];

/**
 * Binds a captured (or forgotten — empty `path`) full path to one folder
 * handle (newest wins). A junk path is refused and the old binding stays:
 * the guard at every entry point (I-39).
 */
export function rememberKnownRoot(handle: DirHandleLike, path: string, how: PathHow | null = path === "" ? null : "copied"): void {
  const normalized = normalizeRootPath(path);
  if (normalized !== "" && (!isFolderPathText(normalized) || how === null)) return;
  const at = known.findIndex((k) => k.handle === handle);
  const entry: KnownRoot = { handle, path: normalized, how: normalized === "" ? null : how };
  if (at >= 0) known.splice(at, 1);
  known.push(entry);
  notify();
}

/** The path bound to THIS folder — never a same-named folder's (I-63). */
export function boundRootPathInfo(handle: DirHandleLike | null): RootPathInfo {
  if (handle === null) return NO_ROOT_PATH;
  const entry = known.find((k) => k.handle === handle);
  return entry === undefined || entry.path === "" ? NO_ROOT_PATH : { path: entry.path, how: entry.how };
}

/** The known folders, deepest path first — the order derivation should try. */
export function knownRoots(): KnownRoot[] {
  return [...known].sort((a, b) => b.path.length - a.path.length);
}

/** Tests only: forget every known folder. */
export function clearKnownRoots(): void {
  known.length = 0;
  notify();
}

/**
 * The exact full path of `handle`, derived from a folder this app already
 * placed — below it (join), the folder itself, or ABOVE it (verified strip) —
 * or null when no known folder relates to it (or the platform refuses). The
 * answer is only ever `known path ± the segments resolve() reported`, so it
 * can never be a guess.
 */
export async function deriveRootPath(handle: DirHandleLike): Promise<string | null> {
  for (const root of knownRoots()) {
    const answer = await deriveFrom(root, handle);
    if (answer !== null) return answer;
  }
  return null;
}

/** One known folder's answer: down (or self) first, then up — both exact. */
async function deriveFrom(root: KnownRoot, handle: DirHandleLike): Promise<string | null> {
  if (root.path === "") return null;
  const down = await resolveSegments(root.handle, handle);
  if (down !== null) return joinPath(root.path, down);
  const up = await resolveSegments(handle, root.handle);
  return up === null ? null : stripPathTail(root.path, up);
}

/**
 * Boot's one move: bind the path persisted for this very folder
 * (`lib/rootstore`) to its handle, so the row, the copies and the next
 * derivation all start from the truth (I-51/I-63). A lookup miss changes
 * nothing — a session capture (or a first run) stays as it is.
 */
export async function restoreKnownRoot(handle: DirHandleLike): Promise<void> {
  const info = await lookupRootPath(handle);
  if (info.path !== "") rememberKnownRoot(handle, info.path, info.how);
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

/**
 * Revision + subscribers: the rows show the bound path and a capture must reach
 * them without a reload (I-36/RULE 24) — in every tab of the app at once.
 */
let revision = 0;
const listeners = new Set<() => void>();

export function subscribeRootBindings(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function bindingRevision(): number {
  return revision;
}

function notify(): void {
  revision += 1;
  for (const fn of listeners) fn();
}
