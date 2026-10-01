// history.ts — the ONE global undo/redo timeline (RULE 12, request §3/§4/§7/§8).
// Pure model only: entry shape, push with redo-branch truncation + gesture
// coalescing + count cap, cursor moves, compaction of obsolete entries, label
// text, validation of a persisted document and the keyboard map. Adapted from
// `Process-Images-in-Areana/app/persistence/undo_store.py` + `core/undo_service.py`
// (contracts only — that repository has no LICENSE, so nothing was copied):
// `{history, index}` with `index = -1` for "nothing applied", 100-entry cap,
// truncate-on-branch, corrupt payload → empty defaults. Storage IO lives in
// `src/history/historystore.ts`, applier dispatch in `src/history/historybus.ts`.

export const HISTORY_VERSION = 1;
export const HISTORY_CAP = 100;
/** A gesture (slider drag, typing) coalesces into one entry inside this window. */
export const COALESCE_MS = 700;

export type HistoryDirection = "undo" | "redo";

/** One reversible user action (request §7). `before`/`after` stay minimal. */
export interface HistoryEntry {
  id: string; // unique action id
  kind: string; // action type — maps to exactly one applier
  label: string; // readable label, e.g. "Approve 14 selected pairs"
  tab: string; // originating tab/feature
  at: number; // epoch ms
  targets: string[]; // affected stable ids
  before: unknown; // minimal before state
  after: unknown; // minimal after state
  v: number; // entry schema version
  ephemeral?: boolean; // owner lives only while its panel is mounted → never stored
  coalesce?: string; // same kind+tab+field within COALESCE_MS merges into one entry
}

export interface HistoryDoc {
  v: number;
  entries: HistoryEntry[];
  /** Index of the newest APPLIED entry; -1 = nothing applied (redo frontier). */
  cursor: number;
}

export const EMPTY_HISTORY: HistoryDoc = { v: HISTORY_VERSION, entries: [], cursor: -1 };

export type EntryDraft = Omit<HistoryEntry, "v" | "id" | "at"> & { v?: number; id?: string; at?: number };

/** Builds a complete entry; features pass everything they know. */
export function entry(draft: EntryDraft): HistoryEntry {
  return { ...draft, id: draft.id || newEntryId(), at: draft.at ?? Date.now(), v: HISTORY_VERSION };
}

export function newEntryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function canUndo(doc: HistoryDoc): boolean {
  return doc.cursor >= 0 && doc.entries.length > 0;
}

export function canRedo(doc: HistoryDoc): boolean {
  return doc.cursor < doc.entries.length - 1;
}

/** The entry undo would reverse (newest applied), or null at the frontier. */
export function nextUndo(doc: HistoryDoc): HistoryEntry | null {
  return canUndo(doc) ? doc.entries[doc.cursor] : null;
}

/** The entry redo would reapply (first undone), or null at the frontier. */
export function nextRedo(doc: HistoryDoc): HistoryEntry | null {
  return canRedo(doc) ? doc.entries[doc.cursor + 1] : null;
}

export function undoLabel(doc: HistoryDoc): string | null {
  const e = nextUndo(doc);
  return e ? `Undo: ${e.label}` : null;
}

export function redoLabel(doc: HistoryDoc): string | null {
  const e = nextRedo(doc);
  return e ? `Redo: ${e.label}` : null;
}

/** Applies a new action: clears the redo branch, coalesces, appends, caps. */
export function pushEntry(doc: HistoryDoc, e: HistoryEntry, cap = HISTORY_CAP): HistoryDoc {
  const kept = doc.entries.slice(0, doc.cursor + 1);
  const stillApplied = doc.entries.length > 0 && doc.cursor === doc.entries.length - 1;
  const merged = tryCoalesce(kept[kept.length - 1], e, stillApplied);
  const entries = capEntries(merged ? [...kept.slice(0, -1), merged] : [...kept, e], cap);
  return { v: HISTORY_VERSION, entries, cursor: entries.length - 1 };
}

