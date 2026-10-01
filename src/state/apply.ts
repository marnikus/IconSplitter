// apply.ts — the one way a tracked value changes (RULE 12; design doc §3).
//
// A normal click and an undo/redo both end up here, so there is no second,
// slightly different mutation path that could leave a hidden tab holding a stale
// copy. Every branch validates its value and reports failure instead of
// guessing: the history cursor only moves on a `true` result, which is what
// keeps a failed apply from corrupting the timeline.

import { isRecord } from "../lib/isrecord";
import { parseSheetOpts } from "../lib/exportopts";
import { parseFilter } from "../lib/reviewfilter";
import { parsePrefsValue } from "../lib/reviewprefs";
import { parseSort } from "../lib/reviewsort";
import type { HistoryEntry } from "../lib/history";
import type { SessionSelection } from "../lib/session";
import { applyDecisionPatch, type DecisionPatch } from "../selection/offline";
import { patchV2, patchView, setAppState } from "./appstore";
import { parseSvgPreferences } from "../svg/prefs";
import { setSvgPreferences } from "../svg/prefsstore";
import { applySvgReviewHistory } from "../svg/review";

/** Entry kinds this app records. Anything else is refused, never guessed at. */
export const ENTRY_TYPES = ["decisions", "checked", "view", "prefs", "sheets", "svgPrefs", "svgReview"] as const;

/** Apply one side of an entry (`before` for undo, `after` for redo). */
export async function applyEntry(entry: HistoryEntry, value: unknown): Promise<boolean> {
  switch (entry.type) {
    case "decisions": return applyDecisions(entry.ids, value);
    case "checked": return applyChecked(value);
    case "view": return applyView(value);
    case "prefs": return applyPrefs(value);
    case "sheets": return applySheets(value);
    case "svgPrefs": return applySvgPrefs(value);
    case "svgReview": return applySvgReviewHistory(value);
    default: return false; // an entry from a future schema: refuse, do not guess
  }
}

async function applyDecisions(ids: readonly string[], value: unknown): Promise<boolean> {
  if (!isRecord(value) || !Array.isArray(value.recs)) return false;
  const patch: DecisionPatch = { recs: value.recs as DecisionPatch["recs"] };
  return applyDecisionPatch(ids, patch);
}

interface SelectionPatch {
  ids: string[];
  anchor: string | null;
  active: string | null;
}

function applyChecked(value: unknown): boolean {
  const sel = toSelection(value);
  if (!sel) return false;
  patchV2({ checked: sel.ids, anchorId: sel.anchor });
  patchView({ selectedId: sel.active }); // a row click carries its active row
  return true;
}

/** Entries recorded before the shift anchor existed stored a bare id array. */
function toSelection(value: unknown): SelectionPatch | null {
  const raw: unknown = Array.isArray(value) ? { ids: value } : value;
  if (!isRecord(raw) || !Array.isArray(raw.ids)) return null;
  if (!raw.ids.every((id) => typeof id === "string")) return null;
  return {
    ids: raw.ids as string[],
    anchor: typeof raw.anchor === "string" ? raw.anchor : null,
    active: typeof raw.active === "string" ? raw.active : null,
  };
}

/** Refuse a value that carries nothing usable, so the cursor does not move. */
function applyView(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const patch = viewPatch(value);
  if (Object.keys(patch).length === 0) return false;
  patchView(patch);
  return true;
}

/** Only the keys the entry actually carries — a filter change must not reset zoom. */
function viewPatch(v: Record<string, unknown>): Partial<SessionSelection> {
  const patch: Partial<SessionSelection> = { ...togglePatch(v) };
  if (v.filter !== undefined) patch.filter = parseFilter(v.filter);
  if (v.sort !== undefined) patch.sort = parseSort(v.sort);
  if ("selectedId" in v) patch.selectedId = typeof v.selectedId === "string" ? v.selectedId : null;
  return patch;
}

function togglePatch(v: Record<string, unknown>): Partial<SessionSelection> {
  const patch: Partial<SessionSelection> = {};
  if (typeof v.collapsed === "boolean") patch.collapsed = v.collapsed;
  if (v.zoom === "fit" || v.zoom === "full") patch.zoom = v.zoom;
  if (typeof v.sync === "boolean") patch.sync = v.sync;
  if (typeof v.autoNext === "boolean") patch.autoNext = v.autoNext;
  return patch;
}

function applyPrefs(value: unknown): boolean {
  if (!isRecord(value)) return false;
  setAppState({ prefs: parsePrefsValue(value) });
  return true;
}

function applySheets(value: unknown): boolean {
  if (!isRecord(value)) return false;
  setAppState({ sheets: parseSheetOpts(value) });
  return true;
}

function applySvgPrefs(value: unknown): boolean {
  if (!isRecord(value)) return false;
  setSvgPreferences(parseSvgPreferences(value));
  return true;
}
