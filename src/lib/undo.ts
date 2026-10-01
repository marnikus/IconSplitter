// undo.ts — pure global undo timeline, adapted from the sister app's
// UndoStore/UndoService (Process-Images-in-Areana): one history of
// {kind, value} snapshots plus an index; capped, clamped, redo-tail
// truncating, consecutive-duplicate skipping. No IO here (RULE 3).

export interface UndoEntry {
  kind: string; // "decisions" | "select" | "filter" | "sort"
  value: unknown; // snapshot the caller re-applies
}

export interface UndoStack {
  history: UndoEntry[];
  index: number; // -1 = before first entry (baseline applies)
}

export const MAX_HISTORY = 100;

export interface UndoOut {
  kind: string;
  value: unknown | null;
  undone: UndoEntry | null;
  empty: boolean; // frontier: caller restores its baseline
}

export interface StepOut {
  stack: UndoStack;
  out: UndoOut | null;
}

export function emptyStack(): UndoStack {
  return { history: [], index: -1 };
}

/** Enforces the cap and repairs out-of-range indexes (store._clamp). */
export function clampStack(s: UndoStack): UndoStack {
  let history = Array.isArray(s.history) ? s.history : [];
  let index = Number.isInteger(s.index) ? (s.index as number) : -1;
  if (history.length > MAX_HISTORY) {
    const overflow = history.length - MAX_HISTORY;
    history = history.slice(overflow);
    index -= overflow;
  }
  if (history.length === 0) index = -1;
  else if (index >= history.length) index = history.length - 1;
  else if (index < -1) index = -1;
  return { history, index };
}

/** Append a snapshot; truncates redo tail; skips consecutive duplicates. */
export function pushEntry(s: UndoStack, kind: string, value: unknown): UndoStack {
  const entry: UndoEntry = { kind, value };
  let history = s.history.slice(0, s.index + 1);
  const head = history[history.length - 1];
  if (head && sameEntry(head, entry)) return clampStack({ history, index: history.length - 1 });
  history = [...history, entry];
  return clampStack({ history, index: history.length - 1 });
}

function sameEntry(a: UndoEntry, b: UndoEntry): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Step back; at entry 0 returns the empty frontier (baseline restores). */
export function undoOnce(s: UndoStack): StepOut {
  if (s.index < 0 || s.history.length === 0) return { stack: s, out: null };
  if (s.index === 0) {
    return {
      stack: { ...s, index: -1 },
      out: { kind: s.history[0].kind, value: null, undone: s.history[0], empty: true },
    };
  }
  const index = s.index - 1;
  const target = s.history[index];
  return {
    stack: { ...s, index },
    out: { kind: target.kind, value: target.value, undone: s.history[s.index], empty: false },
  };
}

/** Step forward; null at the tail (nothing to redo). */
export function redoOnce(s: UndoStack): StepOut {
  if (s.index >= s.history.length - 1) return { stack: s, out: null };
  const index = s.index + 1;
  const entry = s.history[index];
  return { stack: { ...s, index }, out: { kind: entry.kind, value: entry.value, undone: null, empty: false } };
}

export function serializeUndoStack(s: UndoStack): string {
  return JSON.stringify({ history: s.history, index: s.index });
}

/** Validated load; anything malformed becomes the empty stack (RULE 13). */
export function parseUndoStack(text: string): UndoStack {
  try {
    const d: unknown = JSON.parse(text);
    if (typeof d !== "object" || d === null) return emptyStack();
    const x = d as { history?: unknown; index?: unknown };
    if (!Array.isArray(x.history)) return emptyStack();
    if (!x.history.every(validEntry)) return emptyStack();
    if (!Number.isInteger(x.index)) return emptyStack();
    return clampStack({ history: x.history as UndoEntry[], index: x.index as number });
  } catch {
    return emptyStack();
  }
}

function validEntry(e: unknown): boolean {
  return typeof e === "object" && e !== null && typeof (e as { kind?: unknown }).kind === "string";
}
