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
  shareWithTwins(entry);
}

/** The platform's folder identity (never a name); false for a handle that cannot say. */
async function sameEntry(a: DirHandleLike, b: DirHandleLike): Promise<boolean> {
  if (a === b) return true;
  try { return (await withinMs(Promise.resolve(a.isSameEntry?.(b)), ANSWER_MS)) === true; } catch { return false; }
}

/** How long a browser answer about a stored folder is waited for (a handle of a gone drive may never answer). */
export const ANSWER_MS = 1500;

/** `work`, or undefined when it has not answered in time (it goes on by itself). */
export function withinMs<T>(work: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([work, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);
}

/**
 * One folder, several handle objects (2026-11-26): every tab restores its OWN
 * handle, so a path bound to one is handed to the others of the same folder
 * still waiting for theirs — a reload no longer shows "full path not found".
 */
function shareWithTwins(entry: KnownRoot): void {
  if (entry.path === "") return;
  for (const k of known.filter((x) => x.path === "" && x.handle !== entry.handle)) {
    void sameEntry(k.handle, entry.handle).then((same) => {
      if (same && boundRootPathInfo(k.handle).path === "") rememberKnownRoot(k.handle, entry.path, entry.how ?? "derived");
    });
  }
}

/** A path another handle of this same folder already holds, or null. */
async function twinPath(handle: DirHandleLike): Promise<KnownRoot | null> {
  for (const k of known.filter((x) => x.path !== "" && x.handle !== handle)) {
    if (await sameEntry(k.handle, handle)) return k;
  }
  return null;
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
  // never holds a tab's start and never throws (2026-11-26): a stuck or failed
  // lookup left the restored folder unscanned — it goes on and binds when it lands
  await withinMs(restoreNow(handle).catch(() => undefined), ANSWER_MS);
}

async function restoreNow(handle: DirHandleLike): Promise<void> {
  const info = await lookupRootPath(handle);
  if (info.path !== "") return rememberKnownRoot(handle, info.path, info.how);
  const twin = await twinPath(handle); // another tab already holds this folder's path (2026-11-26)
  if (twin !== null) return rememberKnownRoot(handle, twin.path, twin.how ?? "derived");
  if (boundRootPathInfo(handle).path !== "") return; // a session capture stays as it is
  if (!known.some((k) => k.handle === handle)) rememberKnownRoot(handle, ""); // waits: a path found later reaches it
  if (resolver !== null) void resolver(handle).catch(() => null); // the local helper finds it in the background (2026-11-16); the rows update when bound
}

/** Who finds a folder's full path when none was saved (ui/bridgeroot.ts registers the local helper). */
let resolver: ((handle: DirHandleLike) => Promise<string | null>) | null = null;
export function setRootResolver(fn: ((handle: DirHandleLike) => Promise<string | null>) | null): void { resolver = fn; }
export async function resolveRootPath(handle: DirHandleLike): Promise<string | null> {
  return resolver === null ? null : resolver(handle).catch(() => null);
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
