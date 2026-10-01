// rowmodel.ts — the Generate SVG list model (prompt §2).
// Owns: turning a source + its sidecar into one row, the newest-valid and
// approved lookups, filter+sort through lib/svglist, the header checkbox state,
// and dropping checked ids a rescan removed. Pure except for the store write.

import { approvedVersion, newestValid, type SvgSidecar, type SvgVersion } from "../lib/svgfile";
import { applySvgFilters, sortSvgRows, type SvgListFilter, type SvgListRow, type SvgSort } from "../lib/svglist";
import { getAppState, patchSvg } from "../state/appstore";
import type { SvgSource } from "./sources";
import type { SvgRow } from "./types";

/** The newest valid version: what the row previews AND what Copy reads. */
export interface SvgTarget {
  version: number;
  svgPath: string;
}

export function toRow(source: SvgSource, sidecar: SvgSidecar | null, corrupt: boolean): SvgRow {
  const newest = newestValid(sidecar);
  const failed = (sidecar?.versions ?? []).some((v) => v.status !== "generated");
  return {
    source, sidecar, corrupt, newest, approved: approvedVersion(sidecar), running: false,
    status: newest ? "generated" : failed ? "failed" : "not-generated",
    error: (sidecar?.versions ?? []).filter((v) => v.error).at(-1)?.error ?? null,
  };
}

/**
 * The ONE version the row previews, copies and shows code for. Both halves
 * read it, so the preview can never show a different version than Copy hands
 * to the clipboard.
 */
export function previewTargetOf(row: SvgRow): SvgTarget | null {
  const version = row.newest;
  if (version === null || version.svgPath === "") return null;
  return { version: version.version, svgPath: version.svgPath };
}

export function toListRow(row: SvgRow): SvgListRow {
  const v = row.newest;
  return {
    id: row.source.id, name: row.source.name, relPath: row.source.relPath,
    generation: row.status, review: v?.review ?? "pending", ...versionFields(v),
  };
}

/** The newest version's list fields; nothing generated means nothing to show. */
function versionFields(v: SvgVersion | null): Pick<SvgListRow, "generatedAt" | "cost" | "tokens" | "version"> {
  if (v === null) return { generatedAt: null, cost: null, tokens: null, version: 0 };
  return {
    generatedAt: Date.parse(v.completedAt ?? v.requestedAt),
    cost: v.cost.actual, tokens: v.usage.total, version: v.version,
  };
}

/** Filter + sort a copy of the rows; the caller's array is never reordered. */
export function visibleRows(rows: SvgRow[], filter: SvgListFilter, sort: SvgSort): SvgRow[] {
  const byId = new Map(rows.map((r) => [r.source.id, r]));
  return sortSvgRows(applySvgFilters([...byId.values()].map(toListRow), filter), sort)
    .flatMap((l) => {
      const row = byId.get(l.id);
      return row ? [row] : [];
    });
}

/** Header checkbox state for the visible rows (indeterminate = some). */
export function headerState(visible: SvgRow[], checked: string[]): "none" | "some" | "all" {
  if (visible.length === 0) return "none";
  const on = visible.filter((r) => checked.includes(r.source.id)).length;
  if (on === 0) return "none";
  return on === visible.length ? "all" : "some";
}

/** A restored check must never point at a source the rescan removed. */
export function pruneChecked(rows: SvgRow[]): void {
  const known = new Set(rows.map((r) => r.source.id));
  const kept = getAppState().svg.checked.filter((id) => known.has(id));
  if (kept.length !== getAppState().svg.checked.length) patchSvg({ checked: kept });
}
