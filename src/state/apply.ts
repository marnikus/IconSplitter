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
import { applySelectionOp, readSelectionPayload } from "../lib/selectiondelta";
import type { SessionSelection } from "../lib/session";
import { applyDecisionPatch, type DecisionPatch } from "../selection/offline";
import { applySvgReviewPatch, type SvgReviewPatch } from "../svg/reviewundo";
import { isReview } from "../lib/svgmodel";
import { applySvgEdit } from "../svg/svgedit";
import { applyUploadSettingsPatch, toUploadSettingsPatch } from "../upload/uploadundo";
import { applyRowBadgeState } from "../upload/rowbadgeundo";
import type { SessionBuilder } from "../lib/session";
import { getAppState, patchBatch, patchBuilder, patchStockUpload, patchSvg, patchUpload, patchV2Selection, patchView, setAppState } from "./appstore";
import { parseBuilderConfig } from "../lib/builder/config";
import { selectionTargetsKnown, type CheckableList } from "./listtargets";

/** Entry kinds this app records. Anything else is refused, never guessed at. */
export const ENTRY_TYPES = [
  "decisions", "checked", "batchChecked", "svgChecked", "uploadChecked", "stockUploadChecked",
  "view", "prefs", "sheets", "svgReview", "uploadSettings", "uploadRowBadges", "svgEdit",
  "builderConfig", "builderSelection", "builderSeed",
] as const;

/** Apply one side of an entry (`before` for undo, `after` for redo). */
export async function applyEntry(entry: HistoryEntry, value: unknown): Promise<boolean> {
  const selection = applySelectionEntry(entry, value);
  if (selection !== null) return selection;
  return applyDomainEntry(entry, value);
}

function applyDomainEntry(entry: HistoryEntry, value: unknown): boolean | Promise<boolean> {
  switch (entry.type) {
    case "decisions": return applyDecisions(entry.ids, value);
    case "view": return applyView(value);
    case "prefs": return applyPrefs(value);
    case "sheets": return applySheets(value);
    case "svgReview": return applySvgReviewPatch(toReviewPatch(value));
    case "svgEdit": return applySvgEdit(value);
    case "uploadSettings": return applyUploadSettings(value);
    case "uploadRowBadges": return applyRowBadgeState(value);
    default: return applyBuilderEntry(entry.type, value);
  }
}

/** The builder's three kinds, kept together so the domain switch stays small. */
function applyBuilderEntry(type: string, value: unknown): boolean {
  if (type === "builderConfig") return applyBuilderConfig(value);
  if (type === "builderSelection") return applyBuilderSelection(value);
  if (type === "builderSeed") return applyBuilderSeed(value);
  return false; // an entry from a future schema: refuse, do not guess
}

/** The sheet design: a value that is not a config is refused, not guessed. */
export function applyBuilderConfig(value: unknown): boolean {
  if (!isRecord(value)) return false;
  patchBuilder({ config: parseBuilderConfig(value) });
  return true;
}

/** Cell-order slots, locks and seed — the selection half of the sheet. */
export function applyBuilderSelection(value: unknown): boolean {
  const patch = toBuilderSelection(value);
  return patch === null ? false : (patchBuilder(patch), true);
}

/** A positive finite seed; 0 or junk is refused (0 would re-seed). */
export function applyBuilderSeed(value: unknown): boolean {
  if (!isRecord(value) || typeof value.seed !== "number" || !Number.isFinite(value.seed) || value.seed <= 0) return false;
  patchBuilder({ seed: Math.round(value.seed) });
  return true;
}

/** A selection patch, or null when the payload carries nothing readable. */
export function toBuilderSelection(value: unknown): Partial<SessionBuilder> | null {
  if (!isRecord(value)) return null;
  const patch: Partial<SessionBuilder> = {};
  if (Array.isArray(value.slots)) patch.slots = value.slots.map((id) => (typeof id === "string" && id !== "" ? id : null));
  if (Array.isArray(value.locked)) patch.locked = value.locked.filter((id): id is string => typeof id === "string");
  if (typeof value.seed === "number" && Number.isFinite(value.seed) && value.seed > 0) patch.seed = Math.round(value.seed);
  if (isRecord(value.recipe)) patch.recipe = { ...getAppState().builder.recipe, ...recipePatch(value.recipe) };
  return Object.keys(patch).length === 0 ? null : patch;
}

/** The recipe fields the payload actually carries. */
function recipePatch(r: Record<string, unknown>): Partial<SessionBuilder["recipe"]> {
  const patch: Partial<SessionBuilder["recipe"]> = {};
  if (r.mode === "similar" || r.mode === "random" || r.mode === "filtered") patch.mode = r.mode;
  if (typeof r.threshold === "number" && Number.isFinite(r.threshold)) patch.threshold = Math.max(0, Math.min(100, Math.round(r.threshold)));
  if (typeof r.folder === "string") patch.folder = r.folder;
  if (typeof r.tag === "string") patch.tag = r.tag;
  return patch;
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
    case "stockUploadChecked": return applyTabChecked(value, () => getAppState().stockUpload.checked, patchStockUpload, "stockUpload");
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
  return typeof value.id === "string" && isReview(value.review);
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
