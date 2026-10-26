// selectiondelta.ts — the compact, ORDER-PRESERVING history payload for a
// selection gesture.
//
// History used to record the whole checked array twice per gesture (`before.ids`
// and `after.ids`), plus a third copy in `ids`. At 1,000 rows that is ~230 KB
// per click, per arrow key, per checkbox — written into a 100-entry timeline and
// serialized on every gesture. Only the CHANGE matters, so an entry now records
// an index-aware diff instead: runs of ids that left (with their source
// position) and runs that arrived (with their destination position).
//
// Runs, not one object per id: a shift-range or a select-all is ONE run
// (`{ at, ids }`), so the payload is proportional to the change and has no
// per-id `{id,index}` overhead.
//
// Why indices at all: selection order is the request order (RULE 10), so undo
// must put an id back WHERE it was, not at the end. Forward = remove the
// recorded source positions, then insert the runs ascending; the inverse swaps
// the two sides, which restores the exact array.
//
// A payload is applied to the LIVE selection, not to a stored snapshot. When the
// live array still matches the recorded base the apply is index-exact; when it
// moved on (another tab, a rescan), the apply degrades to id-based
// removal/insertion so the ids are still right and nothing is duplicated. A
// structurally invalid payload is refused (null) so the history cursor never
// moves on a guess (RULE 13).

import { isRecord } from "./isrecord";
import type { RowSelection } from "./reviewselect";

/** Consecutive ids at one position: `ids[k]` sits/lands at `at + k`. */
export interface IdRun {
  at: number;
  ids: string[];
}

/** An ordered edit: removals (source positions) then insertions (result positions). */
export interface SelectionOp {
  removed: IdRun[];
  added: IdRun[];
}

/** One side of an entry: the edit that reaches it, plus where focus landed. */
export interface SelectionPayload {
  sel: SelectionOp;
  anchor: string | null;
  active: string | null;
}

/** Ids named in a history entry are a log label, not a second copy of the list. */
export const MAX_TOUCHED_IDS = 24;

/** Collect the ids at ascending source indices that are absent from `other`. */
function runsOf(ids: readonly string[], other: ReadonlySet<string>): IdRun[] {
  const runs: IdRun[] = [];
  let open: IdRun | null = null;
  for (let i = 0; i < ids.length; i += 1) {
    if (other.has(ids[i])) { open = null; continue; }
    if (open !== null && open.at + open.ids.length === i) open.ids.push(ids[i]);
    else { open = { at: i, ids: [ids[i]] }; runs.push(open); }
  }
  return runs;
}

export function diffSelection(before: readonly string[], after: readonly string[]): SelectionOp {
  return { removed: runsOf(before, new Set(after)), added: runsOf(after, new Set(before)) };
}

/** The same operation seen from the other side: applied to the result it undoes. */
export function invertSelectionOp(op: SelectionOp): SelectionOp {
  return { removed: op.added, added: op.removed };
}

const isRunList = (value: unknown): value is IdRun[] => Array.isArray(value)
  && value.every((e) => isRecord(e) && Number.isInteger(e.at) && (e.at as number) >= 0
    && Array.isArray(e.ids) && e.ids.length > 0 && e.ids.every((id) => typeof id === "string"));

const byPosition = (a: IdRun, b: IdRun): number => a.at - b.at;

/** Source indices a run list removes exactly; `exact` is false on drift. */
function exactRemovals(ids: readonly string[], runs: IdRun[]): { at: Set<number>; exact: boolean } {
  const at = new Set<number>();
  let exact = true;
  for (const run of runs) {
    for (let k = 0; k < run.ids.length; k += 1) {
      if (ids[run.at + k] === run.ids[k]) at.add(run.at + k);
      else exact = false;
    }
  }
  return { at, exact };
}

