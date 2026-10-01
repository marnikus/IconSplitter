// selectioncommands.ts — the canonical mutation path for review state
// (request §3/§9): every user command goes through one small function that
// writes the store, records EXACTLY one history entry (bulk = one entry) and
// persists the decision file. Local (navigation/reporting) state has its own
// unrecorded `patchCommand`.

import { entry, type HistoryEntry } from "../lib/history";
import { CHECKS_KIND, REVIEW_KIND, VIEW_KIND } from "../history/kinds";
import { recordEntry } from "../history/historybus";
import { bulkMessage } from "../lib/reviewbulk";
import { resetMessage } from "../lib/reviewreset";
import { decisionStates } from "../lib/reviewsnapshot";
import { bulkCheckLabel, checkLabel, decisionLabel, filterLabel, sortLabel, viewLabel } from "../lib/reviewlabels";
import { clampThumb } from "../lib/reviewprefs";
import type { Decision, ListFilter } from "../lib/reviewfilter";
import type { SortState } from "../lib/reviewsort";
import { nextPendingId, withBulkDecision, withChecked, withDecision, withResetDecision, type SelState, type ViewPatch } from "./state";
import { flushDecisions, getSelState, mutSel, setSel } from "./selectionstore";

export { CHECKS_KIND, REVIEW_KIND, VIEW_KIND };

const TAB = "selection";

/** Local reporting state only — never reversible, never persisted. */
export function patchCommand(part: Partial<SelState>): void {
  mutSel((p) => ({ ...p, ...part }));
}

export function sayCommand(msg: string, err = false): void {
  patchCommand({ toast: { msg, err } });
}

export function selectCommand(id: string): void {
  patchCommand({ selectedId: id });
}

/* ── review decisions (approve / decline / reset) ───────────────────────── */

/** Approve/decline one pair; auto-next rolls the active row (request §2). */
export function decideCommand(id: string, decision: Decision, nowIso: string): boolean {
  const prev = getSelState();
  const merged = withDecision(prev, id, decision, nowIso);
  if (merged === prev) return false;
  const rolled = merged.autoNext ? nextPendingId(merged.pairs, id) : null;
  const next = rolled ? { ...merged, selectedId: rolled } : merged;
  commit(next, reviewEntry({ decision, ids: [id], prev, next, subject: subjectOf(prev, id) }));
  void flushDecisions();
  return true;
}

/** One bulk decision: one transition, one entry, one write, ONE toast. */
export async function decideBulkCommand(ids: string[], decision: Decision, nowIso: string): Promise<number> {
  const prev = getSelState();
  const out = withBulkDecision(prev, ids, decision, nowIso);
  if (out.applied.length === 0) {
    sayCommand(bulkMessage({ decision, applied: 0, skipped: out.skipped.length, saved: true }), true);
    return 0;
  }
  commit(out.state, reviewEntry({ decision, ids: out.applied, prev, next: out.state }));
  const saved = await flushDecisions();
  sayCommand(bulkMessage({ decision, applied: out.applied.length, skipped: out.skipped.length, saved }), !saved);
  return out.applied.length;
}

/** Reset approved/declined items back to pending — one item or a whole scope. */
export async function resetCommand(ids: string[]): Promise<number> {
  const prev = getSelState();
  const out = withResetDecision(prev, ids);
  if (out.applied.length === 0) {
    sayCommand(resetMessage({ applied: 0, skipped: out.skipped.length, saved: true }), true);
    return 0;
  }
  commit(out.state, reviewEntry({ decision: "pending", ids: out.applied, prev, next: out.state, subject: subjectOf(prev, ids[0]) }));
  const saved = await flushDecisions();
  sayCommand(resetMessage({ applied: out.applied.length, skipped: out.skipped.length, saved }), !saved);
  return out.applied.length;
}

/* ── checkbox selection ─────────────────────────────────────────────────── */

