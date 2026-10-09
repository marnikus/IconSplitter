// pathmemory.ts — the ONE owner of "which folder has which full path" (I-63).
// It owns: the durable list of exact captures (a folder handle + the path
// Explorer gave for it), the proof search that answers a handle's path from
// those captures, and the revision the UI mirrors (RULE 24).
//
// Why handles and not names: the File System Access API gives a page only the
// picked folder's NAME, and this app's own output tree repeats `_split_output`,
// `export`, `2026-10` and `split_NN` at every depth — so a name-keyed memory
// handed folder B the path captured for folder A, silently, three fixes running.
// A handle is the only identity the browser vouches for, and it survives a
// reload in IndexedDB beside the handles the tabs already store there.
//
// Only an EXACT capture is ever stored. Anything else is computed on the spot
// from one (`lib/fsrelate`): the same folder, a folder below it, or a folder
// above it. A computed answer is never written back, so a wrong value can never
// become the base of the next one (I-59), and no answer is ever a guess (I-35).

import { idbGet, idbPut } from "../batch/store";
import type { DirHandleLike } from "./fs";
import { relate, type Relation } from "./fsrelate";
import { isFolderPathText, joinSegments, normalizeRootPath, trimSegments } from "./rootpath";

/** The folder a row or a copy is about: its name to show, its handle to prove. */
export interface FolderRef {
  name: string;
  handle: DirHandleLike | null;
}

/** `copied` — an exact capture. `derived` — computed now from one. */
export type PathHow = "copied" | "derived";

export interface RootPathInfo {
  path: string;
  /** null only when the app can prove no path at all for this folder. */
  how: PathHow | null;
}

export const UNKNOWN_PATH: RootPathInfo = { path: "", how: null };

/** One exact capture: the folder it was made for, and when (newest wins). */
export interface StoredPath {
  handle: DirHandleLike;
  path: string;
  at: number;
}

/** The durable backing — IndexedDB in the app, an identity-keeping double in tests. */
export interface PathStore {
  read(): Promise<StoredPath[]>;
  write(records: readonly StoredPath[]): Promise<void>;
}

/** Captures live beside the folder handles the tabs already persist. */
const HANDLE_STORE = "handles";
const RECORD_KEY = "__rootpaths__";
/** A bounded list: the folders a user actually picks, not a log. */
const MAX_RECORDS = 40;
/**
 * The name-keyed memory retired by I-63. Its values cannot be attributed to a
 * handle, so they cannot be trusted — reading one back is how a stale path
 * outlived three code fixes. It is dropped on the first load and never read.
 */
/**
 * The key an older build used for a NAME-keyed path map (RC1/D2). Nothing reads
 * it any more — a name says nothing about which folder a path belongs to — and
 * the memory deletes it on first load, so a value it poisoned cannot outlive
 * this build (I-63).
 */
export const LEGACY_NAME_KEY = "iconSplitter.rootpaths.v1";

const idbPathStore: PathStore = {
  read: async () => (await idbGet<StoredPath[]>(HANDLE_STORE, RECORD_KEY)) ?? [],
  write: async (rows) => { await idbPut(HANDLE_STORE, RECORD_KEY, [...rows]); },
};

let store: PathStore = idbPathStore;
let records: StoredPath[] = [];
/** Proven answers by handle, so a row can render synchronously after the first. */
const mirror = new Map<DirHandleLike, RootPathInfo>();
let loading: Promise<void> | null = null;
let revision = 0;
const listeners = new Set<() => void>();

/** The proven path of a folder, synchronously — unknown until `pathFor` ran. */
export function peekPath(handle: DirHandleLike | null): RootPathInfo {
  return (handle !== null && mirror.get(handle)) || UNKNOWN_PATH;
}

/**
 * The full path of this folder, from evidence only: its own capture, or a
 * capture the platform proves it is below or above. Answers `UNKNOWN_PATH`
 * otherwise — never a name-keyed lookalike, never a completion (I-35/I-59).
 */
export async function pathFor(handle: DirHandleLike | null): Promise<RootPathInfo> {
  if (handle === null) return UNKNOWN_PATH;
  await ensureLoaded();
  const known = mirror.get(handle);
  if (known !== undefined) return known;
  const info = await prove(handle);
  if (info.path !== "") put(handle, info);
  return info;
}

