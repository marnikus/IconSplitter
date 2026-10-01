// sort.ts — approved-source search, status filtering and stable SVG result order.

import type { SvgPreferences } from "./prefs";
import type { SvgSourceRow } from "./types";

export function filterAndSortSvgRows(rows: SvgSourceRow[], prefs: SvgPreferences): SvgSourceRow[] {
  return rows.filter((row) => matchesSearch(row, prefs.search) && matchesGeneration(row, prefs.generationFilter)
    && (prefs.reviewFilter === "all" || row.review === prefs.reviewFilter)).sort((a, b) => compareRows(a, b, prefs));
}

function matchesSearch(row: SvgSourceRow, search: string): boolean {
  const needle = search.trim().toLocaleLowerCase();
  if (!needle) return true;
  const versions = row.versions.map((version) => `v${version.version} ${version.path} ${version.model}`).join(" ");
  return `${row.filename} ${row.relativePath} ${row.generation} ${row.review} ${versions}`.toLocaleLowerCase().includes(needle);
}

function matchesGeneration(row: SvgSourceRow, filter: SvgPreferences["generationFilter"]): boolean {
  if (filter === "all") return true;
  if (filter === "generated") return ["generated", "recovered", "recoverable"].includes(row.generation);
  return row.generation === filter;
}

function compareRows(a: SvgSourceRow, b: SvgSourceRow, prefs: SvgPreferences): number {
  const sign = prefs.sortDirection === "asc" ? 1 : -1;
  const primary = primaryValue(a, prefs.sortBy).localeCompare(primaryValue(b, prefs.sortBy), undefined, { numeric: true });
  if (primary !== 0) return primary * sign;
  return a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: "base" });
}

function primaryValue(row: SvgSourceRow, sort: SvgPreferences["sortBy"]): string {
  const newest = row.versions.at(-1);
  if (sort === "name") return row.filename.toLocaleLowerCase();
  if (sort === "generation") return generationRank(row.generation);
  if (sort === "review") return reviewRank(row.review);
  if (sort === "cost") return String(newest?.usage.actualCostUsd ?? -1).padStart(18, "0");
  return String(Date.parse(newest?.createdAt ?? "") || 0).padStart(16, "0");
}

function generationRank(value: SvgSourceRow["generation"]): string {
  const order: SvgSourceRow["generation"][] = ["generating", "pending", "generated", "recovered", "recoverable", "failed", "unknown", "corrupt"];
  return String(order.indexOf(value)).padStart(2, "0");
}

function reviewRank(value: SvgSourceRow["review"]): string {
  const order = ["pending", "approved", "declined"];
  return String(order.indexOf(value)).padStart(2, "0");
}
