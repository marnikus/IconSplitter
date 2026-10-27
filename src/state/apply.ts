// apply.ts — the one way a tracked value changes (RULE 12; design doc §3).
//
// A normal click and an undo/redo both end up here, so there is no second,
// slightly different mutation path that could leave a hidden tab holding a stale
// copy. Every branch validates its value and reports failure instead of
// guessing: the history cursor only moves on a `true` result, which is what
// keeps a failed apply from corrupting the timeline.

import { applyStockSelection } from "../stockupload/selection";
import { isRecord } from "../lib/isrecord";
import { parseSheetOpts } from "../lib/exportopts";
import { parseFilter } from "../lib/reviewfilter";
import { parsePrefsValue } from "../lib/reviewprefs";
import { parseSort } from "../lib/reviewsort";
import type { HistoryEntry } from "../lib/history";
import { applySelectionOp, readSelectionPayload } from "../lib/selectiondelta";
import type { SessionSelection } from "../lib/session";
import { applyDecisionPatch, type DecisionPatch } from "../selection/offline";
import { applySvgReviewPatch, type SvgReviewPatch } from "../svg/reviewundo";
import { applyUploadSettingsPatch, toUploadSettingsPatch } from "../upload/uploadundo";
import { applyRowBadgeState } from "../upload/rowbadgeundo";
import { getAppState, patchBatch, patchSvg, patchUpload, patchV2Selection, patchView, setAppState } from "./appstore";
import { selectionTargetsKnown, type CheckableList } from "./listtargets";

/** Entry kinds this app records. Anything else is refused, never guessed at. */
export const ENTRY_TYPES = ["decisions", "checked", "batchChecked", "svgChecked", "uploadChecked", "view", "prefs", "sheets", "svgReview", "uploadSettings", "uploadRowBadges", "stockSelection"] as const;

/** Apply one side of an entry (`before` for undo, `after` for redo). */
export async function applyEntry(entry: HistoryEntry, value: unknown): Promise<boolean> {
  const selection = applySelectionEntry(entry, value);
  if (selection !== null) return selection;
  return applyDomainEntry(entry, value);
}

function applyDomainEntry(entry: HistoryEntry, value: unknown): boolean | Promise<boolean> {
  switch (entry.type) {
    case "stockSelection": return applyStockSelection(value);
    case "decisions": return applyDecisions(entry.ids, value);
    case "view": return applyView(value);
    case "prefs": return applyPrefs(value);
    case "sheets": return applySheets(value);
    case "svgReview": return applySvgReviewPatch(toReviewPatch(value));
    case "uploadSettings": return applyUploadSettings(value);
    case "uploadRowBadges": return applyRowBadgeState(value);
    default: return false; // an entry from a future schema: refuse, do not guess
  }
}

function applyUploadSettings(value: unknown): boolean {
  const patch = toUploadSettingsPatch(value);
  return patch === null ? false : applyUploadSettingsPatch(patch);
}

/** Route checked state to its tab before considering domain-specific edits. */
function applySelectionEntry(entry: HistoryEntry, value: unknown): boolean | null {
  switch (entry.type) {
    case "checked": return entry.origin === "generateSvg" ? applyLegacySvgChecked(value) : applyChecked(value);
    case "batchChecked": return applyBatchChecked(value);
    case "svgChecked": return applyTabChecked(value, () => getAppState().svg.checked, patchSvg, "generateSvg");
    case "uploadChecked": return applyTabChecked(value, () => getAppState().upload.checked, patchUpload, "upload");
    default: return null;
  }
}

/** Refuses a payload that is not a list of version decisions (RULE 13). */
function toReviewPatch(value: unknown): SvgReviewPatch {
  if (!isRecord(value) || !Array.isArray(value.recs)) return { recs: [] };
  const recs = value.recs.flatMap((r) => (isReviewRec(r) ? [r] : []));
  return { recs };
}

/**
 * One review record. A `version` key is ACCEPTED and ignored: entries recorded
 * before the status became the item's (2026-10-20) still name one.
 */
function isReviewRec(value: unknown): value is SvgReviewPatch["recs"][number] {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && (value.review === "pending" || value.review === "approved" || value.review === "declined" || value.review === "needs-review");
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
  const sel = selectionValue(value, getAppState().v2.checked);
  if (!sel) return false;
  patchV2Selection({ checked: sel.ids, anchorId: sel.anchor, activeId: sel.active });
  return true;
}

function applyBatchChecked(value: unknown): boolean {
  const sel = selectionValue(value, getAppState().batch.checked);
  if (!sel) return false;
  patchBatch({ checked: sel.ids, anchorId: sel.anchor, activeId: sel.active });
  return true;
}

/** SVG entries saved before svgChecked existed carried only the checked ids. */
function applyLegacySvgChecked(value: unknown): boolean {
  const sel = toSelection(value);
  if (!sel) return false;
  const svg = getAppState().svg;
  if (!selectionTargetsKnown("generateSvg", { checked: sel.ids, active: svg.activeId, anchor: svg.anchorId })) return false;
  patchSvg({ checked: sel.ids });
  return true;
}

function applyTabChecked(
  value: unknown,
  current: () => string[],
  patch: (next: { checked: string[]; anchorId: string | null; activeId: string | null }) => void,
  tab: CheckableList,
): boolean {
  if (!isRecord(value)) return false;
  if (!(value.anchor === null || typeof value.anchor === "string")) return false;
  if (!(value.active === null || typeof value.active === "string")) return false;
  const sel = selectionValue(value, current());
  if (!sel) return false;
  if (!selectionTargetsKnown(tab, { checked: sel.ids, anchor: sel.anchor, active: sel.active })) return false;
  patch({ checked: sel.ids, anchorId: sel.anchor, activeId: sel.active });
  return true;
}

/**
 * One entry side -> the selection it produces. A version-2 payload is a diff
 * applied to the live selection (lib/selectiondelta); a version-1 payload is the
 * recorded whole array. Both are validated; anything else leaves the cursor.
 */
function selectionValue(value: unknown, current: string[]): SelectionPatch | null {
  const delta = readSelectionPayload(value);
  if (delta !== null) {
    const ids = applySelectionOp(current, delta.sel);
    return ids === null ? null : { ids, anchor: delta.anchor, active: delta.active };
  }
  return toSelection(value);
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
