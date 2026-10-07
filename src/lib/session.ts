// session.ts — the restart snapshot (RULE 8/13): everything the app must put
// back the way the user left it, and nothing it must not.
//
// Scope is decided by "one owner per value". Already persisted elsewhere and
// therefore deliberately absent here: the last batch preset (batch/store
// saveLastName), the preset's ignore list (lib/presets) and the V2 view mode +
// thumbnail zoom (selectionv2/prefsstore). Duplicating them would create two
// writers that can disagree.
//
// Also absent: root folder handles (IndexedDB, owned by batch/store) and
// decisions (review-decisions.json, owned by selection/reviewstore).

import { isRecord } from "./isrecord";
import { DEFAULT_SHEET_OPTS, parseSheetOpts, type SheetOpts } from "./exportopts";
import { ALL_FILTER, parseFilter, type ListFilter } from "./reviewfilter";
import { DEFAULT_SORT, parseSort, type SortState } from "./reviewsort";
import type { ZoomMode } from "./reviewprefs";

export const SESSION_VERSION = 1;

export type TabId = "sheets" | "batch" | "selection" | "selectionV2" | "generateSvg" | "svgUpload";

export const TAB_IDS: readonly TabId[] = ["sheets", "batch", "selection", "selectionV2", "generateSvg", "svgUpload"];

/** Review list state shared by the Selection and Selection V2 tabs. */
export interface SessionSelection {
  filter: ListFilter;
  sort: SortState;
  /** Stable pair id — never a row index (I-10). */
  selectedId: string | null;
  collapsed: boolean;
  zoom: ZoomMode;
  sync: boolean;
  autoNext: boolean;
}

/** What only the V2 layout adds on top of the shared review state. */
export interface SessionV2 {
  checked: string[];
  scrollY: number;
  /** Shift+click anchor — the row the next range starts from. */
  anchorId: string | null;
}

/** What only the Generate SVG tab adds: its own selection and active row. */
export interface SessionSvg {
  checked: string[];
  /** Stable source id of the active row — never a list index. */
  activeId: string | null;
}

/** What only the SVG-to-upload tab adds: its own checkbox selection. */
export interface SessionUpload {
  checked: string[];
}

export interface SessionState {
  tab: TabId;
  sheets: SheetOpts;
  selection: SessionSelection;
  selectionV2: SessionV2;
  svg: SessionSvg;
  upload: SessionUpload;
}

export const DEFAULT_SELECTION: SessionSelection = {
  filter: ALL_FILTER, sort: DEFAULT_SORT, selectedId: null,
  collapsed: false, zoom: "fit", sync: true, autoNext: true,
};

export const DEFAULT_SVG: SessionSvg = { checked: [], activeId: null };

export const DEFAULT_UPLOAD: SessionUpload = { checked: [] };

export const DEFAULT_SESSION: SessionState = {
  tab: "sheets", sheets: DEFAULT_SHEET_OPTS,
  selection: DEFAULT_SELECTION, selectionV2: { checked: [], scrollY: 0, anchorId: null },
  svg: DEFAULT_SVG, upload: DEFAULT_UPLOAD,
};

/**
 * Stored snapshot → session. Validated field by field: an unknown tab becomes
 * the default tab rather than a blank screen, and a corrupt payload costs one
 * ignored load, never a broken startup (RULE 13).
 */
export function parseSession(text: string | null): SessionState {
  if (!text) return DEFAULT_SESSION;
  try {
    return toSession(JSON.parse(text));
  } catch {
    return DEFAULT_SESSION;
  }
}

export function serializeSession(s: SessionState, nowIso: string): string {
  return JSON.stringify({ v: SESSION_VERSION, savedAt: nowIso, ...s });
}

/**
 * Drop ids a rescan removed, so a restored selection can never point at a pair
 * that no longer exists (stale targets must not crash or be re-decided). An
 * empty known set means "nothing scanned yet" and leaves the restore untouched.
 */
export function pruneIds(ids: readonly string[], knownIds: ReadonlySet<string>): string[] {
  if (knownIds.size === 0) return [...ids];
  return ids.filter((id) => knownIds.has(id));
}

function toSession(raw: unknown): SessionState {
  if (!isRecord(raw) || raw.v !== SESSION_VERSION) return DEFAULT_SESSION;
  return {
    tab: TAB_IDS.includes(raw.tab as TabId) ? (raw.tab as TabId) : DEFAULT_SESSION.tab,
    sheets: parseSheetOpts(raw.sheets),
    selection: parseSelection(raw.selection),
    selectionV2: parseV2(raw.selectionV2),
    svg: parseSvgSlice(raw.svg),
    upload: parseUploadSlice(raw.upload),
  };
}

function parseUploadSlice(raw: unknown): SessionUpload {
  if (!isRecord(raw) || !Array.isArray(raw.checked)) return DEFAULT_UPLOAD;
  return { checked: raw.checked.filter((id): id is string => typeof id === "string") };
}

function parseSvgSlice(raw: unknown): SessionSvg {
  if (!isRecord(raw) || !Array.isArray(raw.checked)) return DEFAULT_SVG;
  return {
    checked: raw.checked.filter((id): id is string => typeof id === "string"),
    activeId: typeof raw.activeId === "string" ? raw.activeId : null,
  };
}

function parseSelection(raw: unknown): SessionSelection {
  if (!isRecord(raw)) return DEFAULT_SELECTION;
  return {
    filter: parseFilter(raw.filter),
    sort: parseSort(raw.sort),
    selectedId: typeof raw.selectedId === "string" ? raw.selectedId : null,
    collapsed: raw.collapsed === true,
    zoom: raw.zoom === "full" ? "full" : "fit",
    sync: raw.sync !== false,
    autoNext: raw.autoNext !== false,
  };
}

function parseV2(raw: unknown): SessionV2 {
  if (!isRecord(raw)) return DEFAULT_SESSION.selectionV2;
  const scroll = raw.scrollY;
  return {
    checked: Array.isArray(raw.checked) ? raw.checked.filter((id): id is string => typeof id === "string") : [],
    scrollY: typeof scroll === "number" && Number.isFinite(scroll) && scroll > 0 ? scroll : 0,
    anchorId: typeof raw.anchorId === "string" ? raw.anchorId : null,
  };
}
