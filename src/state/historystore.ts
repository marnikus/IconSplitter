// historystore.ts — localStorage IO for the global undo timeline.
// Parsing and validation live in lib/history, so a corrupt or foreign payload
// costs one ignored load, never a broken startup (RULE 13).
//
// Writes are DEFERRED (2026-10-26, D4): a gesture records into memory and the
// timeline is serialized once, after the burst. Serializing inside the click was
// pure input latency, and with delta entries the payload is small enough that a
// single deferred write per burst is all localStorage needs.
//
// Nothing is ever lost silently: a pending write is flushed by `pagehide`, by
// the provider unmounting, and by any `loadHistory()` call (read-your-writes, so
// a reload or a test that reads straight after a gesture sees the truth). A
// storage that refuses the write keeps the session working in memory; the next
// flush tries again with the whole timeline.

import { parseTimeline, serializeTimeline, type Timeline } from "../lib/history";
import { readKey, writeKey } from "./safestorage";

export const HISTORY_KEY = "iconSplitter.history.v1";

/** A burst's writes collapse into one: defer to the end of the current task. */
const SAVE_AFTER_MS = 0;

let pending: Timeline | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function loadHistory(): Timeline {
  flushHistory(); // a pending write lands first: reads are always current
  return parseTimeline(readKey(HISTORY_KEY));
}

/** The synchronous primitive: one serialization, one write. */
export function saveHistory(timeline: Timeline): void {
  writeKey(HISTORY_KEY, serializeTimeline(timeline));
}

/** Queue the latest timeline; repeated calls before the timer fires write once. */
export function scheduleSaveHistory(timeline: Timeline): void {
  pending = timeline;
  if (timer !== null) return;
  timer = setTimeout(() => {
    timer = null;
    flushHistory();
  }, SAVE_AFTER_MS);
}

/** Write a pending timeline now (pagehide, unmount, a read). No-op when idle. */
export function flushHistory(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  const next = pending;
  pending = null;
  if (next !== null) saveHistory(next);
}