/** One gesture = one entry: same kind/tab/field within the window and applied. */
function tryCoalesce(last: HistoryEntry | undefined, e: HistoryEntry, applied: boolean): HistoryEntry | null {
  if (!applied || !last || !e.coalesce) return null;
  if (last.coalesce !== e.coalesce || last.kind !== e.kind || last.tab !== e.tab) return null;
  if (e.at < last.at || e.at - last.at > COALESCE_MS) return null;
  return { ...last, at: e.at, label: e.label, targets: e.targets, after: e.after };
}

function capEntries(entries: HistoryEntry[], cap: number): HistoryEntry[] {
  return entries.length > cap ? entries.slice(entries.length - cap) : entries;
}

/** Moves the cursor one step; the caller applies `entry` through its applier. */
export function moveCursor(doc: HistoryDoc, dir: HistoryDirection): { doc: HistoryDoc; entry: HistoryEntry } | null {
  const entryAt = dir === "undo" ? nextUndo(doc) : nextRedo(doc);
  if (!entryAt) return null;
  const cursor = dir === "undo" ? doc.cursor - 1 : doc.cursor + 1;
  return { doc: { ...doc, cursor }, entry: entryAt };
}

/** Compaction: removes entries that can never be applied again (request §8). */
export function dropEntries(doc: HistoryDoc, ids: readonly string[]): HistoryDoc {
  const drop = new Set(ids);
  const entries: HistoryEntry[] = [];
  let cursor = -1;
  doc.entries.forEach((e, i) => {
    if (drop.has(e.id)) return;
    entries.push(e);
    if (i <= doc.cursor) cursor = entries.length - 1;
  });
  return { ...doc, entries, cursor };
}

/** Stored JSON → document; anything unusable is an empty timeline (RULE 13). */
export function parseHistory(text: string | null): HistoryDoc {
  if (!text) return EMPTY_HISTORY;
  const data = readJson(text);
  if (!data || data.v !== HISTORY_VERSION || !Array.isArray(data.entries)) return EMPTY_HISTORY;
  if (!data.entries.every(isEntry)) return EMPTY_HISTORY;
  return { v: HISTORY_VERSION, entries: data.entries, cursor: clampCursor(data.cursor, data.entries.length) };
}

function readJson(text: string): Record<string, unknown> | null {
  try {
    const data: unknown = JSON.parse(text);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
    return data as Record<string, unknown>;
  } catch {
    return null; // corrupt payload: empty timeline, never a crash (RULE 13)
  }
}

function isEntry(value: unknown): value is HistoryEntry {
  const x = asRecord(value);
  return x !== null && hasText(x) && typeof x.at === "number" && isStringList(x.targets)
    && "before" in x && "after" in x && typeof x.v === "number";
}

/** Every field a label/undo tooltip needs, present and typed. */
function hasText(x: Record<string, unknown>): boolean {
  return typeof x.id === "string" && x.id !== "" && typeof x.kind === "string"
    && typeof x.label === "string" && typeof x.tab === "string";
}

function isStringList(value: unknown): boolean {
  return Array.isArray(value) && value.every((t) => typeof t === "string");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function clampCursor(value: unknown, length: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : length - 1;
  return Math.min(length - 1, Math.max(-1, n));
}

/** Ephemeral entries (owner not yet visited after a restart) never persist. */
export function serializeHistory(doc: HistoryDoc): string {
  const kept: HistoryEntry[] = [];
  let cursor = -1;
  doc.entries.forEach((e, i) => {
    if (e.ephemeral) return;
    kept.push(e);
    if (i <= doc.cursor) cursor = kept.length - 1;
  });
  return JSON.stringify({ v: HISTORY_VERSION, entries: kept, cursor });
}

/** Ctrl/Cmd+Z = undo; Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y = redo (request §6). */
export function historyShortcut(ev: {
  key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean;
}): HistoryDirection | null {
  if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return null;
  const key = ev.key.toLowerCase();
  if (key === "z") return ev.shiftKey ? "redo" : "undo";
  return key === "y" && !ev.shiftKey ? "redo" : null;
}
