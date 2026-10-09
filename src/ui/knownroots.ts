// knownroots.ts — folders this app has picked, with paths captured from
// Explorer (I-51). A directory handle reveals relationships, not a drive path:
// resolve() can prove either that a known folder contains a new pick or that a
// known child sits below a newly picked parent. Only exact captured paths seed
// this session registry; stored guesses are excluded by lib/rootpath (I-59).

import type { DirHandleLike } from "../lib/fs";
import { pathFromCopied } from "../lib/rootpath";
import { isRecord } from "../lib/isrecord";

interface KnownRoot {
  handle: DirHandleLike;
  path: string;
}

export type RootPathDerivation =
  | { kind: "derived"; path: string }
  | { kind: "none" }
  | { kind: "ambiguous" };

const known: KnownRoot[] = [];
let revision = 0;
const listeners = new Set<() => void>();
let captureChannel: BroadcastChannel | null = null;

/** Remembers a picked folder with the full path captured for it (newest wins). */
export function rememberKnownRoot(handle: DirHandleLike, path: string): void {
  const at = known.findIndex((root) => root.handle === handle);
  if (at >= 0) known.splice(at, 1);
  known.push({ handle, path });
  notifyKnownRoots();
}

/** The captured path for this exact known handle; null means it is not registered. */
export function knownRootPath(handle: DirHandleLike): string | null {
  return known.find((root) => root.handle === handle)?.path ?? null;
}

export function subscribeKnownRoots(listener: () => void): () => void {
  listeners.add(listener);
  watchCaptureChannel();
  return () => { listeners.delete(listener); };
}

export function knownRootRevision(): number {
  return revision;
}

/** The known folders, deepest captured path first. */
export function knownRoots(): KnownRoot[] {
  return [...known].sort((a, b) => b.path.length - a.path.length);
}

/** Tests only: forget every known folder. */
export function clearKnownRoots(): void {
  known.length = 0;
  captureChannel?.close();
  captureChannel = null;
  notifyKnownRoots();
}

/**
 * Derives a path only from a verified handle relationship. The nearest known
 * handle wins; contradictory evidence at that same distance is ambiguous and
 * must not be replaced by clipboard text that happens to share a leaf name.
 */
export async function deriveRootPath(handle: DirHandleLike): Promise<RootPathDerivation> {
  const evidence = (await Promise.all(knownRoots().map((root) => evidenceFrom(root, handle)))).flat();
  return chooseDerivation(evidence);
}

async function evidenceFrom(root: KnownRoot, handle: DirHandleLike): Promise<Array<{ path: string; distance: number }>> {
  if (root.path === "") return [];
  const evidence: Array<{ path: string; distance: number }> = [];
  if (root.handle === handle || await sameEntry(root.handle, handle)) evidence.push({ path: root.path, distance: 0 });
  const below = await resolveSegments(root.handle, handle);
  if (below !== null) evidence.push({ path: joinPath(root.path, below), distance: below.length });
  const above = await resolveSegments(handle, root.handle);
  if (above !== null) addParentEvidence(evidence, root.path, above.length);
  return evidence;
}

function addParentEvidence(evidence: Array<{ path: string; distance: number }>, path: string, distance: number): void {
  const parent = removePathSegments(path, distance);
  if (parent !== null) evidence.push({ path: parent, distance });
}

function chooseDerivation(evidence: Array<{ path: string; distance: number }>): RootPathDerivation {
  if (evidence.length === 0) return { kind: "none" };
  const nearest = Math.min(...evidence.map((item) => item.distance));
  const paths = new Map<string, string>();
  for (const item of evidence) {
    if (item.distance === nearest) paths.set(item.path.toLowerCase(), item.path);
  }
  if (paths.size !== 1) return { kind: "ambiguous" };
  return { kind: "derived", path: [...paths.values()][0] };
}

/** Updates exact same-directory handles when another tab captures their path. */
export async function updateKnownRootPath(handle: DirHandleLike, path: string): Promise<void> {
  const exactPath = pathFromCopied(path, handle.name).path;
  if (exactPath === "") return;
  let matched = false;
  let changed = false;
  for (const root of known) {
    if (root.handle.name.toLowerCase() !== handle.name.toLowerCase()) continue;
    if (root.handle === handle || await sameEntry(root.handle, handle)) {
      matched = true;
      if (root.path !== exactPath) { root.path = exactPath; changed = true; }
    }
  }
  if (!matched) return rememberKnownRoot(handle, exactPath);
  if (changed) notifyKnownRoots();
}

/** Shares a captured File System handle, not just its ambiguous leaf name. */
export function publishKnownRootPath(handle: DirHandleLike, path: string): void {
  const exactPath = pathFromCopied(path, handle.name).path;
  if (exactPath === "") return;
  watchCaptureChannel();
  try { captureChannel?.postMessage({ type: "root-path-captured", handle, path: exactPath }); }
  catch { /* Never fall back to a name-only match if a handle cannot be cloned. */ }
}

function watchCaptureChannel(): void {
  if (captureChannel !== null || typeof BroadcastChannel === "undefined") return;
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel("icon-splitter-root-path-v1");
    channel.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (isCaptureMessage(event.data)) void updateKnownRootPath(event.data.handle, event.data.path);
    });
    captureChannel = channel;
  } catch {
    channel?.close();
  }
}

function isCaptureMessage(value: unknown): value is { handle: DirHandleLike; path: string } {
  if (!isRecord(value) || value.type !== "root-path-captured" || typeof value.path !== "string" || !isRecord(value.handle)) return false;
  return value.handle.kind === "directory" && typeof value.handle.name === "string";
}

function notifyKnownRoots(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

/** `parent.resolve(child)`, or null when it is not a descendant / not allowed. */
async function resolveSegments(parent: DirHandleLike, child: DirHandleLike): Promise<string[] | null> {
  const resolve = parent.resolve;
  if (typeof resolve !== "function") return null;
  try {
    const answer = await resolve.call(parent, child);
    return Array.isArray(answer) && answer.every((segment) => typeof segment === "string") ? answer : null;
  } catch {
    return null; // lost permission or foreign file system: no path, never an error
  }
}

/** Handles from another tab may be distinct JS objects for the same directory. */
async function sameEntry(left: DirHandleLike, right: DirHandleLike): Promise<boolean> {
  if (typeof left.isSameEntry !== "function") return false;
  try {
    return await left.isSameEntry(right);
  } catch {
    return false;
  }
}

/** A captured path plus segments, with the app's one separator and no doubling. */
function joinPath(base: string, segments: readonly string[]): string {
  const tail = segments.filter((segment) => segment !== "").join("\\");
  if (tail === "") return base;
  return `${base.replace(/\\+$/, "")}\\${tail}`;
}

/** Removes verified descendant segments from an exact known Windows/UNC path. */
function removePathSegments(path: string, count: number): string | null {
  if (count === 0) return path;
  const normalized = path.replace(/\//g, "\\").replace(/\\+$/, "");
  const drive = /^([A-Za-z]:)(?:\\|$)/.exec(normalized);
  const unc = /^(\\\\[^\\]+\\[^\\]+)(?:\\|$)/.exec(normalized);
  const root = drive?.[1] ?? unc?.[1];
  if (root === undefined) return null;
  const tail = normalized.slice(root.length).replace(/^\\+/, "");
  const segments = tail === "" ? [] : tail.split("\\").filter((segment) => segment !== "");
  if (count > segments.length) return null;
  const parent = segments.slice(0, segments.length - count);
  return parent.length === 0 ? root : `${root}\\${parent.join("\\")}`;
}
