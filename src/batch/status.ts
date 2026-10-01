// status.ts owns JSON status tracking: identity, reconcile, parse/build (pure).

import { baseOfAi } from "./naming";
import { dirOf, fileOf } from "./paths";

export type TrackState = "unprocessed" | "processed" | "skipped" | "missing" | "changed" | "deleted";

export const TRACK_STATES: TrackState[] = ["unprocessed", "processed", "skipped", "missing", "changed", "deleted"];

export interface FileId {
  relPath: string;
  size: number;
  mtime: number;
  hash?: string;
}

export interface Tracked extends FileId {
  state: TrackState;
  lastSeen: string;
  lastDone?: string;
  output?: string;
  note?: string;
}

export interface StatusFile {
  version: 1;
  base: string;
  reference: string;
  referenceFound: boolean;
  updatedAt: string;
  images: Tracked[];
}

export interface StatusHead {
  base: string;
  reference: string;
  referenceFound: boolean;
}

export interface StatusGroupKey {
  dir: string;
  base: string;
}

export interface StatusGroup extends StatusGroupKey {
  images: Tracked[];
}

export interface ReconcileOpts {
  now: string;
  useHash: boolean;
}

export interface ReconcileEvents {
  added: FileId[];
  changed: Tracked[];
  moved: { from: string; to: string }[];
  missing: Tracked[];
  deleted: Tracked[];
}

export interface ReconcileResult {
  next: Tracked[];
  events: ReconcileEvents;
}

export function fnv1aHex(bytes: Uint8Array): string {
  let h = 2166136261;
  for (const b of bytes) h = Math.imul(h ^ b, 16777619) >>> 0;
  return h.toString(16).padStart(8, "0");
}

export function sameContent(a: FileId, b: FileId, useHash: boolean): boolean {
  if (a.size !== b.size || a.mtime !== b.mtime) return false;
  if (!useHash || a.hash == null || b.hash == null) return true;
  return a.hash === b.hash;
}

function emptyEvents(): ReconcileEvents {
  return { added: [], changed: [], moved: [], missing: [], deleted: [] };
}

function currentByPath(curr: FileId[]): Map<string, FileId> {
  const m = new Map<string, FileId>();
  for (const c of curr) m.set(c.relPath, c);
  return m;
}

function trackNew(c: FileId, now: string, note?: string): Tracked {
  return { ...c, state: "unprocessed", lastSeen: now, note };
}

function refreshTracked(p: Tracked, c: FileId, o: ReconcileOpts): Tracked {
  if (!sameContent(p, c, o.useHash)) {
    return { ...p, size: c.size, mtime: c.mtime, hash: c.hash, state: "changed", lastSeen: o.now, note: "modified since last scan" };
  }
  if (p.state === "missing" || p.state === "deleted") {
    return { ...p, size: c.size, mtime: c.mtime, hash: c.hash, state: "unprocessed", lastSeen: o.now, note: "reappeared" };
  }
  return { ...p, lastSeen: o.now };
}

function markMissed(p: Tracked): Tracked {
  const gone = p.state === "missing" || p.state === "deleted";
  return { ...p, state: gone ? "deleted" : "missing", note: gone ? p.note : "not found in latest scan" };
}

interface ReconCtx {
  byPath: Map<string, FileId>;
  used: Set<string>;
  pool: FileId[];
  opts: ReconcileOpts;
  next: Tracked[];
  events: ReconcileEvents;
}

function matchMove(p: Tracked, ctx: ReconCtx): FileId | null {
  const hit = ctx.pool.find((c) => !ctx.used.has(c.relPath) && sameContent(p, c, ctx.opts.useHash));
  if (!hit) return null;
  ctx.used.add(hit.relPath);
  return hit;
}

function applyMove(p: Tracked, to: FileId, ctx: ReconCtx): void {
  ctx.next.push({ ...p, state: "deleted", note: `moved to ${to.relPath}` });
  ctx.next.push(trackNew(to, ctx.opts.now, `moved from ${p.relPath}`));
  ctx.events.moved.push({ from: p.relPath, to: to.relPath });
}

function pushMissed(p: Tracked, ctx: ReconCtx): void {
  const m = markMissed(p);
  ctx.next.push(m);
  ctx.events[m.state === "deleted" ? "deleted" : "missing"].push(m);
}

