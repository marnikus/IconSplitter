// logbuffer.ts — the ring behind the log (log-contract.md §6). admit() is the
// one way an entry gets in: flood guard → fold → ring. Pure: the clock and the
// maximum arrive in `ctx`, nothing is mutated, the same inputs give the same
// buffer — which is what makes the retention rules testable (RULE 5/8).

import type { LogEntry } from "./logentry";

/** Identical consecutive entries within this window become one with `repeat`. */
export const FOLD_MS = 2000;
/** More than this many admissions inside one window are dropped… */
export const FLOOD_MAX = 100;
/** …where a window is this long. */
export const FLOOD_MS = 1000;
/** The note is feature `log`, action `flood` — the vocabulary name minus its feature. */
const FLOOD = "flood";

export interface LogBuffer {
  entries: readonly LogEntry[];
  /** What the newest entry folds on, and when it was last seen (ms). */
  last: { fold: string; at: number } | null;
  /** The current flood window: when it began and how many admissions it holds. */
  window: { start: number; count: number };
}

export interface AdmitCtx {
  /** The logger's clock, in ms. */
  now: number;
  /** The ring size — the user's one "max entries" choice. */
  max: number;
  /** Entries with the same fold key as the previous one fold into it. */
  fold: string;
}

export const emptyBuffer = (entries: readonly LogEntry[] = []): LogBuffer => ({ entries, last: null, window: { start: 0, count: 0 } });

/** A new window starts after FLOOD_MS, or when the clock jumped back by more than a window. */
function tick(w: LogBuffer["window"], now: number): LogBuffer["window"] {
  const fresh = now - w.start >= FLOOD_MS || w.start - now > FLOOD_MS;
  return fresh ? { start: now, count: 1 } : { start: w.start, count: w.count + 1 };
}

export function admit(buf: LogBuffer, entry: LogEntry, ctx: AdmitCtx): LogBuffer {
  const next = { ...buf, window: tick(buf.window, ctx.now) };
  if (next.window.count > FLOOD_MAX) return noteFlood(next, entry, ctx);
  return foldInto(next, entry, ctx) ?? ringTo(next, entry, ctx);
}

/** One note per flood window, its count kept current instead of a line per dropped entry. */
function noteFlood(buf: LogBuffer, e: LogEntry, ctx: AdmitCtx): LogBuffer {
  const tail = buf.entries[buf.entries.length - 1];
  const open = tail !== undefined && tail.feature === "log" && tail.action === FLOOD && buf.last?.fold === FLOOD;
  const entries = open
    ? [...buf.entries.slice(0, -1), { ...tail, data: { suppressed: Number(tail.data.suppressed ?? 0) + 1 } }]
    : [...buf.entries, floodNote(e)];
  return { ...buf, entries, last: { fold: FLOOD, at: ctx.now } };
}

function floodNote(e: LogEntry): LogEntry {
  return {
    v: 1, id: e.id, at: e.at, sid: e.sid, level: "warn", feature: "log", action: FLOOD,
    message: "Too many log entries per second — the rest are dropped", ids: {}, data: { suppressed: 1 },
  };
}

/** Folds into the previous entry when it is the same thing again, soon enough. */
function foldInto(buf: LogBuffer, e: LogEntry, ctx: AdmitCtx): LogBuffer | null {
  const tail = buf.entries[buf.entries.length - 1];
  if (tail === undefined || buf.last === null) return null;
  if (buf.last.fold !== ctx.fold || ctx.now - buf.last.at > FOLD_MS) return null;
  const { usage: _old, ...base } = tail;
  const merged: LogEntry = { ...base, at: e.at, message: e.message, ids: e.ids, data: e.data, repeat: (tail.repeat ?? 1) + 1 };
  if (e.usage !== undefined) merged.usage = e.usage;
  return { ...buf, entries: [...buf.entries.slice(0, -1), merged], last: { fold: ctx.fold, at: ctx.now } };
}

function ringTo(buf: LogBuffer, e: LogEntry, ctx: AdmitCtx): LogBuffer {
  const all = [...buf.entries, e];
  return { ...buf, entries: all.slice(Math.max(0, all.length - ctx.max)), last: { fold: ctx.fold, at: ctx.now } };
}

/** Lowering the maximum drops the oldest entries at once. */
export function trimTo(buf: LogBuffer, max: number): LogBuffer {
  if (buf.entries.length <= max) return buf;
  return { ...buf, entries: buf.entries.slice(Math.max(0, buf.entries.length - max)) };
}
