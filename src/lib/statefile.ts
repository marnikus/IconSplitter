// statefile.ts — per-reference JSON state model (spec §2, §6; RULE 13).
// Owns: SourceRecord statuses, merge of a fresh scan into prior state,
// mark-as-processed, and strict parse/serialize that rejects corrupt data.
// Pure module: no IO. src/batch/store.ts reads/writes the file itself.

export type SourceStatus =
  | "unprocessed"
  | "processed"
  | "skipped"
  | "missing"
  | "changed"
  | "deleted";

export interface SourceRecord {
  relPath: string;
  name: string;
  size: number;
  mtime: number;
  hash?: string;
  status: SourceStatus;
  updated: string; // ISO timestamp of last status change
}

export interface StateFile {
  base: string; // reference base name, e.g. "icon-award-ribbon"
  refRelPath: string | null;
  refMissing: boolean;
  updated: string;
  sources: SourceRecord[];
}

export function blankState(base: string): StateFile {
  return { base, refRelPath: null, refMissing: false, updated: "", sources: [] };
}

interface ScanItem {
  relPath: string;
  name: string;
  size: number;
  mtime: number;
  hash?: string;
  refRelPath: string | null;
}

/** Merges the current scan into prior state; absent files become 'missing'. */
export function mergeScan(prev: StateFile, curr: ScanItem[], now: string): StateFile {
  const ctx = createContext(prev);
  for (const item of curr) upsertItem(ctx, item, now);
  retainAbsent(ctx, prev.sources, now);
  const out = blankState(prev.base);
  out.sources = ctx.sources;
  finalizeRefs(out, curr);
  out.updated = now;
  return out;
}

interface MergeCtx {
  byPath: Map<string, SourceRecord>;
  seen: Set<string>;
  sources: SourceRecord[];
}

function createContext(prev: StateFile): MergeCtx {
  return {
    byPath: new Map(prev.sources.map((r) => [r.relPath.toLowerCase(), r])),
    seen: new Set<string>(),
    sources: [],
  };
}

function upsertItem(ctx: MergeCtx, item: ScanItem, now: string): void {
  const key = item.relPath.toLowerCase();
  ctx.seen.add(key);
  const prev = ctx.byPath.get(key);
  ctx.sources.push(prev ? refreshRecord(prev, item, now) : newRecord(item, now));
}

function newRecord(item: ScanItem, now: string): SourceRecord {
  return {
    relPath: item.relPath, name: item.name, size: item.size, mtime: item.mtime,
    hash: item.hash, status: "unprocessed", updated: now,
  };
}

function refreshRecord(prev: SourceRecord, item: ScanItem, now: string): SourceRecord {
  const changed = prev.size !== item.size || prev.mtime !== item.mtime;
  return {
    ...prev,
    size: item.size, mtime: item.mtime, hash: item.hash ?? prev.hash,
    status: changed ? "changed" : revive(prev.status),
    updated: changed || prev.status === "missing" ? now : prev.updated,
  };
}

/** A file present again is work to do unless it was already processed. */
function revive(status: SourceStatus): SourceStatus {
  if (status === "missing" || status === "deleted" || status === "changed") return "unprocessed";
  return status;
}

function retainAbsent(ctx: MergeCtx, prevSources: SourceRecord[], now: string): void {
  for (const rec of prevSources) {
    if (ctx.seen.has(rec.relPath.toLowerCase())) continue;
    ctx.sources.push({ ...rec, status: "missing", updated: now });
  }
}

function finalizeRefs(out: StateFile, curr: ScanItem[]): void {
  const withRef = curr.find((c) => c.refRelPath !== null);
  out.refRelPath = withRef?.refRelPath ?? out.refRelPath;
  out.refMissing = curr.length > 0 && curr.every((c) => c.refRelPath === null);
}

/** Marks one source processed (or skipped); returns a new state. */
export function markProcessed(state: StateFile, relPath: string, now: string, status: SourceStatus = "processed"): StateFile {
  return {
    ...state,
    updated: now,
    sources: state.sources.map((r) =>
      r.relPath === relPath ? { ...r, status, updated: now } : r),
  };
}

export function serializeState(s: StateFile): string {
  return JSON.stringify(s, null, 2);
}

/** Parses and validates; returns null for anything unreadable (RULE 13). */
export function parseState(text: string): StateFile | null {
  try {
    return validateState(JSON.parse(text));
  } catch {
    return null;
  }
}

const STATUSES: SourceStatus[] = ["unprocessed", "processed", "skipped", "missing", "changed", "deleted"];

function validateState(x: unknown): StateFile | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  if (typeof o.base !== "string" || !Array.isArray(o.sources)) return null;
  const sources = o.sources.flatMap(validRecord);
  return {
    base: o.base,
    refRelPath: typeof o.refRelPath === "string" ? o.refRelPath : null,
    refMissing: o.refMissing === true,
    updated: typeof o.updated === "string" ? o.updated : "",
    sources,
  };
}

function validRecord(x: unknown): SourceRecord[] {
  if (typeof x !== "object" || x === null) return [];
  const r = x as Record<string, unknown>;
  if (typeof r.relPath !== "string") return [];
  return [recordFrom(r)];
}

function recordFrom(r: Record<string, unknown>): SourceRecord {
  const relPath = r.relPath as string;
  return {
    relPath,
    name: strOr(r.name, relPath.split("/").pop() ?? relPath),
    size: numOr(r.size),
    mtime: numOr(r.mtime),
    hash: typeof r.hash === "string" ? r.hash : undefined,
    status: validStatus(r.status),
    updated: strOr(r.updated, ""),
  };
}

function strOr(x: unknown, fallback: string): string {
  return typeof x === "string" ? x : fallback;
}

function numOr(x: unknown): number {
  return typeof x === "number" ? x : 0;
}

function validStatus(x: unknown): SourceStatus {
  return STATUSES.includes(x as SourceStatus) ? (x as SourceStatus) : "unprocessed";
}
