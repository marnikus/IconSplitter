// rowmodel.ts — the Generate SVG list model (prompt §2).
// Owns: turning a source + its sidecar into one row, the newest-valid and
// approved lookups, filter+sort through lib/svglist, the header checkbox state,
// and dropping checked ids a rescan removed. Pure except for the store write.

import { approvedVersion, type SvgSidecar, type SvgVersion } from "../lib/svgfile";
import { applySvgFilters, sortSvgRows, type SvgListFilter, type SvgListRow, type SvgSort } from "../lib/svglist";
import { getAppState, patchSvg } from "../state/appstore";
import type { SvgSource } from "./sources";
import type { SvgRow } from "./types";

export function toRow(source: SvgSource, sidecar: SvgSidecar | null, corrupt: boolean): SvgRow {
  const newest = newestValidOf(sidecar);
  const failed = (sidecar?.versions ?? []).some((v) => v.status !== "generated");
  return {
    source, sidecar, corrupt, newest, approved: approvedVersion(sidecar), running: false,
    status: newest ? "generated" : failed ? "failed" : "not-generated",
    error: (sidecar?.versions ?? []).filter((v) => v.error).at(-1)?.error ?? null,
  };
}

/** The version the preview shows: newest generated AND valid. */
export function newestValidOf(sidecar: SvgSidecar | null): SvgVersion | null {
  const list = (sidecar?.versions ?? []).filter((v) => v.status === "generated" && v.validation.ok);
  return list.length > 0 ? list[list.length - 1] : null;
}

export function toListRow(row: SvgRow): SvgListRow {
  return {
    id: row.source.id, name: row.source.name, relPath: row.source.relPath,
    generation: row.status, review: row.newest?.review ?? "pending",
    generatedAt: row.newest ? Date.parse(row.newest.completedAt ?? row.newest.requestedAt) : null,
    cost: row.newest?.cost.actual ?? null, tokens: row.newest?.usage.total ?? null,
    version: row.newest?.version ?? 0,
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
