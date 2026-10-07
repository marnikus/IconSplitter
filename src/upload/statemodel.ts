// statemodel.ts — the SVG-to-upload tab's plain model + reducer (design §4/§5/
// §9). Owns: rows (identity + metadata + export state), the global defaults
// with per-icon overrides, the checked set, the filter, run progress and the
// toast. Pure on purpose: the panel binds it, history snapshots it (ONE
// uploadSettings entry for "apply to selected"), and every rule about settings
// lives in lib/upsettings — this file only moves state.

import {
  DEFAULT_EXPORT_SETTINGS, effectiveSettings, sanitizeOverride,
  type ExportOverride, type ExportSettings,
} from "../lib/upsettings";
import { validateMetadata, type IconMetadata } from "../lib/upmeta";
import type { ExportRecord } from "../lib/upexport";
import type { ExportState, UploadRowSource } from "./sources";

export type MetaState = "empty" | "pending" | "accepted";

export interface UploadRow {
  source: UploadRowSource;
  metaState: MetaState;
  metadata: IconMetadata | null;
}

export type UploadFilter = "all" | "todo" | "processed" | "problems";

export interface UploadProgress {
  done: number;
  total: number;
  /** ids currently running — the table shows the active stage per row. */
  active: string[];
}

export interface UploadModel {
  rows: UploadRow[];
  defaults: ExportSettings;
  /** pairId → override (null = cleared). Only fields the user set survive. */
  overrides: Record<string, ExportOverride | null>;
  checked: Record<string, boolean>;
  filter: UploadFilter;
  progress: UploadProgress | null;
  toast: string | null;
}

export const INITIAL_UPLOAD_MODEL: UploadModel = {
  rows: [],
  defaults: { ...DEFAULT_EXPORT_SETTINGS },
  overrides: {},
  checked: {},
  filter: "all",
  progress: null,
  toast: null,
};

export type UploadAction =
  | { type: "scan"; rows: UploadRowSource[] }
  | { type: "toggle"; id: string }
  | { type: "check-all"; ids: string[]; on: boolean }
  | { type: "set-defaults"; settings: ExportSettings }
  | { type: "apply-override"; ids: string[]; fields: ExportOverride }
  | { type: "set-overrides"; overrides: Record<string, ExportOverride | null> }
  | { type: "clear-override"; id: string }
  | { type: "set-filter"; filter: UploadFilter }
  | { type: "set-progress"; progress: UploadProgress | null }
  | { type: "toast"; message: string | null }
  | { type: "meta-pending"; ids: string[] }
  | { type: "meta-accepted"; id: string; metadata: IconMetadata }
  | { type: "export-state"; id: string; state: ExportState; record?: ExportRecord | null };

type Handler<K extends UploadAction["type"]> = (m: UploadModel, a: Extract<UploadAction, { type: K }>) => UploadModel;

/** One handler per action — the reducer is a dispatch, not a rule pile. */
const HANDLERS: { [K in UploadAction["type"]]: Handler<K> } = {
  scan: (m, a) => ({
    ...m,
    rows: a.rows.map((source) => ({ source, metaState: "empty" as const, metadata: null })),
    overrides: keepIds(m.overrides, idsOf(a.rows)),
    checked: keepIds(m.checked, idsOf(a.rows)),
  }),
  toggle: (m, a) => ({ ...m, checked: { ...m.checked, [a.id]: !m.checked[a.id] } }),
  "check-all": (m, a) => ({ ...m, checked: { ...m.checked, ...flipAll(a.ids, a.on) } }),
  // Editing a global default never erases an override (design §5).
  "set-defaults": (m, a) => ({ ...m, defaults: a.settings }),
  "apply-override": (m, a) => ({ ...m, overrides: applyToIds(m.overrides, a.ids, a.fields) }),
  "set-overrides": (m, a) => ({ ...m, overrides: mergeOverrides(m.overrides, a.overrides) }),
  "clear-override": (m, a) => {
    const { [a.id]: _drop, ...rest } = m.overrides;
    return { ...m, overrides: rest };
  },
  "set-filter": (m, a) => ({ ...m, filter: a.filter }),
  "set-progress": (m, a) => ({ ...m, progress: a.progress }),
  toast: (m, a) => ({ ...m, toast: a.message }),
  "meta-pending": (m, a) => retag(m, a.ids, (r) => ({ ...r, metaState: "pending" })),
  "meta-accepted": (m, a) => retag(m, [a.id], (r) => ({ ...r, metaState: "accepted", metadata: a.metadata })),
  "export-state": (m, a) => retag(m, [a.id], (r) => ({
    ...r,
    source: { ...r.source, exportState: a.state, record: a.record ?? r.source.record },
  })),
};

export function uploadReducer(m: UploadModel, a: UploadAction): UploadModel {
  const handler = HANDLERS[a.type] as (model: UploadModel, action: UploadAction) => UploadModel;
  return handler(m, a);
}

function idsOf(rows: UploadRowSource[]): Set<string> {
  return new Set(rows.map((r) => r.id));
}

function flipAll(ids: string[], on: boolean): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const id of ids) out[id] = on;
  return out;
}

/** Writes the SAME override fields onto exactly the listed ids (design §5). */
function applyToIds(overrides: UploadModel["overrides"], ids: string[], fields: ExportOverride): UploadModel["overrides"] {
  const out = { ...overrides };
  for (const id of ids) out[id] = { ...(out[id] ?? null), ...fields };
  return out;
}

/** Installs one override map exactly: null deletes — the undo/redo path. */
function mergeOverrides(overrides: UploadModel["overrides"], patch: Record<string, ExportOverride | null>): UploadModel["overrides"] {
  const out = { ...overrides };
  for (const [id, override] of Object.entries(patch)) {
    if (override === null) delete out[id];
    else out[id] = override;
  }
  return out;
}

/** Re-tags the rows the ids name; every other row object is kept as is. */
function retag(m: UploadModel, ids: string[], tag: (row: UploadRow) => UploadRow): UploadModel {
  return { ...m, rows: m.rows.map((r) => (ids.includes(r.source.id) ? tag(r) : r)) };
}

/** Effective settings for one icon: defaults, overridden per field (design §5). */
export function effectiveFor(m: UploadModel, id: string): ExportSettings {
  return effectiveSettings(m.defaults, sanitizeOverride(m.overrides[id] ?? null));
}

/** The rows the current filter shows, in model order. */
export function visibleRows(m: UploadModel): UploadRow[] {
  return m.rows.filter((r) => {
    if (m.filter === "all") return true;
    if (m.filter === "processed") return r.source.exportState === "processed";
    if (m.filter === "todo") return r.source.exportState !== "processed";
    return r.source.warnings.length > 0 || r.source.exportState === "partial" || r.source.exportState === "interrupted";
  });
}

/** The checked ids that still exist (never a stale id from a previous scan). */
export function checkedIds(m: UploadModel): string[] {
  return m.rows.filter((r) => m.checked[r.source.id]).map((r) => r.source.id);
}

/** Metadata accepted only when it passes the ONE validation rule (lib/upmeta). */
export function acceptMetadata(m: UploadModel, id: string, meta: IconMetadata): UploadModel {
  return validateMetadata(meta).length === 0
    ? uploadReducer(m, { type: "meta-accepted", id, metadata: meta })
    : uploadReducer(m, { type: "toast", message: "the edited metadata does not pass validation — it was not accepted" });
}

function keepIds<T>(record: Record<string, T>, ids: Set<string>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const id of ids) if (record[id] !== undefined) out[id] = record[id];
  return out;
}
