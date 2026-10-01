// viewpatch.ts — which parts of a `Partial<SelState>` write are persisted,
// undoable view settings and which are only reporting (RULE 10, request §3).
// One owner for the split and for the readable label of a view change.

import { filterLabel, sortLabel } from "../lib/reviewlabels";
import type { ListFilter } from "../lib/reviewfilter";
import type { SortState } from "../lib/reviewsort";
import type { SelState, ViewPatch } from "./state";

const VIEW_FIELDS = ["filter", "sort", "prefs", "watcher", "collapsed", "zoom", "sync", "autoNext"] as const;

export function splitPatch(part: Partial<SelState>): { view: ViewPatch; rest: Partial<SelState> } {
  const view: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(part)) {
    if ((VIEW_FIELDS as readonly string[]).includes(key)) view[key] = value;
    else rest[key] = value;
  }
  return { view: view as ViewPatch, rest: rest as Partial<SelState> };
}

/** A slider drag or filter typing is one gesture, so it becomes one entry. */
export function coalesceOfView(view: ViewPatch): string | undefined {
  if (!("prefs" in view) || Object.keys(view).length !== 1) return undefined;
  return "thumb";
}

export function viewPatchLabel(view: ViewPatch): string {
  return Object.keys(view).map((k) => fieldLabel(k, view[k as keyof ViewPatch])).join(" · ");
}

/** One label per view field — a table, not a branch chain (RULE 19 step 2). */
const FIELD_LABELS: Record<string, (value: unknown) => string> = {
  watcher: (v) => `Watcher: ${v ? "active" : "paused"}`,
  collapsed: (v) => `List: ${v ? "collapsed" : "expanded"}`,
  zoom: (v) => `Compare zoom: ${v === "full" ? "1:1" : "fit"}`,
  sync: (v) => `Synced scrolling: ${v ? "on" : "off"}`,
  autoNext: (v) => `Auto-next: ${v ? "on" : "off"}`,
  prefs: (v) => `Layout/zoom: ${prefsText(v as { mode: string; thumbHeight: number })}`,
  filter: (v) => filterLabel(v as ListFilter),
  sort: (v) => sortLabel(v as SortState),
};

export function fieldLabel(field: string, value: unknown): string {
  return FIELD_LABELS[field]?.(value) ?? `${field} changed`;
}

function prefsText(p: { mode: string; thumbHeight: number }): string {
  return `${p.mode} · ${p.thumbHeight} px`;
}
