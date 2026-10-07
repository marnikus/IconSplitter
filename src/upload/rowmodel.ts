// rowmodel.ts — the "SVG to upload" list model (design §3.2/§4.2).
// Owns: assembling one UI row per discovered source (reading the pair's
// export.json and hashing the source SVG, so staleness is exact), the metadata
// state a record carries, the stale/status projections, filter + sort, the
// header checkbox state, the counts and dropping checked ids a rescan removed.
// Pure except for the store write and the two file reads.

import { probePath, tryGetFile, type DirHandleLike } from "../lib/fs";
import { sha256HexText } from "../lib/hash";
import { exportDirOf, parseExportRecord, type ExportRecord } from "../lib/uploadexport";
import { effectiveSettings, settingsFingerprint, type SettingsOverrides, type UploadSettings } from "../lib/uploadsettings";
import { metadataFingerprint } from "../lib/uploadmeta";
import { compareNames } from "../lib/scan";
import { getAppState, patchUpload } from "../state/appstore";
import type { UploadRowSource } from "./discovery";
import {
  ALL_UPLOAD_FILTER, EMPTY_META,
  type UploadJobStatus, type UploadListFilter, type UploadListRow,
  type UploadMetaState, type UploadRow, type UploadSort,
} from "./types";

export interface UploadCounts {
  icons: number;
  processed: number;
  partial: number;
  failed: number;
  stale: number;
  accepted: number;
}

/** Everything one assembled row needs beyond the source itself. */
export interface RowInputs {
  record: ExportRecord | null;
  /** sha256 of the source SVG ("sha256:…"), or null when there is no record. */
  sourceHash: string | null;
  meta: UploadMetaState;
  /** The settings this icon exports with (defaults under, overrides on top). */
  effective: UploadSettings;
}

/** One source + its record + its metadata state → one row (pure). */
export function toRow(source: UploadRowSource, inputs: RowInputs): UploadRow {
  const stale = staleOf({ record: inputs.record, source, effective: inputs.effective, meta: inputs.meta, sourceHash: inputs.sourceHash });
  const recordStatus = inputs.record?.status ?? "discovered";
  return {
    source,
    record: inputs.record,
    sourceHash: inputs.sourceHash,
    status: stale ? "stale" : recordStatus,
    stage: null,
    running: null,
    meta: inputs.meta,
    error: inputs.record?.error ?? "",
    stale,
  };
}

/** Everything a staleness check compares — one domain object (RULE 16). */
export interface StaleInput {
  record: ExportRecord | null;
  source: UploadRowSource;
  effective: UploadSettings;
  meta: UploadMetaState;
  sourceHash: string | null;
}

/**
 * Stale = a fingerprint moved since the last commit (design §4.2): the source
 * file (exact sha256), the path/version the record names, the effective
 * settings, or the accepted metadata text.
 */
export function staleOf(input: StaleInput): boolean {
  if (input.record === null) return false;
  return sourceMoved(input.record, input.source, input.sourceHash)
    || settingsMoved(input.record, input.effective)
    || metadataMoved(input.record, input.meta);
}

/** The record names another file, or the source's content hash moved. */
function sourceMoved(record: ExportRecord, source: UploadRowSource, sourceHash: string | null): boolean {
  if (record.source.svgPath !== source.svgPath || record.source.version !== source.version) return true;
  return sourceHash !== null && record.source.fingerprint !== sourceHash;
}

function settingsMoved(record: ExportRecord, effective: UploadSettings): boolean {
  return record.settings.fingerprint !== settingsFingerprint(effective);
}

/** The accepted text differs from what the record carries (null = none). */
function metadataMoved(record: ExportRecord, meta: UploadMetaState): boolean {
  const acceptedFp = meta.state === "accepted" && meta.metadata !== null ? metadataFingerprint(meta.metadata) : "";
  return (record.metadata?.fingerprint ?? "") !== acceptedFp;
}