export function toggleCheckCommand(id: string): void {
  const prev = getSelState();
  const on = !prev.checked.includes(id);
  const ids = on ? [...prev.checked, id] : prev.checked.filter((x) => x !== id);
  commitChecks(prev, ids, checkLabel(on, subjectOf(prev, id)));
}

export function checkVisibleCommand(visibleIds: readonly string[]): void {
  const prev = getSelState();
  const ids = [...new Set([...prev.checked, ...visibleIds])];
  commitChecks(prev, ids, bulkCheckLabel("visible", true, visibleIds.length));
}

export function uncheckAllCommand(): void {
  const prev = getSelState();
  commitChecks(prev, [], bulkCheckLabel("all", false, prev.checked.length));
}

function commitChecks(prev: SelState, ids: readonly string[], label: string): void {
  const next = withChecked(prev, ids);
  if (next.checked.join("\u0000") === prev.checked.join("\u0000")) return; // no-op, no entry
  commit(next, {
    kind: CHECKS_KIND, label, targets: [...next.checked], before: { checked: prev.checked }, after: { checked: next.checked },
  });
}

/* ── persisted view settings ────────────────────────────────────────────── */

export function setFilterCommand(filter: ListFilter): void {
  setViewCommand({ filter }, filterLabel(filter));
}

export function setSortCommand(sort: SortState): void {
  setViewCommand({ sort }, sortLabel(sort));
}

export function setModeCommand(mode: "list" | "compare"): void {
  setViewCommand({ prefs: { ...getSelState().prefs, mode } }, viewLabel("Layout", mode === "list" ? "list review" : "comparison"));
}

export function setThumbCommand(px: number): void {
  const prefs = { ...getSelState().prefs, thumbHeight: clampThumb(px) };
  if (prefs.thumbHeight === getSelState().prefs.thumbHeight) return;
  setViewCommand({ prefs }, viewLabel("Zoom", `${prefs.thumbHeight} px`), "thumb");
}

/** One persisted view value; `coalesce` merges a drag/typing gesture. */
export function setViewCommand(patch: ViewPatch, label: string, coalesce?: string): void {
  const prev = getSelState();
  const next = { ...prev, ...patch };
  if (isNoop(prev, patch)) return; // a mount effect re-applying a value is not an action

  commit(next, {
    kind: VIEW_KIND, label, targets: [], before: beforeOf(prev, patch), after: beforeOf(next, patch), coalesce,
  });
}

/* ── helpers ────────────────────────────────────────────────────────────── */

function commit(next: SelState, e: Omit<HistoryEntry, "id" | "at" | "tab" | "v"> | HistoryEntry): void {
  setSel(next);
  recordEntry(entry({ tab: TAB, ...e }));
}

/** Minimal before/after payload: only the fields this command touched. */
function beforeOf(s: SelState, patch: ViewPatch): ViewPatch {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) out[key] = s[key as keyof ViewPatch];
  return out as ViewPatch;
}

interface ReviewEntryInput {
  decision: Decision;
  ids: string[];
  prev: SelState;
  next: SelState;
  subject?: string;
}

function reviewEntry(i: ReviewEntryInput): Omit<HistoryEntry, "id" | "at" | "tab" | "v"> {
  const single = i.ids.length === 1 && i.subject !== undefined;
  return {
    kind: REVIEW_KIND, label: decisionLabel(i.decision, i.ids.length, single ? i.subject : undefined),
    targets: [...i.ids],
    before: decisionStates(i.prev.pairs, i.ids), after: decisionStates(i.next.pairs, i.ids),
  };
}

function subjectOf(s: SelState, id: string): string {
  return s.pairs.find((p) => p.pairId === id)?.base ?? id;
}

/** True when the patch would not change anything (so it is not a user action). */
function isNoop(s: SelState, patch: ViewPatch): boolean {
  return Object.entries(patch).every(([k, v]) => sameValue(s[k as keyof SelState], v));
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
