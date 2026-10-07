// view.ts — the list controls of the SVG-to-upload tab (design §2). Search,
// filter and sort as PURE rules: the rows come from `rows.ts`, the user's
// choices from the panel, and the answer is one deterministic list. Two things
// the request insists on are encoded here: a blocked or warned icon is never
// hidden by a filter unless the user asked for exactly that, and equal keys fall
// back to the id, so a rescan cannot reshuffle a list the user is working in.

import { compareNames } from "../scan";
import { isEligible, isStale, type UploadRow } from "./rows";

export type UploadSort = "path" | "name" | "version" | "state";
export type UploadOnly = "all" | "ready" | "blocked" | "warnings";

export interface UploadView {
  search: string;
  sort: UploadSort;
  only: UploadOnly;
}

export const DEFAULT_UPLOAD_VIEW: UploadView = { search: "", sort: "path", only: "all" };

export interface UploadCounts {
  icons: number;
  ready: number;
  blocked: number;
  /** Rows with a problem other than being blocked outright. */
  warned: number;
  /** Can be exported at all (has a source and nothing blocks it). */
  eligible: number;
  /** Eligible but with no accepted metadata for the current source yet. */
  awaitingMeta: number;
  /** A job is running or waiting for a slot. */
  processing: number;
  /** Exported and verified — the only green number in the bar. */
  processed: number;
  /** The source or the package moved on: metadata or outputs need attention. */
  stale: number;
  /** The last job for these icons did not finish. */
  failed: number;
}

/**
 * What "select all" may act on: the VISIBLE rows an action can use. A hidden
 * selected row is never touched by it — the user filtered it out on purpose — and
 * a blocked row is never selected by it, because nothing can be done with it.
 */
export function checkableIds(rows: readonly UploadRow[]): string[] {
  return rows.filter(isEligible).map((r) => r.id);
}

/** The selection after the header checkbox moved: additive on, subtractive off. */
export function toggleSelection(current: readonly string[], checkable: readonly string[], on: boolean): string[] {
  if (!on) return current.filter((id) => !checkable.includes(id));
  return [...new Set([...current, ...checkable])];
}

/** The rows the list shows, in the user's order. */
export function visibleUploadRows(rows: readonly UploadRow[], view: UploadView): UploadRow[] {
  const needle = view.search.trim().toLowerCase();
  return rows
    .filter((r) => matchesOnly(r, view.only))
    .filter((r) => needle === "" || r.name.toLowerCase().includes(needle) || r.dirPath.toLowerCase().includes(needle))
    .slice()
    .sort((a, b) => compare(a, b, view.sort));
}

export function uploadCounts(rows: readonly UploadRow[]): UploadCounts {
  const live = rows.filter(isEligible); // a blocked row is its own bucket, never "processing"
  return {
    icons: rows.length,
    ready: rows.filter((r) => r.blocked === null && r.warnings.length === 0).length,
    blocked: rows.filter((r) => r.blocked !== null).length,
    warned: rows.filter((r) => r.blocked === null && r.warnings.length > 0).length,
    eligible: live.length,
    awaitingMeta: live.filter((r) => r.metaState !== "accepted").length,
    processing: live.filter((r) => r.job === "running" || r.job === "queued").length,
    processed: live.filter((r) => r.job === "processed").length,
    stale: live.filter(isStale).length,
    failed: live.filter((r) => r.job === "failed" || r.job === "interrupted").length,
  };
}

function matchesOnly(row: UploadRow, only: UploadOnly): boolean {
  if (only === "ready") return row.blocked === null && row.warnings.length === 0;
  if (only === "blocked") return row.blocked !== null;
  if (only === "warnings") return row.blocked === null && row.warnings.length > 0;
  return true;
}

function compare(a: UploadRow, b: UploadRow, sort: UploadSort): number {
  const byKey = keyCompare(a, b, sort);
  return byKey !== 0 ? byKey : compareNames(a.id, b.id);
}

function keyCompare(a: UploadRow, b: UploadRow, sort: UploadSort): number {
  if (sort === "name") return compareNames(a.name, b.name);
  if (sort === "version") return (b.version ?? -1) - (a.version ?? -1);
  if (sort === "state") return rank(a) - rank(b);
  return compareNames(a.dirPath, b.dirPath) || compareNames(a.name, b.name);
}

/** Problems first: a blocked row is what the user must see (request §2). */
function rank(row: UploadRow): number {
  if (row.blocked !== null) return 0;
  return row.warnings.length > 0 ? 1 : 2;
}
