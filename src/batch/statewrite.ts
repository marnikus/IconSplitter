// statewrite.ts — keeps the per-reference state JSON current (spec §2, §6).
// Owns: grouping scanned AI images by (folder, reference base), merging with
// the stored JSON, and rewriting <base>.json beside the reference after every
// scan. State files are app-owned metadata, so overwriting them is allowed
// (user-visible outputs still go through writeFileNew — RULE 23).

import type { AiImageEntry } from "../lib/scan";
import { blankState, mergeScan, parseState, serializeState, type SourceStatus, type BatchReviewStatus, type StateFile } from "../lib/statefile";
import { mapLimited } from "../lib/limiter";
import { probePath, tryGetFile, writeFileOverwrite, type DirHandleLike } from "../lib/fs";

export interface StateKey {
  dirPath: string;
  base: string;
}

export interface SyncResult {
  statuses: Map<string, SourceStatus>; // relPath (lowercase) -> status
  reviews: Map<string, BatchReviewStatus>; // relPath -> review
  keys: StateKey[];
}

/** Refreshes every <base>.json for the current scan + previously known bases. */
export async function syncStateFiles(
  root: DirHandleLike, images: AiImageEntry[], prevKeys: StateKey[], now: string,
): Promise<void> {
  await syncAndCollect({ root, images, prevKeys, overrides: new Map(), reviewOverrides: new Map(), now });
}

export interface SyncArgs {
  root: DirHandleLike;
  images: AiImageEntry[];
  prevKeys: StateKey[];
  overrides: Map<string, SourceStatus>;
  reviewOverrides?: Map<string, BatchReviewStatus>;
  now: string;
}

/**
 * Merges the scan into stored JSON, applies explicit outcome overrides
 * (processed/skipped/deleted from a batch run), rewrites every touched
 * <base>.json, and reports the resulting status per image.
 */
export async function syncAndCollect(args: SyncArgs): Promise<SyncResult> {
  const ctx: SyncCtx = { ...args, result: { statuses: new Map(), reviews: new Map(), keys: [] } };
  const groups = [...groupByState(args.images, args.prevKeys).values()];
  // Groups sync in parallel (2026-11-06); results are merged in group order.
  const states = await mapLimited(groups, SYNC_CONCURRENCY, (g) => syncOne(ctx, g));
  groups.forEach((g, i) => {
    const state = states[i];
    if (state === null) return;
    recordStatuses(state, ctx.result);
    ctx.result.keys.push({ dirPath: g.dirPath, base: g.base });
  });
  return ctx.result;
}

/** State files synced at once; the drive answers each with latency. */
const SYNC_CONCURRENCY = 16;

interface SyncCtx extends SyncArgs {
  result: SyncResult;
}

interface Group {
  dirPath: string;
  base: string;
  items: AiImageEntry[];
}

function groupByState(images: AiImageEntry[], prevKeys: StateKey[]): Map<string, Group> {
  const groups = new Map<string, Group>();
  for (const img of images) {
    const g = ensureGroup(groups, img.dirPath, img.ai.base);
    g.items.push(img);
  }
  for (const k of prevKeys) ensureGroup(groups, k.dirPath, k.base);
  return groups;
}

function ensureGroup(groups: Map<string, Group>, dirPath: string, base: string): Group {
  const key = `${dirPath}\u0000${base}`;
  let g = groups.get(key);
  if (!g) {
    g = { dirPath, base, items: [] };
    groups.set(key, g);
  }
  return g;
}

/**
 * One group's merged state, written only when it CHANGED (2026-11-06): every
 * scan stamps the file's top-level `updated`, so comparing whole files always
 * differed and every scan rewrote every state file — hundreds of writes (each a
 * cloud upload on a synced folder) that also moved every modification time.
 * null when the source folder vanished since the scan.
 */
async function syncOne(ctx: SyncCtx, g: Group): Promise<StateFile | null> {
  const dir = g.dirPath === "" ? ctx.root : await probePath(ctx.root, g.dirPath);
  if (!dir) return null; // source folder vanished since the scan — nothing to update
  const prev = await readPrev(dir, `${g.base}.json`);
  const merged = mergeScan(prev ?? blankState(g.base), g.items, ctx.now);
  const withStatus = applyOverrides(merged, ctx.overrides);
  const withReview = applyReviewOverrides(withStatus, ctx.reviewOverrides ?? new Map(), ctx.now);
  if (!sameExceptScanTime(prev, withReview)) await writeFileOverwrite(dir, `${g.base}.json`, jsonBlob(serializeState(withReview)));
  return withReview;
}

/** Nothing but the scan's own top-level timestamp would change: no write. */
function sameExceptScanTime(prev: StateFile | null, next: StateFile): boolean {
  return prev !== null && serializeState({ ...next, updated: prev.updated }) === serializeState(prev);
}