/** Remove the op's runs, by position when it still fits and by id otherwise. */
function removeRuns(ids: readonly string[], op: SelectionOp): string[] {
  const { at, exact } = exactRemovals(ids, op.removed);
  if (exact) return ids.filter((_, i) => !at.has(i));
  return ids.filter((id) => !op.removed.some((run) => run.ids.includes(id)));
}

/** Insert the added runs ascending; an id already present is never duplicated. */
function addRuns(ids: string[], runs: IdRun[]): void {
  const present = new Set(ids);
  for (const run of [...runs].sort(byPosition)) {
    const fresh = run.ids.filter((id) => !present.has(id));
    if (fresh.length === 0) continue;
    ids.splice(Math.min(Math.max(run.at, 0), ids.length), 0, ...fresh);
    for (const id of fresh) present.add(id);
  }
}

/**
 * Apply one op to a selection array. Exact when the recorded positions still
 * match the live array; otherwise by id (see the module note). Returns null only
 * for a payload that is not a selection op at all.
 */
export function applySelectionOp(ids: readonly string[], op: SelectionOp): string[] | null {
  if (!isRecord(op) || !isRunList(op.removed) || !isRunList(op.added)) return null;
  const out = removeRuns(ids, op);
  addRuns(out, op.added);
  return out;
}

/** One gesture's payloads plus the ids a history entry may name. */
export interface GesturePayload {
  before: SelectionPayload;
  after: SelectionPayload;
  ids: string[];
}

/** The touched ids in the same order `touchedIds` produces, from the op alone. */
function touchedFromOp(op: SelectionOp, max: number): string[] {
  const out: string[] = [];
  for (const run of op.removed) for (const id of run.ids) { if (out.length < max) out.push(id); }
  for (const run of op.added) for (const id of run.ids) { if (out.length < max) out.push(id); }
  return out;
}

/**
 * Both directions of one gesture, ready for `entry.before` / `entry.after`, plus
 * the capped `ids` label. ONE diff: the before-side is its exact inverse, so a
 * 5,000-row list is scanned once per gesture, not twice.
 */
export function selectionPayloads(before: RowSelection, after: RowSelection, max = MAX_TOUCHED_IDS): GesturePayload {
  const forward = diffSelection(before.checked, after.checked);
  return {
    before: { sel: invertSelectionOp(forward), anchor: before.anchor, active: before.active },
    after: { sel: forward, anchor: after.anchor, active: after.active },
    ids: touchedFromOp(forward, max),
  };
}

/** Read a payload; an old absolute `{ids, anchor, active}` value is not one. */
export function readSelectionPayload(value: unknown): SelectionPayload | null {
  if (!isRecord(value) || !isRecord(value.sel)) return null;
  const sel = value.sel;
  if (!isRunList(sel.removed) || !isRunList(sel.added)) return null;
  if (!(value.anchor === null || typeof value.anchor === "string")) return null;
  if (!(value.active === null || typeof value.active === "string")) return null;
  const copy = (runs: IdRun[]) => runs.map((run) => ({ at: run.at, ids: [...run.ids] }));
  return { sel: { removed: copy(sel.removed), added: copy(sel.added) }, anchor: value.anchor, active: value.active };
}

/** Apply a payload to the live selection; null means "refuse, do not guess". */
export function applySelectionPayload(value: unknown, current: readonly string[]): string[] | null {
  const payload = readSelectionPayload(value);
  return payload === null ? null : applySelectionOp(current, payload.sel);
}

/**
 * The ids a history entry names in `ids` — the rows that actually changed, in a
 * deterministic order, capped so a select-all cannot smuggle the whole list back
 * into the entry (the delta already carries the truth).
 */
export function touchedIds(before: readonly string[], after: readonly string[], max = MAX_TOUCHED_IDS): string[] {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const out: string[] = [];
  for (const id of before) if (!afterSet.has(id) && out.length < max) out.push(id);
  for (const id of after) if (!beforeSet.has(id) && out.length < max) out.push(id);
  return out;
}