function reconcileKnown(p: Tracked, ctx: ReconCtx): void {
  const hit = ctx.byPath.get(p.relPath);
  if (hit) {
    ctx.used.add(hit.relPath);
    const t = refreshTracked(p, hit, ctx.opts);
    if (t.state === "changed" && p.state !== "changed") ctx.events.changed.push(t);
    if (t.state === "unprocessed" && p.state !== "unprocessed") ctx.events.added.push(t);
    ctx.next.push(t);
    return;
  }
  const moved = matchMove(p, ctx);
  if (moved) applyMove(p, moved, ctx);
  else pushMissed(p, ctx);
}

export function reconcileScan(prev: Tracked[], curr: FileId[], opts: ReconcileOpts): ReconcileResult {
  const ctx: ReconCtx = { byPath: currentByPath(curr), used: new Set(), pool: curr, opts, next: [], events: emptyEvents() };
  for (const p of prev) reconcileKnown(p, ctx);
  for (const c of curr) {
    if (ctx.used.has(c.relPath)) continue;
    ctx.used.add(c.relPath);
    ctx.next.push(trackNew(c, opts.now));
    ctx.events.added.push(c);
  }
  return { next: ctx.next, events: ctx.events };
}

export function buildStatus(head: StatusHead, images: Tracked[], now: string): StatusFile {
  return { version: 1, ...head, updatedAt: now, images };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function hasIdentity(v: Record<string, unknown>): boolean {
  return typeof v.relPath === "string" && !!v.relPath && typeof v.size === "number" && v.size >= 0 && typeof v.mtime === "number" && v.mtime >= 0;
}

function hasState(v: Record<string, unknown>): boolean {
  return typeof v.state === "string" && (TRACK_STATES as string[]).includes(v.state) && typeof v.lastSeen === "string";
}

function optStr(v: unknown): boolean {
  return v === undefined || typeof v === "string";
}

function hasOptionalStrings(v: Record<string, unknown>): boolean {
  return optStr(v.hash) && optStr(v.lastDone) && optStr(v.output) && optStr(v.note);
}

function isTracked(v: unknown): v is Tracked {
  return isRecord(v) && hasIdentity(v) && hasState(v) && hasOptionalStrings(v);
}

function hasStatusHead(v: Record<string, unknown>): boolean {
  return v.version === 1 && typeof v.base === "string" && !!v.base && typeof v.reference === "string" && typeof v.referenceFound === "boolean" && typeof v.updatedAt === "string";
}

export function parseStatus(raw: unknown): StatusFile | null {
  if (!isRecord(raw) || !hasStatusHead(raw)) return null;
  if (!Array.isArray(raw.images)) return null;
  const images = raw.images.filter(isTracked);
  if (images.length !== raw.images.length) return null;
  return {
    version: 1,
    base: raw.base as string,
    reference: raw.reference as string,
    referenceFound: raw.referenceFound as boolean,
    updatedAt: raw.updatedAt as string,
    images,
  };
}

export function statusGroupOf(relPath: string): StatusGroupKey | null {
  const base = baseOfAi(fileOf(relPath));
  return base === null ? null : { dir: dirOf(relPath), base };
}

export function groupKeyOf(key: StatusGroupKey): string {
  return JSON.stringify([key.dir, key.base]);
}

export function parseGroupKey(id: string): StatusGroupKey | null {
  try {
    const parsed: unknown = JSON.parse(id);
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [dir, base] = parsed;
    if (typeof dir !== "string" || typeof base !== "string" || !base) return null;
    return { dir, base };
  } catch {
    return null;
  }
}

export function groupByStatusFile(items: Tracked[]): Map<string, StatusGroup> {
  const out = new Map<string, StatusGroup>();
  for (const t of items) {
    const key = statusGroupOf(t.relPath);
    if (!key) continue;
    const id = groupKeyOf(key);
    const hit = out.get(id);
    if (hit) hit.images.push(t);
    else out.set(id, { ...key, images: [t] });
  }
  return out;
}

export function flattenStatuses(byGroup: Map<string, StatusFile>): Tracked[] {
  return [...byGroup.values()].flatMap((s) => s.images);
}