/** The metadata state a committed record carries (empty until generated). */
export function metaFromRecord(record: ExportRecord | null, interrupted: boolean): UploadMetaState {
  if (interrupted) return { ...EMPTY_META, state: "interrupted", detail: "a metadata request was in flight when the app closed — its outcome is unknown; generate again to retry" };
  const block = record?.metadata ?? null;
  if (block === null || block.state !== "accepted" || block.title === "") return EMPTY_META;
  return {
    state: "accepted",
    metadata: { title: block.title, description: block.description, tags: [...block.tags] },
    validation: block.validation,
    usage: block.usage,
    detail: "",
    edited: false,
  };
}

/** The visible status: the run in flight wins, then stale, then the record. */
export function statusOf(row: UploadRow): UploadJobStatus {
  if (row.running === "metadata") return "metadata";
  if (row.running === "export") return row.stage ?? "preflight";
  return row.status;
}

/**
 * Reads one pair's export.json and hashes its source SVG, then assembles the
 * row. The record is tolerant (corrupt → null, rebuilt on next export) and the
 * source read is skipped when there is no record — nothing to compare against.
 */
export async function assembleRows(
  root: DirHandleLike, sources: readonly UploadRowSource[],
  opts: { defaults: UploadSettings; overrides: Record<string, SettingsOverrides>; interrupted: ReadonlySet<string> },
): Promise<UploadRow[]> {
  const rows: UploadRow[] = [];
  for (const source of sources) {
    rows.push(await assembleOne(root, source, opts));
  }
  return rows;
}

async function assembleOne(
  root: DirHandleLike, source: UploadRowSource,
  opts: { defaults: UploadSettings; overrides: Record<string, SettingsOverrides>; interrupted: ReadonlySet<string> },
): Promise<UploadRow> {
  const record = await readRecordAt(root, source.dirPath);
  const sourceHash = record === null ? null : `sha256:${await hashAt(root, source.svgPath)}`;
  return toRow(source, {
    record,
    sourceHash,
    meta: metaFromRecord(record, opts.interrupted.has(source.id)),
    effective: effectiveSettings(opts.defaults, opts.overrides[source.id] ?? {}),
  });
}

