// batchprefs.ts — persistence for Batch folders zoom + filters (RULE 13)
// Stores thumb height (48-800 via lib/zoom) + filter + sort in localStorage.

import { clampZoom, ZOOM_DEFAULT } from "./zoom";
import { ALL_BATCH_FILTER, parseBatchFilter, type BatchFilter } from "./batchfilter";
import { DEFAULT_BATCH_SORT, parseBatchSort, type BatchSort } from "./batchsort";
import { isRecord } from "./isrecord";

export const BATCH_PREFS_KEY = "batch-prefs-v1";

export interface BatchPrefs {
  thumb: number;
  filter: BatchFilter;
  sort: BatchSort;
}

export const DEFAULT_BATCH_PREFS: BatchPrefs = {
  thumb: ZOOM_DEFAULT,
  filter: ALL_BATCH_FILTER,
  sort: DEFAULT_BATCH_SORT,
};

export function loadBatchPrefs(): BatchPrefs {
  try {
    const raw = localStorage.getItem(BATCH_PREFS_KEY);
    if (!raw) return DEFAULT_BATCH_PREFS;
    return parseBatchPrefs(JSON.parse(raw));
  } catch {
    return DEFAULT_BATCH_PREFS;
  }
}

export function saveBatchPrefs(p: BatchPrefs): void {
  try {
    localStorage.setItem(BATCH_PREFS_KEY, JSON.stringify(p));
  } catch {}
}

export function parseBatchPrefs(raw: unknown): BatchPrefs {
  if (!isRecord(raw)) return DEFAULT_BATCH_PREFS;
  return {
    thumb: clampZoom(typeof raw.thumb === "number" ? raw.thumb : ZOOM_DEFAULT),
    filter: parseBatchFilter(raw.filter),
    sort: parseBatchSort(raw.sort),
  };
}
