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
import { applySvgReviewPatch, type SvgReviewPatch } from "../svg/reviewundo";
import { applyBatchReviewPatch, type BatchReviewPatch } from "../batch/reviewundo";
import { applyUploadSettingsPatch, toUploadSettingsPatch } from "../upload/uploadundo";
import { patchBatch, patchV2, patchView, setAppState } from "./appstore";

/** Entry kinds this app records. Anything else is refused, never guessed at. */
export const ENTRY_TYPES = ["decisions", "checked", "batchChecked", "view", "prefs", "sheets", "svgReview", "batchReview", "uploadSettings"] as const;

/** Apply one side of an entry (`before` for undo, `after` for redo). */
export async function applyEntry(entry: HistoryEntry, value: unknown): Promise<boolean> {
  switch (entry.type) {
    case "decisions": return applyDecisions(entry.ids, value);
    case "checked": return applyChecked(value);
    case "batchChecked": return applyBatchChecked(value);
    case "view": return applyView(value);
    case "prefs": return applyPrefs(value);
    case "sheets": return applySheets(value);
    case "svgReview":
    case "batchReview": return applyReviewEntry(entry.type, value);
    case "uploadSettings": return applyUploads(value);
    default: return false; // an entry from a future schema: refuse, do not guess
  }
}

/** Both review kinds share one shape: validate the payload, patch the store. */
async function applyReviewEntry(type: "svgReview" | "batchReview", value: unknown): Promise<boolean> {
  return type === "svgReview"
    ? applySvgReviewPatch(toReviewPatch(value))
    : applyBatchReviewPatch(toBatchReviewPatch(value));
}

/** Refuses a payload that is not an upload-settings patch (RULE 13). */
function applyUploads(value: unknown): boolean {
  const patch = toUploadSettingsPatch(value);
  return patch === null ? false : applyUploadSettingsPatch(patch);
}

/** Refuses a payload that is not a list of batch review decisions (RULE 13). */
function toBatchReviewPatch(value: unknown): BatchReviewPatch {
  if (!isRecord(value) || !Array.isArray(value.recs)) return { recs: [] };
  return { recs: value.recs.flatMap((r) => (isBatchRec(r) ? [r] : [])) };
}

function isBatchRec(value: unknown): value is BatchReviewPatch["recs"][number] {
  if (!isRecord(value)) return false;
  return typeof value.relPath === "string" && typeof value.dirPath === "string" && typeof value.base === "string"
    && (value.review === "pending" || value.review === "approved" || value.review === "declined");
}

/** Refuses a payload that is not a list of version decisions (RULE 13). */
function toReviewPatch(value: unknown): SvgReviewPatch {
  if (!isRecord(value) || !Array.isArray(value.recs)) return { recs: [] };
  const recs = value.recs.flatMap((r) => (isReviewRec(r) ? [r] : []));
  return { recs };
}

function isReviewRec(value: unknown): value is SvgReviewPatch["recs"][number] {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && Number.isInteger(value.version)
    && (value.review === "pending" || value.review === "approved" || value.review === "declined");
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

function applyBatchChecked(value: unknown): boolean {
  const sel = toSelection(value);
  if (!sel) return false;
  patchBatch({ checked: sel.ids, anchorId: sel.anchor, activeId: sel.active });
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
