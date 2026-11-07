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
// decisions (pair sidecars, owned by selection/pairstore; legacy fallback read-only).

import { isRecord } from "./isrecord";
import { DEFAULT_SHEET_OPTS, parseSheetOpts, type SheetOpts } from "./exportopts";
import { ALL_FILTER, parseFilter, type ListFilter } from "./reviewfilter";
import { DEFAULT_SORT, parseSort, type SortState } from "./reviewsort";
import type { ZoomMode } from "./reviewprefs";

export const SESSION_VERSION = 1;

export type TabId =
  | "sheets" | "batch" | "selectionV2" | "generateSvg" | "upload" | "builder" | "stockUpload";

export const TAB_IDS: readonly TabId[] = [
  "sheets", "batch", "selectionV2", "generateSvg", "upload", "builder", "stockUpload",
];

/** Selection V2 review state; the JSON slice name stays compatible with saved sessions. */
export interface SessionSelection {
  filter: ListFilter;
  sort: SortState;
  /** Stable pair id — never a row index (I-10). */
  selectedId: string | null;
  zoom: ZoomMode;
  sync: boolean;
  autoNext: boolean;
}

/** Selection V2 checkbox and scroll state. */
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
  anchorId: string | null;
}

/** What only the SVG to upload tab adds: its own selection and active row. */
export interface SessionUpload {
  checked: string[];
  /** Stable pair id of the active row — never a list index. */
  activeId: string | null;
  anchorId: string | null;
}

/**
 * What only the SVG builder tab adds: the composed sheet. `slots` is the sheet in
 * CELL ORDER (index 0 is the first cell) and null is a real, honest hole — a flat
 * id list would silently reflow the sheet when the column count changes.
 * `recipe` is the selection recipe that produced (or would re-produce) it.
 */
export interface SessionBuilder {
  slots: (string | null)[];
  /** Icon ids pinned across re-rolls and cell-count changes. */
  locked: string[];
  /** Deterministic selection seed — the same seed reproduces the same sheet. */
  seed: number;
  recipe: SessionBuilderRecipe;
}

export interface SessionBuilderRecipe {
  mode: "similar" | "random" | "filtered";
  /** Similar mode: the minimum tag-match percentage. */
  threshold: number;
  /** Filtered mode: a folder path ("" = all folders). */
  folder: string;
  /** Filtered mode: one tag ("" = all tags). */
  tag: string;
}

/** What only the Upload (stock FTPS) tab adds: its own selection and active row. */
export interface SessionStockUpload {
  checked: string[];
  activeId: string | null;
  anchorId: string | null;
}

/** What only the Batch folders tab adds: its own selection, active row and anchor. */
export interface SessionBatch {
  checked: string[];
  /** Stable relPath of the active row — never a list index. */
  activeId: string | null;
  /** Shift+click anchor — the row the next range starts from. */
  anchorId: string | null;
}

export interface SessionState {
  tab: TabId;
  sheets: SheetOpts;
  selection: SessionSelection;
  selectionV2: SessionV2;
  svg: SessionSvg;
  upload: SessionUpload;
  /** Additive: a session saved by a build that predates the tab has no `builder`. */
  builder?: SessionBuilder;
  stockUpload?: SessionStockUpload;
  batch: SessionBatch;
}

export const DEFAULT_SELECTION: SessionSelection = {
  filter: ALL_FILTER, sort: DEFAULT_SORT, selectedId: null,
  zoom: "fit", sync: true, autoNext: true,
};

export const DEFAULT_SVG: SessionSvg = { checked: [], activeId: null, anchorId: null };

export const DEFAULT_UPLOAD: SessionUpload = { checked: [], activeId: null, anchorId: null };

/** An empty sheet: every cell a hole, nothing locked, the first seed, no filter. */
export const DEFAULT_BUILDER: SessionBuilder = {
  slots: [], locked: [], seed: 1,
  recipe: { mode: "random", threshold: 70, folder: "", tag: "" },
};

export const BUILDER_MODES = ["similar", "random", "filtered"] as const;
/** A sheet never carries more cells than this; a stored list is cut, never trusted. */
export const BUILDER_MAX_SLOTS = 256;

export const DEFAULT_STOCK_UPLOAD: SessionStockUpload = { checked: [], activeId: null, anchorId: null };

export const DEFAULT_BATCH: SessionBatch = { checked: [], activeId: null, anchorId: null };