function applyOverrides(state: ReturnType<typeof mergeScan>, overrides: Map<string, SourceStatus>) {
  if (overrides.size === 0) return state;
  return {
    ...state,
    sources: state.sources.map((r) => {
      const status = overrides.get(r.relPath.toLowerCase());
      return status ? { ...r, status, updated: state.updated } : r;
    }),
  };
}

function applyReviewOverrides(state: ReturnType<typeof mergeScan>, overrides: Map<string, BatchReviewStatus>, now: string) {
  if (overrides.size === 0) return state;
  return {
    ...state,
    sources: state.sources.map((r) => {
      const review = overrides.get(r.relPath.toLowerCase());
      return review ? { ...r, review, reviewUpdated: now, updated: now } : r;
    }),
  };
}

export interface Outcome {
  dirPath: string;
  base: string;
  relPath: string;
  status: SourceStatus;
}

export interface ReviewOutcome {
  dirPath: string;
  base: string;
  relPath: string;
  review: BatchReviewStatus;
}

/**
 * Persists batch outcomes into the existing <base>.json files without
 * re-scanning (sizes/mtimes stay untouched). Unknown groups are ignored.
 */
export async function applyOutcomes(root: DirHandleLike, outcomes: Outcome[], now: string): Promise<void> {
  const groups = new Map<string, Outcome[]>();
  for (const o of outcomes) pushOutcome(groups, o);
  for (const list of groups.values()) await writeOutcomes(root, list, now);
}

export async function applyReviewOutcomes(root: DirHandleLike, outcomes: ReviewOutcome[], now: string): Promise<void> {
  const groups = new Map<string, ReviewOutcome[]>();
  for (const o of outcomes) pushReviewOutcome(groups, o);
  for (const list of groups.values()) await writeReviewOutcomes(root, list, now);
}

function pushOutcome(groups: Map<string, Outcome[]>, o: Outcome): void {
  const key = `${o.dirPath}\u0000${o.base}`;
  const list = groups.get(key) ?? [];
  list.push(o);
  groups.set(key, list);
}

function pushReviewOutcome(groups: Map<string, ReviewOutcome[]>, o: ReviewOutcome): void {
  const key = `${o.dirPath}\u0000${o.base}`;
  const list = groups.get(key) ?? [];
  list.push(o);
  groups.set(key, list);
}

async function writeOutcomes(root: DirHandleLike, list: Outcome[], now: string): Promise<void> {
  const first = list[0];
  const dir = first.dirPath === "" ? root : await probePath(root, first.dirPath);
  if (!dir) return;
  const prev = await readPrev(dir, `${first.base}.json`);
  if (!prev) return; // no state file yet — a future scan will create it
  const byPath = new Map(list.map((o) => [o.relPath.toLowerCase(), o.status]));
  const next = {
    ...prev, updated: now,
    sources: prev.sources.map((r) => {
      const status = byPath.get(r.relPath.toLowerCase());
      return status ? { ...r, status, updated: now } : r;
    }),
  };
  await writeFileOverwrite(dir, `${first.base}.json`, jsonBlob(serializeState(next)));
}

async function writeReviewOutcomes(root: DirHandleLike, list: ReviewOutcome[], now: string): Promise<void> {
  const first = list[0];
  const dir = first.dirPath === "" ? root : await probePath(root, first.dirPath);
  if (!dir) return;
  const prev = await readPrev(dir, `${first.base}.json`);
  if (!prev) return;
  const byPath = new Map(list.map((o) => [o.relPath.toLowerCase(), o.review]));
  const next = {
    ...prev, updated: now,
    sources: prev.sources.map((r) => {
      const review = byPath.get(r.relPath.toLowerCase());
      return review ? { ...r, review, reviewUpdated: now, updated: now } : r;
    }),
  };
  await writeFileOverwrite(dir, `${first.base}.json`, jsonBlob(serializeState(next)));
}

function recordStatuses(state: ReturnType<typeof mergeScan>, result: SyncResult): void {
  for (const r of state.sources) {
    result.statuses.set(r.relPath.toLowerCase(), r.status);
    result.reviews.set(r.relPath.toLowerCase(), r.review ?? "pending");
  }
}

async function readPrev(dir: DirHandleLike, jsonName: string) {
  const fh = await tryGetFile(dir, jsonName);
  if (!fh) return null;
  try {
    return parseState(await (await fh.getFile()).text());
  } catch {
    return null; // unreadable payload is replaced, never fatal (RULE 13)
  }
}

function jsonBlob(text: string): Blob {
  return new Blob([text], { type: "application/json" });
}
