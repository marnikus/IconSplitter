// statemodel.ts — the "SVG to upload" tab's state model (RULE 3/24).
// Owns: one plain-data snapshot of everything the panel renders, the actions
// that change it, and a table-driven reducer. Pure data + a pure reducer keeps
// the rules testable without a DOM and keeps the hook itself tiny. Mirrors
// svg/statemodel; the selection lives in the appstore upload slice (session).

import { useReducer, type Dispatch } from "react";
import { maskKey } from "../lib/svgsecret";
import type { GeminiConfig } from "../lib/upload/gemini";
import type { PreviewBackground } from "../lib/svgbackground";
import type { SettingsOverrides, UploadSettings } from "../lib/upload/settings";
import type { UploadDiscovery } from "./discovery";
import { staleOf } from "./rowmodel";
import type { OverridesMap, UploadSettingsState } from "./settingsstore";
import type { UploadPrefs } from "./prefsstore";
import {
  ALL_UPLOAD_FILTER,
  type Toast, type UploadDialog, type UploadListFilter, type UploadMetaState,
  type UploadRow, type UploadSort,
} from "./types";

/** Everything the upload panel shows, in one snapshot. */
export interface UploadModel {
  rootName: string;
  rows: UploadRow[];
  discovery: UploadDiscovery | null;
  busy: string | null;
  toast: Toast | null;
  /** Global defaults — every icon without an override inherits these. */
  defaults: UploadSettings;
  /** Per-icon overrides (pair id → pinned fields); absent = inherited. */
  overrides: OverridesMap;
  gemini: GeminiConfig;
  /** Masked key for display; the key itself lives in upload/keystore. */
  keyMask: string;
  keySet: boolean;
  /** Bumped by every pick and scan so a preview cannot outlive its folder. */
  rootToken: number;
  thumb: number;
  /** false while the provider card is minimized to its header line. */
  providerOpen: boolean;
  /** Preview-frame background — an app setting, never part of an SVG. */
  bg: PreviewBackground;
  filter: UploadListFilter;
  sort: UploadSort;
  dialog: UploadDialog | null;
  /** Metadata requests in flight (the bulk bar's progress line). */
  runningMeta: number;
  /** Export runs in flight. */
  runningExport: number;
  progress: { done: number; total: number } | null;
}

/** The fields one run updates on a row (status/stage/record/error/running/stale). */
export type UploadRunUpdate = Partial<Pick<UploadRow,
  "status" | "stage" | "error" | "record" | "running" | "stale">>;

export type UploadAction =
  | { type: "root"; name: string }
  | { type: "rows"; rows: UploadRow[] }
  | { type: "rows-fn"; fn: (rows: UploadRow[]) => UploadRow[] }
  | { type: "discovery"; discovery: UploadDiscovery | null }
  | { type: "busy"; busy: string | null }
  | { type: "toast"; toast: Toast | null }
  | { type: "defaults"; defaults: UploadSettings }
  | { type: "override"; id: string; patch: SettingsOverrides | null }
  | { type: "overrides-patch"; overrides: Record<string, SettingsOverrides | null> }
  | { type: "gemini"; gemini: GeminiConfig }
  | { type: "key"; key: string | null }
  | { type: "thumb"; px: number }
  | { type: "bg"; bg: PreviewBackground }
  | { type: "provider-open"; open: boolean }
  | { type: "filter"; patch: Partial<UploadListFilter> }
  | { type: "sort"; sort: UploadSort }
  | { type: "dialog"; dialog: UploadDialog | null }
  | { type: "meta"; id: string; meta: UploadMetaState }
  | { type: "run"; id: string; run: UploadRunUpdate }
  | { type: "progress"; progress: { done: number; total: number } | null }
  | { type: "running"; kind: "metadata" | "export"; n: number };