/**
 * Records an exact capture for THIS folder — the clipboard text at pick time, a
 * `Rescan` or the user's own Ctrl+V. Text that is not a folder path is refused
 * and leaves the previous answer alone (I-39). The newest capture for a handle
 * wins, and only for that handle: a wrong value is bounded to one folder and the
 * next exact capture replaces it (I-63/D4).
 */
export async function rememberPath(handle: DirHandleLike, text: string): Promise<RootPathInfo> {
  const path = normalizeRootPath(text);
  if (!isFolderPathText(path)) return peekPath(handle);
  await ensureLoaded();
  forgetDerived(); // a new capture can move a folder: recompute what depended on the old one
  records = [{ handle, path, at: Date.now() }, ...records.filter((r) => r.handle !== handle)].slice(0, MAX_RECORDS);
  put(handle, { path, how: "copied" });
  await persist();
  return { path, how: "copied" };
}

/** The exact captures, newest first (tests and diagnostics). */
export function recordedPaths(): StoredPath[] {
  return [...records];
}

/** Revision + subscribers: a capture anywhere must reach every row at once. */
export function subscribePaths(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function pathRevision(): number {
  return revision;
}

/** Tests: a fresh memory over another store (the durable double). */
export function resetPathMemory(next: PathStore = idbPathStore): void {
  store = next;
  records = [];
  mirror.clear();
  loading = null;
  revision += 1;
}

/**
 * The newest capture that can place this folder, else no path at all. `records`
 * is already newest-first, and every entry is an exact capture, so the order is
 * only a tie-break: when two captures disagree (a folder moved on disk), the
 * newer one is the one the app believes.
 */
async function prove(handle: DirHandleLike): Promise<RootPathInfo> {
  for (const record of records) {
    const relation = await relate(record.handle, handle);
    const path = pathFrom(relation, record.path);
    if (path !== "") return { path, how: relation.kind === "same" ? "copied" : "derived" };
  }
  return UNKNOWN_PATH;
}

/** What a proven relation makes of a captured path — "" when it proves nothing. */
function pathFrom(relation: Relation, base: string): string {
  if (relation.kind === "same") return base;
  if (relation.kind === "below") return joinSegments(base, relation.segments);
  if (relation.kind === "above") return trimSegments(base, relation.segments.length);
  return ""; // unproven: a sibling tree, a foreign file system, an inert handle
}

function put(handle: DirHandleLike, info: RootPathInfo): void {
  const before = mirror.get(handle);
  if (before !== undefined && before.path === info.path && before.how === info.how) return;
  mirror.set(handle, info);
  notify();
}

function forgetDerived(): void {
  for (const [handle, info] of mirror) {
    if (info.how === "derived") mirror.delete(handle);
  }
}

function notify(): void {
  revision += 1;
  for (const fn of listeners) fn();
}

function ensureLoaded(): Promise<void> {
  if (loading === null) loading = load();
  return loading;
}

/** Reads the durable captures once; a store that fails costs one empty load. */
async function load(): Promise<void> {
  purgeLegacy();
  try {
    records = usable(await store.read());
  } catch {
    records = []; // RULE 13: no storage means no memory, never a broken app
  }
}

/** A stored row is believed only while it is a folder handle and a folder path. */
function usable(rows: readonly StoredPath[]): StoredPath[] {
  return rows.filter(isUsable).slice(0, MAX_RECORDS);
}

function isUsable(row: StoredPath | null | undefined): boolean {
  return row !== null && row !== undefined && isDir(row.handle)
    && isFolderPathText(row.path) && typeof row.at === "number";
}

function isDir(handle: unknown): handle is DirHandleLike {
  if (typeof handle !== "object" || handle === null) return false;
  const dir = handle as DirHandleLike;
  return dir.kind === "directory" && typeof dir.name === "string";
}

async function persist(): Promise<void> {
  try {
    await store.write(records);
  } catch {
    // the session keeps the capture; only a reload would lose it
  }
}

function purgeLegacy(): void {
  try {
    localStorage.removeItem(LEGACY_NAME_KEY);
  } catch {
    // no storage to purge
  }
}