export const DEFAULT_SESSION: SessionState = {
  tab: "sheets", sheets: DEFAULT_SHEET_OPTS,
  selection: DEFAULT_SELECTION, selectionV2: { checked: [], scrollY: 0, anchorId: null },
  svg: DEFAULT_SVG, upload: DEFAULT_UPLOAD, builder: DEFAULT_BUILDER,
  stockUpload: DEFAULT_STOCK_UPLOAD, batch: DEFAULT_BATCH,
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
    tab: raw.tab === "selection" ? "selectionV2"
      : TAB_IDS.includes(raw.tab as TabId) ? (raw.tab as TabId) : DEFAULT_SESSION.tab,
    sheets: parseSheetOpts(raw.sheets),
    selection: parseSelection(raw.selection),
    selectionV2: parseV2(raw.selectionV2),
    svg: parseSvgSlice(raw.svg),
    upload: parseUploadSlice(raw.upload),
    builder: parseBuilderSlice(raw.builder),
    stockUpload: parseUploadSlice(raw.stockUpload),
    batch: parseBatchSlice(raw.batch),
  };
}

function parseBatchSlice(raw: unknown): SessionBatch {
  if (!isRecord(raw) || !Array.isArray(raw.checked)) return DEFAULT_BATCH;
  return {
    checked: raw.checked.filter((id): id is string => typeof id === "string"),
    activeId: typeof raw.activeId === "string" ? raw.activeId : null,
    anchorId: typeof raw.anchorId === "string" ? raw.anchorId : null,
  };
}

function parseSvgSlice(raw: unknown): SessionSvg {
  if (!isRecord(raw) || !Array.isArray(raw.checked)) return DEFAULT_SVG;
  return {
    checked: raw.checked.filter((id): id is string => typeof id === "string"),
    activeId: typeof raw.activeId === "string" ? raw.activeId : null,
    anchorId: typeof raw.anchorId === "string" ? raw.anchorId : null,
  };
}

function parseUploadSlice(raw: unknown): SessionUpload {
  if (!isRecord(raw) || !Array.isArray(raw.checked)) return DEFAULT_UPLOAD;
  return {
    checked: raw.checked.filter((id): id is string => typeof id === "string"),
    activeId: typeof raw.activeId === "string" ? raw.activeId : null,
    anchorId: typeof raw.anchorId === "string" ? raw.anchorId : null,
  };
}

/**
 * The sheet, field by field (RULE 13): a non-string slot becomes a hole, locks keep
 * only strings that are actually placed, the seed is a positive integer, and the
 * recipe falls back per field — one bad value never costs the whole sheet.
 */
function parseBuilderSlice(raw: unknown): SessionBuilder {
  if (!isRecord(raw) || !Array.isArray(raw.slots)) return DEFAULT_BUILDER;
  const slots = raw.slots.slice(0, BUILDER_MAX_SLOTS)
    .map((id) => (typeof id === "string" && id !== "" ? id : null));
  const placed = new Set(slots.filter((id): id is string => id !== null));
  return {
    slots,
    locked: idsOf(raw.locked).filter((id) => placed.has(id)),
    seed: seedOf(raw.seed),
    recipe: parseRecipe(raw.recipe),
  };
}

function parseRecipe(raw: unknown): SessionBuilderRecipe {
  if (!isRecord(raw)) return DEFAULT_BUILDER.recipe;
  const mode = BUILDER_MODES.find((m) => m === raw.mode) ?? DEFAULT_BUILDER.recipe.mode;
  const threshold = typeof raw.threshold === "number" && Number.isFinite(raw.threshold)
    ? Math.min(100, Math.max(0, Math.round(raw.threshold))) : DEFAULT_BUILDER.recipe.threshold;
  return { mode, threshold, folder: textOrEmpty(raw.folder), tag: textOrEmpty(raw.tag) };
}

function idsOf(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string" && id !== "") : [];
}

function textOrEmpty(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

/** A real seed is a positive integer; anything else is the default (never 0: seed 0 re-seeds). */
function seedOf(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.round(raw)) : DEFAULT_BUILDER.seed;
}

function parseSelection(raw: unknown): SessionSelection {
  if (!isRecord(raw)) return DEFAULT_SELECTION;
  return {
    filter: parseFilter(raw.filter),
    sort: parseSort(raw.sort),
    selectedId: typeof raw.selectedId === "string" ? raw.selectedId : null,
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
