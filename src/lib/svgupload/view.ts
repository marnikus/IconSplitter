// view.ts — the list controls of the SVG-to-upload tab (design §2). Search,
// filter and sort as PURE rules: the rows come from `rows.ts`, the user's
// choices from the panel, and the answer is one deterministic list. Two things
// the request insists on are encoded here: a blocked or warned icon is never
// hidden by a filter unless the user asked for exactly that, and equal keys fall
// back to the id, so a rescan cannot reshuffle a list the user is working in.

import { compareNames } from "../scan";
import type { UploadRow } from "./rows";

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
  return {
    icons: rows.length,
    ready: rows.filter((r) => r.blocked === null && r.warnings.length === 0).length,
    blocked: rows.filter((r) => r.blocked !== null).length,
    warned: rows.filter((r) => r.blocked === null && r.warnings.length > 0).length,
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
