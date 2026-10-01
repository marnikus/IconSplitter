// session.ts — the persisted app session (request §1, RULE 13). Pure model:
// schema, per-field validation with fallbacks, stale-id sanitising and the
// restore policy. Storage IO lives in `src/session/sessionstore.ts`; the mirror
// of the review slice in `src/session/selectionmirror.ts`.
//
// Contract (adapted from `Process-Images-in-Areana/app/persistence/config_manager.py`
// `SessionStore` — one JSON document with a DEFAULTS object, validated on read,
// unknown/retired keys dropped): a corrupt or foreign payload is fully replaced
// by the defaults, and each *field* is repaired on its own so one bad value
// never costs the whole session. Written once, whole, by the session store.

import { clampThumb, DEFAULT_PREFS, type ReviewPrefs } from "./reviewprefs";
import { ALL_FILTER, type ListFilter } from "./reviewfilter";
import { DEFAULT_SORT, type SortState } from "./reviewsort";

export const SESSION_VERSION = 1;

export const TABS = ["sheets", "batch", "selection", "selectionV2"] as const;
export type TabId = (typeof TABS)[number];

export const EXPORT_SIZES = [0, 128, 256, 512, 1024, 2048] as const;
const PAD_MAX = 40;
const SEARCH_MAX = 200;
export const SCROLL_SURFACES = ["v2-rows", "sel-list"] as const;

export interface SheetsSession {
  padding: number;
  size: number;
  transparent: boolean;
}

/** Everything a restart restores for the review surfaces (V1 and V2 share it). */
export interface ReviewSession {
  rootName: string;
  filter: ListFilter;
  sort: SortState;
  checked: string[];
  selectedId: string | null;
  prefs: ReviewPrefs;
  watcher: boolean;
  collapsed: boolean;
  zoom: "fit" | "full";
  sync: boolean;
  autoNext: boolean;
  scroll: Record<string, number>;
}

export interface AppSession {
  v: number;
  savedAt: number;
  tab: TabId;
  sheets: SheetsSession;
  review: ReviewSession | null;
}

export const DEFAULT_SESSION: AppSession = {
  v: SESSION_VERSION,
  savedAt: 0,
  tab: "sheets",
  sheets: { padding: 6, size: 512, transparent: false },
  review: null,
};

export function defaultReviewSession(): ReviewSession {
  return {
    rootName: "",
    filter: ALL_FILTER,
    sort: DEFAULT_SORT,
    checked: [],
    selectedId: null,
    prefs: { ...DEFAULT_PREFS },
    watcher: true,
    collapsed: false,
    zoom: "fit",
    sync: true,
    autoNext: true,
    scroll: {},
  };
}

export function serializeSession(s: AppSession): string {
  return JSON.stringify(s);
}

/** Stored JSON → session; corrupt/foreign payload → defaults (RULE 13). */
export function parseSession(text: string | null): AppSession {
  const raw = readObject(text);
  if (!raw || raw.v !== SESSION_VERSION) return DEFAULT_SESSION;
  return {
    v: SESSION_VERSION,
    savedAt: num(raw.savedAt, 0),
    tab: toTab(raw.tab),
    sheets: parseSheets(raw.sheets),
    review: parseReview(raw.review),
  };
}

/** A store that no user change has touched yet may accept the restore. */
export function isPristineReview(state: { rootName: string; pairCount: number }): boolean {
  return state.rootName === "" && state.pairCount === 0;
}

export interface SanitizedReview {
  review: ReviewSession;
  dropped: number; // ids the current scan no longer has
}

/** Removes restored ids that the first scan proves gone (request §1). */
export function sanitizeReview(review: ReviewSession, known: ReadonlySet<string>): SanitizedReview {
  const checked = review.checked.filter((id) => known.has(id));
  const selectedId = review.selectedId && known.has(review.selectedId) ? review.selectedId : null;
  const dropped = review.checked.length - checked.length + (selectedId === review.selectedId ? 0 : 1);
  return { review: { ...review, checked, selectedId }, dropped };
}

function parseSheets(value: unknown): SheetsSession {
  const x = asObject(value);
  const size = num(x?.size, DEFAULT_SESSION.sheets.size);
  return {
    padding: clamp(num(x?.padding, DEFAULT_SESSION.sheets.padding), 0, PAD_MAX),
    size: (EXPORT_SIZES as readonly number[]).includes(size) ? size : DEFAULT_SESSION.sheets.size,
    transparent: x?.transparent === true,
  };
}

function parseReview(value: unknown): ReviewSession | null {
  const x = asObject(value);
  if (!x) return null;
  const base = defaultReviewSession();
  return {
    rootName: text(x.rootName, ""),
    filter: parseFilter(x.filter),
    sort: parseSort(x.sort),
    checked: stringList(x.checked),
    selectedId: typeof x.selectedId === "string" ? x.selectedId : null,
    prefs: parsePrefs(x.prefs),
    watcher: x.watcher !== false,
    collapsed: x.collapsed === true,
    zoom: x.zoom === "full" ? "full" : "fit",
    sync: x.sync !== false,
    autoNext: x.autoNext !== false,
    scroll: parseScroll(x.scroll, base.scroll),
  };
}

function parseFilter(value: unknown): ListFilter {
  const x = asObject(value);
  return {
    date: parseDate(x?.date),
    status: isOne(x?.status, ["all", "pending", "approved", "declined"]) ? x?.status as ListFilter["status"] : "all",
    search: text(x?.search, "").slice(0, SEARCH_MAX),
    pairing: isOne(x?.pairing, ["all", "complete", "incomplete"]) ? x?.pairing as ListFilter["pairing"] : "all",
  };
}

function parseDate(value: unknown): ListFilter["date"] {
  const x = asObject(value);
  if (x?.mode === "month" && typeof x.month === "string" && /^\d{4}-\d{2}$/.test(x.month)) {
    return { mode: "month", month: x.month };
  }
  if (x?.mode === "custom") {
    const a = num(x.from, 0);
    const b = num(x.to, 0);
    return { mode: "custom", from: Math.min(a, b), to: Math.max(a, b) };
  }
  return { mode: "all" };
}

function parseSort(value: unknown): SortState {
  const x = asObject(value);
  const by = x?.by;
  return {
    by: isOne(by, ["date", "status", "name", "path"]) ? by as SortState["by"] : DEFAULT_SORT.by,
    dir: x?.dir === "asc" ? "asc" : "desc",
  };
}

function parsePrefs(value: unknown): ReviewPrefs {
  const x = asObject(value);
  return { mode: x?.mode === "compare" ? "compare" : "list", thumbHeight: clampThumb(num(x?.thumbHeight, DEFAULT_PREFS.thumbHeight)) };
}

function parseScroll(value: unknown, fallback: Record<string, number>): Record<string, number> {
  const x = asObject(value);
  if (!x) return fallback;
  const out: Record<string, number> = {};
  for (const key of SCROLL_SURFACES) {
    const v = x[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[key] = Math.round(v);
  }
  return out;
}

/* ── primitives ──────────────────────────────────────────────────────────── */

function readObject(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const data: unknown = JSON.parse(text);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
    return data as Record<string, unknown>;
  } catch {
    return null; // corrupt payload: defaults win, never a crash (RULE 13)
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(value)));
}

function toTab(value: unknown): TabId {
  return (TABS as readonly unknown[]).includes(value) ? value as TabId : "sheets";
}

function isOne<T extends string>(value: unknown, allowed: readonly T[]): boolean {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string" && v !== ""))] : [];
}
