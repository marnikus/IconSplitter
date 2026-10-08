// rowmodel.ts — the "SVG to upload" list model (design §3.2/§4.2).
// Owns: assembling one UI row per discovered source (reading the pair's
// export.json and hashing the source SVG, so staleness is exact), the metadata
// state a record carries, the stale/status projections, filter + sort, the
// header checkbox state, the counts and dropping checked ids a rescan removed.
// Pure except for the store write and the two file reads.

import { probePath, tryGetFile, type DirHandleLike } from "../lib/fs";
import { sha256HexText } from "../lib/upload/hash";
import { exportDirOf, parseExportRecord, type ExportRecord } from "../lib/upload/export";
import { effectiveSettings, settingsFingerprint, type SettingsOverrides, type UploadSettings } from "../lib/upload/settings";
import { cleanTitle, metadataFingerprint } from "../lib/upload/meta";
import { getAppState, patchUpload } from "../state/appstore";
import { cachedMeta, restoredMeta } from "./metacache";
import type { UploadRowSource } from "./discovery";
import {
  EMPTY_META,
  type UploadJobStatus, type UploadMetaState, type UploadRow,
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
  /** A run a previous session left unresolved (CP-2) — never silently pending. */
  interruptedJob?: boolean;
}

/** One source + its record + its metadata state → one row (pure). */
export function toRow(source: UploadRowSource, inputs: RowInputs): UploadRow {
  const stale = staleOf({ record: inputs.record, source, effective: inputs.effective, meta: inputs.meta, sourceHash: inputs.sourceHash });
  return {
    source,
    record: inputs.record,
    sourceHash: inputs.sourceHash,
    status: rowStatus({ stale, interrupted: inputs.interruptedJob === true, record: inputs.record }),
    stage: null,
    running: null,
    meta: inputs.meta,
    error: inputs.record?.error ?? "",
    stale,
  };
}

/**
 * Stale beats everything (the user must re-export anyway); an unresolved run
 * shows `interrupted` unless a committed record proves how the run ended
 * (memory wins over a missing record, disk wins over nothing).
 */
function rowStatus(input: { stale: boolean; interrupted: boolean; record: ExportRecord | null }): UploadJobStatus {
  if (input.stale) return "stale";
  const settled = input.record?.status;
  if (!input.interrupted) return settled ?? "discovered";
  const finished = settled === "processed" || settled === "partial" || settled === "failed" || settled === "cancelled";
  return finished ? settled : "interrupted";
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

/**
 * The metadata state a committed record carries (empty until generated). The
 * title passes `cleanTitle` on the way in — the fourth gate (stock review,
 * 2026-10-08): a package exported before the one-phrase rule reads back the
 * clean title, and because that no longer matches the record's stored
 * fingerprint the row reports `stale`, so the next export rewrites the file
 * without a model call.
 */
export function metaFromRecord(record: ExportRecord | null, interrupted: boolean): UploadMetaState {
  if (interrupted) return { ...EMPTY_META, state: "interrupted", detail: "a metadata request was in flight when the app closed — its outcome is unknown; generate again to retry" };
  const block = record?.metadata ?? null;
  const title = block === null ? "" : cleanTitle(block.title);
  if (block === null || block.state !== "accepted" || title === "") return EMPTY_META;
  return {
    state: "accepted",
    metadata: { title, description: block.description, tags: [...block.tags] },
    validation: block.validation,
    usage: block.usage,
    detail: "",
    edited: false,
  };
}

/**
 * "A REQUEST is required": the icon has no metadata text at all. This is the
 * count the global "Generate metadata" button acts on — icon that already has a
 * draft or an accepted answer is never paid for again behind the user's back.
 */
export function needsMetadata(row: UploadRow): boolean {
  return row.meta.metadata === null;
}

/**
 * "The EXPORT cannot carry metadata yet": nothing, or a draft that was never
 * accepted. Wiring the two questions apart is deliberate (2026-10-08): a draft
 * needs no new request, it needs the user's Accept — and an export must never
 * quietly ship a package without the metadata the button promised.
 */
export function needsAccepted(row: UploadRow): boolean {
  return row.meta.state !== "accepted" || row.meta.metadata === null;
}

/** The icons needing a paid request, in the selection's own order. */
export function idsNeedingMetadata(rows: readonly UploadRow[], ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  return rows.filter((row) => wanted.has(row.source.id) && needsMetadata(row)).map((row) => row.source.id);
}

/** The icons whose metadata is not exportable yet, in the selection's order. */
export function idsNeedingAccepted(rows: readonly UploadRow[], ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  return rows.filter((row) => wanted.has(row.source.id) && needsAccepted(row)).map((row) => row.source.id);
}

/** Drafts: metadata exists, the user has not accepted it (no request needed). */
export function idsWithDraft(rows: readonly UploadRow[], ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  return rows
    .filter((row) => wanted.has(row.source.id) && row.meta.metadata !== null && row.meta.state !== "accepted")
    .map((row) => row.source.id);
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
  opts: {
    defaults: UploadSettings; overrides: Record<string, SettingsOverrides>;
    /** Metadata requests a restart left outcome-unknown (the journal). */
    interrupted: ReadonlySet<string>;
    /** Runs a restart left unresolved (the job store, CP-2). */
    interruptedJobs?: ReadonlySet<string>;
  },
): Promise<UploadRow[]> {
  const rows: UploadRow[] = [];
  for (const source of sources) {
    rows.push(await assembleOne(root, source, opts));
  }
  return rows;
}

async function assembleOne(
  root: DirHandleLike, source: UploadRowSource,
  opts: {
    defaults: UploadSettings; overrides: Record<string, SettingsOverrides>;
    interrupted: ReadonlySet<string>; interruptedJobs?: ReadonlySet<string>;
  },
): Promise<UploadRow> {
  const record = await readRecordAt(root, source.dirPath);
  const sourceHash = await hashAt(root, source.svgPath);
  return toRow(source, {
    record,
    sourceHash,
    meta: restoredRowMeta(record, sourceHash, opts.interrupted.has(source.id)),
    effective: effectiveSettings(opts.defaults, opts.overrides[source.id] ?? {}),
    interruptedJob: opts.interruptedJobs?.has(source.id) === true,
  });
}

/**
 * What the row opens with: the COMMITTED accepted answer wins; otherwise the
 * accepted-metadata cache answers by source fingerprint (CP-15), so a crash, a
 * reload or a settings change never re-bills the model for artwork that has not
 * changed. `interrupted` still wins over both: an in-flight request's outcome
 * is unknown and must be said out loud (RULE 4).
 */
function restoredRowMeta(record: ExportRecord | null, sourceHash: string | null, interrupted: boolean): UploadMetaState {
  const committed = metaFromRecord(record, interrupted);
  if (interrupted || committed.state !== "empty") return committed;
  return restoredMeta(cachedMeta(sourceHash));
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

/** The source's content hash, `sha256:<hex>`; "" when it cannot be read. */
async function hashAt(root: DirHandleLike, relPath: string): Promise<string | null> {
  const bytes = await readBytesAt(root, relPath);
  return bytes === null ? null : `sha256:${await sha256HexText(new TextDecoder().decode(bytes))}`;
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
