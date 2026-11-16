// Re-project only rows whose fingerprint inputs changed. Applied decorations
// participate exactly as they do in previews, scan assembly and export.
import { rowSettings } from "../lib/upload/decorations";
import { overridesEqual, SETTINGS_FIELDS, type UploadSettings } from "../lib/upload/settings";
import { staleOf } from "./rowmodel";
import type { UploadModel } from "./statemodel";
import type { UploadRow } from "./types";

type StaleSettings = Pick<UploadModel, "defaults" | "overrides" | "applied">;

export function withStale(row: UploadRow, stale: boolean): UploadRow {
  if (row.stale === stale) return row;
  if (row.running !== null) return { ...row, stale };
  return { ...row, stale, status: stale ? "stale" : (row.record?.status ?? "discovered") };
}

function projectRow(row: UploadRow, settings: StaleSettings): UploadRow {
  const effective = rowSettings(settings.defaults, row.source.id, settings.overrides, settings.applied);
  return withStale(row, staleOf({ record: row.record, source: row.source, effective, meta: row.meta, sourceHash: row.sourceHash }));
}

/** Metadata and run events cannot change another row's fingerprint inputs. */
export function updateUploadRow(m: UploadModel, id: string, update: (row: UploadRow) => UploadRow): UploadModel {
  return { ...m, rows: m.rows.map((row) => row.source.id === id ? projectRow(update(row), m) : row) };
}

/** Local settings and undo may include hidden/unloaded ids; keep their maps. */
export function restaleChanged(m: UploadModel, ids: ReadonlySet<string>): UploadModel {
  return { ...m, rows: m.rows.map((row) => ids.has(row.source.id) ? projectRow(row, m) : row) };
}

/** Equal nested padding/artboard objects are not a settings change. */
export function restaleDefaults(m: UploadModel, defaults: UploadSettings): UploadModel {
  const changed = SETTINGS_FIELDS.filter((field) => !overridesEqual({ [field]: m.defaults[field] }, { [field]: defaults[field] }));
  const next = { ...m, defaults };
  const inherits = (id: string) => changed.some((field) => m.overrides[id]?.[field] === undefined && m.applied[id]?.[field] === undefined);
  return { ...next, rows: m.rows.map((row) => inherits(row.source.id) ? projectRow(row, next) : row) };
}
