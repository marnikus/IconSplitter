// rows.ts — the upload list's row model (RULE 5: the rules live in a testable
// module, not in a component). Owns: what a row is, the one place a row's status
// is derived, the counts the header shows, and the search/filter/sort the list
// obeys. Only APPROVED SVGs become rows; an icon with a problem still appears —
// with the problem visible — because hiding a broken icon is how a broken icon
// gets exported.
//
// Status independence is the rule (brief §3): approval, metadata readiness and
// package status are three different things, so one never overwrites another.

import type { ExportStatus, ExportRecord, OutputFile } from "../lib/uploadrecord";
import type { MetadataCheck, MetadataRecord } from "../lib/uploadmeta";
import { approvedVersion, chosenVersion } from "../lib/svgfile";
import type { PairMeta } from "../lib/pairmeta";
import { PROBLEM_LABEL, type SvgSource } from "../svg/sources";

export type UploadStatus = "awaiting-metadata" | "ready" | "processing" | "processed" | "partial" | "stale" | "failed";

export interface UploadRow {
  /** Stable pair id — survives sort, filter and restart (never a list index). */
  id: string;
  name: string;
  stem: string;
  relPath: string;
  dirPath: string;
  sourcePath: string | null;
  /** Scan-time fingerprint, so a changed source is visible as changed. */
  fingerprint: string | null;
  /** Problems the scan already found for this icon, shown verbatim. */
  problems: string[];
  /** The APPROVED SVG this row exports: its path and its version label. */
  svgPath: string | null;
  version: string | null;
  /** Approved SVG code, read when first needed. */
  code: string | null;
  /** Hash of the code as read; the export's source fingerprint. */
  hash: string | null;
  metadata: MetadataRecord | null;
  metadataCheck: MetadataCheck | null;
  record: ExportRecord | null;
  /** Live progress line while a run touches this row. */
  progress: string | null;
  /** Per-row notes: warnings, failures, what a re-export will redo. */
  warnings: string[];
}

export interface RowCounts {
  eligible: number;
  awaiting: number;
  ready: number;
  processing: number;
  processed: number;
  partial: number;
  stale: number;
  failed: number;
}

/**
 * One row per approved SVG: the pair's APPROVED version when there is one, else
 * the version the user chose to show. A pair with neither still gets a row — with
 * the reason attached — because an icon that silently disappears is an icon that
 * silently does not get exported.
 */
export function rowFromSource(source: SvgSource, meta: PairMeta | null = null): UploadRow {
  const versions = meta?.versions ?? [];
  const approved = approvedVersion(versions) ?? chosenVersion(versions, meta?.preferred ?? null);
  const problems = source.problems.map((problem) => PROBLEM_LABEL[problem.kind]);
  if (approved === null) problems.push("No approved SVG version yet — generate and approve one first");
  return {
    id: source.id,
    name: source.name,
    stem: source.stem,
    relPath: source.relPath,
    dirPath: source.dirPath,
    svgPath: approved?.svgPath ?? null,
    version: approved === null ? null : `v${approved.version}`,
    sourcePath: source.sourcePath,
    fingerprint: source.fingerprint,
    problems,
    code: null, hash: null,
    metadata: null, metadataCheck: null, record: null,
    progress: null, warnings: [],
  };
}

/** The one derivation of a row's status — nothing else may invent one. */
export function statusOf(row: UploadRow): UploadStatus {
  if (row.progress !== null) return "processing";
  const record = row.record;
  if (record !== null) {
    if (record.status === "failed" || record.status === "cancelled") return "failed";
    if (record.interrupted) return "stale";
    if (record.status === "partial") return "partial";
    if (record.validation.ok) return isStale(row, record) ? "stale" : "processed";
    return "stale";
  }
  return row.metadataCheck?.ok === true ? "ready" : "awaiting-metadata";
}

/** A package that no longer matches what is on disk or what was accepted. */
function isStale(row: UploadRow, record: ExportRecord): boolean {
  if (row.hash !== null && record.sourceHash !== row.hash) return true;
  if (row.metadata !== null && record.metadata.tags.join(",") !== row.metadata.tags.join(",")) return true;
  return false;
}

export function countsOf(rows: readonly UploadRow[]): RowCounts {
  const counts: RowCounts = { eligible: rows.length, awaiting: 0, ready: 0, processing: 0, processed: 0, partial: 0, stale: 0, failed: 0 };
  for (const row of rows) {
    const status = statusOf(row);
    if (status === "awaiting-metadata") counts.awaiting += 1;
    else if (status === "ready") counts.ready += 1;
    else counts[status] += 1;
  }
  return counts;
}

export const STATUS_LABEL: Record<UploadStatus, string> = {
  "awaiting-metadata": "awaiting metadata",
  ready: "ready",
  processing: "processing",
  processed: "processed",
  partial: "partial",
  stale: "stale",
  failed: "failed",
};

export type SortKey = "name" | "status" | "path";

export interface ListQuery {
  query: string;
  status: UploadStatus | "all";
  sort: SortKey;
}

export const DEFAULT_QUERY: ListQuery = { query: "", status: "all", sort: "name" };

/** Search, filter and sort — one way in, so the counts and the list agree. */
export function visibleRows(rows: readonly UploadRow[], list: ListQuery): UploadRow[] {
  const needle = list.query.trim().toLowerCase();
  const matched = rows.filter((row) => {
    if (list.status !== "all" && statusOf(row) !== list.status) return false;
    if (needle === "") return true;
    return row.name.toLowerCase().includes(needle) || row.relPath.toLowerCase().includes(needle);
  });
  const order = { name: 0, status: 1, path: 2 } as const;
  return [...matched].sort((a, b) => {
    if (order[list.sort] === 1) {
      const byStatus = STATUS_LABEL[statusOf(a)].localeCompare(STATUS_LABEL[statusOf(b)]);
      return byStatus !== 0 ? byStatus : a.name.localeCompare(b.name);
    }
    const key = list.sort === "path" ? a.relPath : a.name;
    const other = list.sort === "path" ? b.relPath : b.name;
    return key.localeCompare(other);
  });
}

/** What a row shows in the outputs column: one token per produced format. */
export function outputsLabel(outputs: readonly OutputFile[]): string {
  return outputs.map((file) => file.format.toUpperCase()).join(" · ");
}

export function statusTone(status: UploadStatus): string {
  if (status === "processed") return "text-emerald-300";
  if (status === "ready") return "text-sky-300";
  if (status === "partial" || status === "stale") return "text-amber-300";
  if (status === "failed") return "text-rose-300";
  if (status === "processing") return "text-indigo-300";
  return "text-slate-400";
}

export function packageStatusOf(row: UploadRow): ExportStatus | null {
  return row.record?.status ?? null;
}
