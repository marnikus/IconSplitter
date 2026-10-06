// history.ts — RULE 12: ONE global undo/redo timeline shared by every tab.
//
// Contracts adapted from the reference implementation's UndoStore/UndoService
// (docs/archive/2026-10-01-history-session/design.md §1) with two deliberate
// changes: entries carry BOTH `before` and `after`, so undo has no special
// "empty frontier" case and redo re-applies an exact value; and every entry
// names the stable ids it touched (I-10) so a stale target can be detected.
//
// Pure on purpose: no clock, no ids, no storage — the React layer owns those.
// That is what keeps this module trivially testable (RULE 5) and lets a failed
// apply leave the cursor exactly where it was.

import { isRecord } from "./isrecord";

export const HISTORY_VERSION = 1;
export const MAX_HISTORY = 100;
/** One drag on one control is a single gesture, not forty entries. */
export const COALESCE_MS = 900;

export interface HistoryEntry {
  /** Unique action id — never reused, never a row index. */
  id: string;
  /** Action kind, e.g. "decisions" | "checked" | "filters" | "sheets". */
  type: string;
  /** Short human label for the button tooltip: "Approve 14 selected pairs". */
  label: string;
  /** ISO-8601 timestamp (I-1). */
  at: string;
  /** Originating tab/feature, for the history list and for debugging. */
  origin: string;
  /** Affected stable ids (I-10). */
  ids: string[];
  /** Minimal state to restore on undo. */
  before: unknown;
  /** Minimal state to re-apply on redo. */
  after: unknown;
  /** Schema version — a payload from another version is discarded, not trusted. */
  v: number;
}

export interface Timeline {
  entries: HistoryEntry[];
  /** Index of the newest APPLIED entry; -1 means "before the first action". */
  index: number;
}

export interface Step {
  /** The new cursor position — safe to keep even if the apply then fails. */
  timeline: Timeline;
  /** The entry whose value must be applied, or null when there is nothing to do. */
  entry: HistoryEntry | null;
}

export function emptyTimeline(): Timeline {
  return { entries: [], index: -1 };
}

export function canUndo(t: Timeline): boolean {
  return t.index >= 0;
}

export function canRedo(t: Timeline): boolean {
  return t.index < t.entries.length - 1;
}

/** Canonical shape used to collapse a repeated identical edit. */
function shape(e: HistoryEntry): string {
  return JSON.stringify([e.type, e.ids, e.before, e.after]);
}

/** Record a finished action. A new action always clears the redo branch. */
export function pushEntry(t: Timeline, e: HistoryEntry, max = MAX_HISTORY): Timeline {
  const head = t.entries.slice(0, t.index + 1);
  const last = head[head.length - 1];
  if (last && shape(last) === shape(e)) return { entries: head, index: head.length - 1 };
  const entries = [...head, e];
  const overflow = entries.length - max;
  if (overflow <= 0) return { entries, index: entries.length - 1 };
  return { entries: entries.slice(overflow), index: entries.length - 1 - overflow };
}

/**
 * Record a continuous gesture (slider drag, spinner hold) as one entry: while
 * the same control keeps moving inside the window, the tip's `after` is
 * replaced and the original `before` — where the gesture started — is kept, so
 * one undo restores the value the user saw before they touched the control.
 */
export function pushCoalesced(t: Timeline, e: HistoryEntry, nowMs: number, windowMs = COALESCE_MS): Timeline {
  const tip = t.entries[t.index];
  if (!tip || tip.type !== e.type || tip.ids.join("\u0000") !== e.ids.join("\u0000")) return pushEntry(t, e);
  if (nowMs - Date.parse(tip.at) > windowMs) return pushEntry(t, e);
  const entries = [...t.entries.slice(0, t.index), { ...e, before: tip.before }];
  return { entries, index: entries.length - 1 };
}

/** Step back. Returns the entry whose `before` must be applied. */
export function stepBack(t: Timeline): Step {
  if (!canUndo(t)) return { timeline: t, entry: null };
  return { timeline: { entries: t.entries, index: t.index - 1 }, entry: t.entries[t.index] };
}

/** Step forward. Returns the entry whose `after` must be applied. */
export function stepForward(t: Timeline): Step {
  if (!canRedo(t)) return { timeline: t, entry: null };
  const index = t.index + 1;
  return { timeline: { entries: t.entries, index }, entry: t.entries[index] };
}

/** Concise label for the action an undo would reverse. */
export function undoLabel(t: Timeline): string | null {
  return canUndo(t) ? t.entries[t.index].label : null;
}

/** Concise label for the action a redo would re-apply. */
export function redoLabel(t: Timeline): string | null {
  return canRedo(t) ? t.entries[t.index + 1].label : null;
}

export function serializeTimeline(t: Timeline): string {
  return JSON.stringify({ v: HISTORY_VERSION, entries: t.entries, index: t.index });
}

/**
 * Read a persisted timeline. A corrupt, wrong-version or half-damaged payload
 * costs one ignored load and an empty timeline — it can never break startup
 * and can never produce an entry that is applied later (RULE 13).
 */
export function parseTimeline(text: string | null): Timeline {
  if (!text) return emptyTimeline();
  try {
    return toTimeline(JSON.parse(text));
  } catch {
    return emptyTimeline();
  }
}

function toTimeline(raw: unknown): Timeline {
  if (!isRecord(raw) || raw.v !== HISTORY_VERSION || !Array.isArray(raw.entries)) return emptyTimeline();
  const entries = raw.entries.filter(isEntry);
  return { entries, index: clampIndex(raw.index, entries.length - 1) };
}

function clampIndex(raw: unknown, max: number): number {
  if (typeof raw !== "number" || !Number.isInteger(raw)) return max;
  return Math.min(Math.max(raw, -1), max);
}

const TEXT_KEYS = ["id", "type", "label", "at", "origin"] as const;

function isEntry(value: unknown): value is HistoryEntry {
  if (!isRecord(value) || value.v !== HISTORY_VERSION) return false;
  if (!Array.isArray(value.ids) || !value.ids.every((id) => typeof id === "string")) return false;
  return TEXT_KEYS.every((key) => typeof value[key] === "string");
}