/** The pair's export.json → record; null when missing or corrupt (RULE 13). */
async function readRecordAt(root: DirHandleLike, dirPath: string): Promise<ExportRecord | null> {
  const bytes = await readBytesAt(root, `${exportDirOf(dirPath)}/export.json`);
  if (bytes === null) return null;
  try {
    return parseExportRecord(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

async function hashAt(root: DirHandleLike, relPath: string): Promise<string> {
  const bytes = await readBytesAt(root, relPath);
  return bytes === null ? "" : sha256HexText(new TextDecoder().decode(bytes));
}

/** Reads one file's bytes under the root; null when any segment is absent. */
async function readBytesAt(root: DirHandleLike, relPath: string): Promise<Uint8Array | null> {
  const at = relPath.lastIndexOf("/");
  const dir = at < 0 ? root : await probePath(root, relPath.slice(0, at));
  if (dir === null) return null;
  const fh = await tryGetFile(dir, relPath.slice(at + 1));
  if (fh === null) return null;
  try {
    return new Uint8Array(await (await fh.getFile()).arrayBuffer());
  } catch {
    return null;
  }
}

// --- list filter / sort ---------------------------------------------------------

export function toListRow(row: UploadRow): UploadListRow {
  return {
    id: row.source.id,
    name: row.source.svgName,
    relPath: row.source.svgPath,
    status: row.record === null ? "not-exported" : row.stale ? "stale" : (row.record.status as UploadListRow["status"]),
    metadata: row.meta.state,
    approvedValid: row.source.approvedValid,
  };
}

export function applyUploadFilters(rows: readonly UploadListRow[], f: UploadListFilter): UploadListRow[] {
  const needle = f.search.trim().toLowerCase();
  return rows.filter((r) => inStatus(r, f.status) && inMeta(r, f.metadata) && inSearch(r, needle));
}

function inStatus(row: UploadListRow, want: UploadListFilter["status"]): boolean {
  return want === "all" || row.status === want;
}

function inMeta(row: UploadListRow, want: UploadListFilter["metadata"]): boolean {
  return want === "all" || row.metadata === want;
}

function inSearch(row: UploadListRow, needle: string): boolean {
  if (needle === "") return true;
  return `${row.name} ${row.relPath} v${row.approvedValid}`.toLowerCase().includes(needle);
}

/** Sorts a copy — the caller's array is never reordered. */
export function sortUploadRows(rows: readonly UploadListRow[], sort: UploadSort): UploadListRow[] {
  const out = [...rows];
  out.sort((a, b) => COMPARATORS[sort](a, b));
  return out;
}

const COMPARATORS: Record<UploadSort, (a: UploadListRow, b: UploadListRow) => number> = {
  name: (a, b) => compareNames(a.relPath, b.relPath) || compareNames(a.id, b.id),
  status: (a, b) => rank(a.status) - rank(b.status) || compareNames(a.relPath, b.relPath),
  metadata: (a, b) => rank(a.metadata) - rank(b.metadata) || compareNames(a.relPath, b.relPath),
};

const STATUS_RANK: Record<UploadListRow["status"], number> = {
  all: 0, failed: 1, cancelled: 2, partial: 3, stale: 4, "not-exported": 5, processed: 6,
};
const META_RANK: Record<UploadListRow["metadata"], number> = {
  all: 0, invalid: 1, interrupted: 2, pending: 3, empty: 4, generated: 5, accepted: 6,
};

function rank(value: string): number {
  return STATUS_RANK[value as UploadListRow["status"]] ?? META_RANK[value as UploadListRow["metadata"]] ?? 0;
}

/** Filter + sort a copy of the rows; the caller's array is never reordered. */
export function visibleRows(rows: readonly UploadRow[], filter: UploadListFilter, sort: UploadSort): UploadRow[] {
  const byId = new Map(rows.map((r) => [r.source.id, r]));
  return sortUploadRows(applyUploadFilters([...byId.values()].map(toListRow), filter), sort)
    .flatMap((l) => {
      const row = byId.get(l.id);
      return row ? [row] : [];
    });
}

/** Header checkbox state for the visible rows (indeterminate = some). */
export function headerState(visible: readonly UploadRow[], checked: readonly string[]): "none" | "some" | "all" {
  if (visible.length === 0) return "none";
  const on = visible.filter((r) => checked.includes(r.source.id)).length;
  if (on === 0) return "none";
  return on === visible.length ? "all" : "some";
}

/** The counters the source bar shows, straight off the rows (no extra state). */
export function countsOf(rows: readonly UploadRow[]): UploadCounts {
  const counts: UploadCounts = { icons: rows.length, processed: 0, partial: 0, failed: 0, stale: 0, accepted: 0 };
  for (const r of rows) {
    // The row's own status is the authority: a failed run keeps record === null
    // (nothing committed), so keying off record.status would undercount it.
    const status = r.running === null ? r.status : null;
    if (r.stale) counts.stale++;
    else if (status === "processed") counts.processed++;
    else if (status === "partial") counts.partial++;
    else if (status === "failed" || status === "cancelled") counts.failed++;
    if (r.meta.state === "accepted") counts.accepted++;
  }
  return counts;
}

/** A restored check must never point at a pair the rescan removed. */
export function pruneChecked(rows: readonly UploadRow[]): void {
  const known = new Set(rows.map((r) => r.source.id));
  const checked = getAppState().upload.checked;
  const kept = checked.filter((id) => known.has(id));
  if (kept.length !== checked.length) patchUpload({ checked: kept });
}

export { ALL_UPLOAD_FILTER };
