// rowmodel.ts — the Generate SVG list model (prompt §2).
// Owns: turning a source + its pair file into one row, the newest-valid and
// approved lookups, filter+sort through lib/svglist, the header checkbox state,
// and dropping checked ids a rescan removed. Pure except for the store write.

import { approvedVersion, chosenVersion, newestValid, preferredVersion, SVG_EXT } from "../lib/svgfile";
import type { SvgVersion } from "../lib/svgmodel";
import type { PairMeta } from "../lib/pairmeta";
import { ALL_SVG_FILTER, applySvgFilters, pinOrder, sortSvgRows, type SvgListFilter, type SvgListRow, type SvgSort } from "../lib/svglist";
import { getAppState, patchSvg } from "../state/appstore";
import type { SvgSource } from "./sources";
import type { SvgRow } from "./types";
import { queuedIds, type QueueItem } from "./runqueue";

/** The newest valid version: what the row previews AND what Copy reads. */
export interface SvgTarget {
  version: number;
  svgPath: string;
}

export function toRow(source: SvgSource, meta: PairMeta | null, corrupt: boolean): SvgRow {
  const versions = meta?.versions ?? [];
  const failed = versions.some((v) => v.status !== "generated");
  const row = withMeta({
    source, meta, corrupt, running: false, status: "not-generated", error: null, queued: false,
    newest: null, preferred: null, approved: null,
  }, meta);
  return {
    ...row,
    status: row.newest ? "generated" : failed ? "failed" : "not-generated",
    error: versions.filter((v) => v.error).at(-1)?.error ?? null,
  };
}

/**
 * The same row with a new pair file: everything derived from the history is
 * re-read (newest, the chosen version, the approval), the live state the caller
 * owns (running, generation status, error) is kept. One place, so a write can
 * never leave the row's fields describing two different files.
 */
export function withMeta(row: SvgRow, meta: PairMeta | null): SvgRow {
  const versions = meta?.versions ?? [];
  return {
    ...row, meta,
    newest: newestValid(versions),
    preferred: preferredVersion(versions, meta?.preferred ?? null),
    approved: approvedVersion(versions),
  };
}

/**
 * The version the row SHOWS: the user's choice when it is usable, else the
 * newest valid one (I-54). The preview, Copy, Code, the decision buttons, the
 * hotkeys and the list's fields all ask this one question, so they can never
 * disagree — and the history behind it stays complete and re-choosable.
 */
export function shownVersion(row: SvgRow): SvgVersion | null {
  return chosenVersion(row.meta?.versions ?? [], row.meta?.preferred ?? null);
}

/**
 * The ONE version the row previews, copies and shows code for. Both halves
 * read it, so the preview can never show a different version than Copy hands
 * to the clipboard.
 */
export function previewTargetOf(row: SvgRow): SvgTarget | null {
  const version = shownVersion(row);
  if (version === null || version.svgPath === "") return null;
  return { version: version.version, svgPath: version.svgPath };
}

/**
 * The file a row is about: the shown version's saved SVG, or — before anything
 * was generated — the path the next one will be written to. `svg-target-{id}`
 * displays it and "Location" copies its folder, so the two can never disagree
 * (I-56): one helper, both readers.
 */
export function targetPathOf(row: SvgRow): string {
  const path = previewTargetOf(row)?.svgPath;
  return path && path !== "" ? path : joinPath(row.source.dirPath, `${row.source.stem}${SVG_EXT}`);
}

/** Joins a root-relative folder and a file name; used only for display paths. */
function joinPath(dir: string, name: string): string {
  return dir === "" ? name : `${dir}/${name}`;
}

export function toListRow(row: SvgRow): SvgListRow {
  const v = shownVersion(row);
  return {
    id: row.source.id, name: row.source.name, relPath: row.source.relPath,
    generation: row.status, review: v?.review ?? "pending", ...versionFields(v),
  };
}

/** The newest version's list fields; nothing generated means nothing to show. */
function versionFields(v: SvgVersion | null): Pick<SvgListRow, "generatedAt" | "cost" | "costEstimated" | "tokens" | "version"> {
  if (v === null) return { generatedAt: null, cost: null, costEstimated: false, tokens: null, version: 0 };
  return {
    generatedAt: Date.parse(v.completedAt ?? v.requestedAt),
    cost: v.cost.actual ?? v.cost.estimated,
    costEstimated: v.cost.actual === null && v.cost.estimated !== null,
    tokens: v.usage.total, version: v.version,
  };
}

/**
 * Filter + sort a copy of the rows; the caller's array is never reordered. With
 * an `order` (the pin, lib/svglist `pinOrder`) the sorted result is arranged by
 * it, so a landing SVG cannot move a row while the user looks at the list.
 */
export function visibleRows(rows: SvgRow[], filter: SvgListFilter, sort: SvgSort, order: readonly string[] = []): SvgRow[] {
  const byId = new Map(rows.map((r) => [r.source.id, r]));
  const sorted = sortSvgRows(applySvgFilters([...byId.values()].map(toListRow), filter), sort).map((l) => l.id);
  return pinOrder(order, sorted).flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

/** The rows with their "next attempt" flag: whoever waits in some batch, and is not the one in flight. */
export function withQueued(rows: SvgRow[], queue: readonly QueueItem[]): SvgRow[] {
  const waiting = queuedIds(queue);
  return rows.map((r) => (r.queued === waiting.has(r.source.id) ? r : { ...r, queued: waiting.has(r.source.id) }));
}

/** Every row's id in the sort's order — what the pin is refreshed from. */
export function sortedIds(rows: SvgRow[], sort: SvgSort): string[] {
  return visibleRows(rows, ALL_SVG_FILTER, sort).map((r) => r.source.id);
}

/** Selected ids that already have a valid SVG, preserving checkbox pick order. */
export function idsWithGeneratedSvg(rows: SvgRow[], ids: string[]): string[] {
  const generated = new Set(rows.filter((row) => row.newest !== null).map((row) => row.source.id));
  return ids.filter((id) => generated.has(id));
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