/** Table-driven: one handler per action, so no branch chain can grow (RULE 19). */
const HANDLERS: Record<UploadAction["type"], (m: UploadModel, a: UploadAction) => UploadModel> = {
  root: (m, a) => ({ ...m, rootName: (a as { name: string }).name, rootToken: m.rootToken + 1 }),
  rows: (m, a) => ({ ...m, rows: (a as { rows: UploadRow[] }).rows, rootToken: m.rootToken + 1 }),
  "rows-fn": (m, a) => ({ ...m, rows: (a as { fn: (r: UploadRow[]) => UploadRow[] }).fn(m.rows) }),
  discovery: (m, a) => ({ ...m, discovery: (a as { discovery: UploadDiscovery | null }).discovery }),
  busy: (m, a) => ({ ...m, busy: (a as { busy: string | null }).busy }),
  toast: (m, a) => ({ ...m, toast: (a as { toast: Toast | null }).toast }),
  defaults: (m, a) => restaleAll({ ...m, defaults: (a as { defaults: UploadSettings }).defaults }, (a as { defaults: UploadSettings }).defaults),
  override: (m, a) => {
    const act = a as { id: string; patch: SettingsOverrides | null };
    return restaleAll({ ...m, overrides: setOverride(m.overrides, act.id, act.patch) }, m.defaults);
  },
  "overrides-patch": (m, a) => {
    const overrides = (a as { overrides: Record<string, SettingsOverrides | null> }).overrides;
    let map = m.overrides;
    for (const [id, patch] of Object.entries(overrides)) map = setOverride(map, id, patch);
    return restaleAll({ ...m, overrides: map }, m.defaults);
  },
  gemini: (m, a) => ({ ...m, gemini: (a as { gemini: GeminiConfig }).gemini }),
  key: (m, a) => keyModel(m, (a as { key: string | null }).key),
  thumb: (m, a) => ({ ...m, thumb: (a as { px: number }).px }),
  bg: (m, a) => ({ ...m, bg: (a as { bg: PreviewBackground }).bg }),
  "provider-open": (m, a) => ({ ...m, providerOpen: (a as { open: boolean }).open }),
  filter: (m, a) => ({ ...m, filter: { ...m.filter, ...(a as { patch: Partial<UploadListFilter> }).patch } }),
  sort: (m, a) => ({ ...m, sort: (a as { sort: UploadSort }).sort }),
  dialog: (m, a) => ({ ...m, dialog: (a as { dialog: UploadDialog | null }).dialog }),
  meta: (m, a) => {
    const act = a as { id: string; meta: UploadMetaState };
    return { ...m, rows: restaleRows(m.rows, m.defaults, m.overrides, (r) => r.source.id === act.id ? { ...r, meta: act.meta } : r) };
  },
  run: (m, a) => {
    const act = a as { id: string; run: UploadRunUpdate };
    return { ...m, rows: restaleRows(m.rows, m.defaults, m.overrides, (r) => r.source.id === act.id ? withStale({ ...r, ...act.run }, act.run.stale ?? r.stale) : r) };
  },
  progress: (m, a) => ({ ...m, progress: (a as { progress: { done: number; total: number } | null }).progress }),
  running: (m, a) => {
    const act = a as { kind: "metadata" | "export"; n: number };
    return act.kind === "metadata" ? { ...m, runningMeta: act.n } : { ...m, runningExport: act.n };
  },
};

export function reduceState(model: UploadModel, action: UploadAction): UploadModel {
  return HANDLERS[action.type](model, action);
}

function keyModel(model: UploadModel, key: string | null): UploadModel {
  return { ...model, keySet: key !== null, keyMask: key ? maskKey(key) : "not set" };
}

/** One override set (or delete, on null/empty) — the caller's map is untouched. */
function setOverride(map: OverridesMap, id: string, patch: SettingsOverrides | null): OverridesMap {
  const next = { ...map };
  if (patch === null || Object.keys(patch).length === 0) delete next[id];
  else next[id] = patch;
  return next;
}

/**
 * Re-projects stale after anything a fingerprint keys on moved (defaults,
 * overrides, metadata). A row mid-run keeps its run status; only its flag moves.
 */
function restaleAll(m: UploadModel, defaults: UploadSettings): UploadModel {
  return { ...m, rows: restaleRows(m.rows, defaults, m.overrides, (r) => r) };
}

function restaleRows(
  rows: readonly UploadRow[], defaults: UploadSettings, overrides: OverridesMap,
  update: (row: UploadRow) => UploadRow,
): UploadRow[] {
  return rows.map((row) => {
    const next = update(row);
    const effective = { ...defaults, ...(overrides[next.source.id] ?? {}) };
    return withStale(next, staleOf({ record: next.record, source: next.source, effective, meta: next.meta, sourceHash: next.sourceHash }));
  });
}

function withStale(row: UploadRow, stale: boolean): UploadRow {
  if (row.stale === stale) return row;
  if (row.running !== null) return { ...row, stale };
  return { ...row, stale, status: stale ? "stale" : (row.record?.status ?? "discovered") };
}

export interface Boot {
  settings: UploadSettingsState;
  gemini: GeminiConfig;
  prefs: UploadPrefs;
}

/** The model a fresh tab opens with (persisted values are merged in boot). */
export function initialModel(boot: Boot): UploadModel {
  return {
    rootName: "", rows: [], discovery: null, busy: null, toast: null,
    defaults: boot.settings.defaults, overrides: boot.settings.overrides,
    gemini: boot.gemini, keyMask: "not set", keySet: false, rootToken: 0,
    thumb: boot.prefs.thumbHeight, providerOpen: boot.prefs.providerOpen, bg: boot.prefs.previewBg,
    filter: ALL_UPLOAD_FILTER, sort: "name", dialog: null,
    runningMeta: 0, runningExport: 0, progress: null,
  };
}

/** One hook, one line of state: the panel never holds a second copy. */
export function useUploadModel(boot: Boot): [UploadModel, Dispatch<UploadAction>] {
  return useReducer(reduceState, boot, initialModel);
}
