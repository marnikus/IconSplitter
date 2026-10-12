// useBatchView.ts — view layer for Batch folders (filter, sort, zoom, filtered multi-select)
// Wraps useBatch core with V2-style controls. Split/export size stays separate.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useBatch } from "./useBatch";
import { applyBatchFilters, type BatchFilter } from "../lib/batchfilter";
import { sortBatchRows, type BatchSort } from "../lib/batchsort";
import { loadBatchPrefs, saveBatchPrefs, type BatchPrefs } from "../lib/batchprefs";
import { clampZoom } from "../lib/zoom";
import type { CheckState } from "../lib/reviewselect";

type BatchApi = ReturnType<typeof useBatch>;

export interface BatchView {
  core: BatchApi;
  filter: BatchFilter;
  sort: BatchSort;
  thumb: number;
  visible: BatchApi["s"]["rows"];
  header: CheckState;
  checkedCount: number;
  visibleCount: number;
  totalCount: number;
  selectedCount: number;
  setFilter: (f: BatchFilter) => void;
  setSort: (s: BatchSort) => void;
  setThumb: (px: number) => void;
  toggle: (relPath: string) => void;
  checkVisible: () => void;
  uncheckAll: () => void;
  toggleAllVisible: (on: boolean) => void;
}

export function useBatchView(): BatchView {
  const core = useBatch();
  const { prefs, setFilter, setSort, setThumb } = usePrefsState();
  const visible = useVisibleRows(core.s.rows, prefs.filter, prefs.sort);
  const header = useHeader(visible);
  const counts = useCounts(core.s.rows, visible);
  const actions = useSelectionActions(core, visible);

  return {
    core,
    filter: prefs.filter,
    sort: prefs.sort,
    thumb: prefs.thumb,
    visible,
    header,
    checkedCount: counts.checked,
    visibleCount: counts.visible,
    totalCount: counts.total,
    selectedCount: counts.checked,
    setFilter,
    setSort,
    setThumb,
    toggle: core.toggle,
    checkVisible: actions.checkVisible,
    uncheckAll: actions.uncheckAll,
    toggleAllVisible: actions.toggleAll,
  };
}

function usePrefsState() {
  const [prefs, setPrefs] = useState<BatchPrefs>(() => loadBatchPrefs());
  useEffect(() => { saveBatchPrefs(prefs); }, [prefs]);
  const setFilter = useCallback((f: BatchFilter) => setPrefs((p) => ({ ...p, filter: f })), []);
  const setSort = useCallback((s: BatchSort) => setPrefs((p) => ({ ...p, sort: s })), []);
  const setThumb = useCallback((px: number) => setPrefs((p) => ({ ...p, thumb: clampZoom(px) })), []);
  return { prefs, setFilter, setSort, setThumb };
}

function useVisibleRows(rows: BatchApi["s"]["rows"], filter: BatchFilter, sort: BatchSort) {
  return useMemo(() => {
    const filtered = applyBatchFilters(rows as never, filter) as BatchApi["s"]["rows"];
    return sortBatchRows(filtered as never, sort) as BatchApi["s"]["rows"];
  }, [rows, filter, sort]);
}

function useHeader(visible: BatchApi["s"]["rows"]): CheckState {
  return useMemo(() => {
    const selectable = visible.filter((r) => r.status !== "missing" && r.status !== "deleted");
    if (selectable.length === 0) return "none";
    const checked = selectable.filter((r) => r.selected).length;
    if (checked === 0) return "none";
    if (checked === selectable.length) return "all";
    return "some";
  }, [visible]);
}

function useCounts(rows: BatchApi["s"]["rows"], visible: BatchApi["s"]["rows"]) {
  const checked = useMemo(() => rows.filter((r) => r.selected).length, [rows]);
  return { checked, visible: visible.length, total: rows.length };
}

function useSelectionActions(core: BatchApi, visible: BatchApi["s"]["rows"]) {
  const checkVisible = useCallback(() => {
    const rels = selectableRels(visible);
    core.setSelected(rels, true);
  }, [core, visible]);

  const uncheckAll = useCallback(() => {
    core.setSelected(core.s.rows.map((r) => r.relPath), false);
  }, [core]);

  const toggleAll = useCallback((on: boolean) => {
    core.setSelected(selectableRels(visible), on);
  }, [core, visible]);

  return { checkVisible, uncheckAll, toggleAll };
}

function selectableRels(rows: BatchApi["s"]["rows"]): string[] {
  return rows.filter((r) => r.status !== "missing" && r.status !== "deleted").map((r) => r.relPath);
}
