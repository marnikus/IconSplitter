// useBatchView.ts — view layer for Batch folders (filter, sort, zoom, V2 selection)

import { useCallback, useEffect, useMemo, useState } from "react";
import { useBatch } from "./useBatch";
import { applyBatchFilters, type BatchFilter } from "../lib/batchfilter";
import { sortBatchRows, type BatchSort } from "../lib/batchsort";
import { loadBatchPrefs, saveBatchPrefs, type BatchPrefs } from "../lib/batchprefs";
import { clampZoom } from "../lib/zoom";
import { useBatchSelection, type BatchSelection } from "./useBatchSelection";
import type { CheckState, SelectIntent } from "../lib/reviewselect";

type BatchApi = ReturnType<typeof useBatch>;

export interface BatchView {
  core: BatchApi; filter: BatchFilter; sort: BatchSort; thumb: number;
  visible: BatchApi["s"]["rows"]; header: CheckState;
  checkedCount: number; visibleCount: number; totalCount: number;
  selectedCount: number; hiddenCount: number; affectedCount: number;
  activeId: string | null; anchorId: string | null;
  setFilter: (f: BatchFilter) => void; setSort: (s: BatchSort) => void;
  setThumb: (px: number) => void;
  toggle: (relPath: string) => void; toggleCheck: (relPath: string) => void;
  checkVisible: () => void; uncheckAll: () => void; toggleAllVisible: (on: boolean) => void;
  selectRow: (id: string, intent: SelectIntent) => void;
  moveActive: (step: 1 | -1) => void; selectActive: (id: string) => void;
  checkActive: () => void; uncheckActive: () => void;
}

export function useBatchView(): BatchView {
  const core = useBatch();
  const prefsState = usePrefsState();
  const visible = useVisibleRows(core.s.rows, prefsState.prefs.filter, prefsState.prefs.sort);
  const sel = useBatchSelection(core as never, visible as never);
  return makeView(core, prefsState, visible, sel);
}

function makeView(core: BatchApi, ps: ReturnType<typeof usePrefsState>, visible: BatchApi["s"]["rows"], sel: BatchSelection): BatchView {
  return {
    core, filter: ps.prefs.filter, sort: ps.prefs.sort, thumb: ps.prefs.thumb, visible,
    header: sel.header, checkedCount: sel.checkedCount, visibleCount: sel.visibleCount,
    totalCount: sel.totalCount, selectedCount: sel.checkedCount, hiddenCount: sel.hiddenCount,
    affectedCount: sel.affectedCount, activeId: sel.activeId, anchorId: sel.anchorId,
    setFilter: ps.setFilter, setSort: ps.setSort, setThumb: ps.setThumb,
    toggle: sel.toggleCheck, toggleCheck: sel.toggleCheck, checkVisible: sel.checkVisible,
    uncheckAll: sel.uncheckAll, toggleAllVisible: sel.toggleAllVisible,
    selectRow: sel.selectRow, moveActive: sel.moveActive, selectActive: sel.selectActive,
    checkActive: sel.checkActive, uncheckActive: sel.uncheckActive,
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
