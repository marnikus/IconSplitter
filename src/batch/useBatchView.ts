// useBatchView.ts — view layer for Batch folders + review

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBatch } from "./useBatch";
import { applyBatchFilters, type BatchFilter } from "../lib/batchfilter";
import { sortBatchRows, type BatchSort } from "../lib/batchsort";
import { loadBatchPrefs, saveBatchPrefs, type BatchPrefs } from "../lib/batchprefs";
import { clampZoom } from "../lib/zoom";
import { useBatchSelection, type BatchSelection } from "./useBatchSelection";
import { nextPendingBelow, type CheckState, type SelectIntent } from "../lib/reviewselect";
import type { Row, RowMergeMap } from "./useBatch";
import { patchBatch } from "../state/appstore";
import type { BatchReviewStatus } from "../lib/statefile";

type BatchApi = ReturnType<typeof useBatch>;

export interface BatchView {
  core: BatchApi;
  filter: BatchFilter;
  sort: BatchSort;
  thumb: number;
  visible: Row[];
  header: CheckState;
  checkedCount: number;
  visibleCount: number;
  totalCount: number;
  selectedCount: number;
  hiddenCount: number;
  affectedCount: number;
  activeId: string | null;
  anchorId: string | null;
  rowMerges: RowMergeMap;
  reviewCounts: { approved: number; declined: number; warning: number; pending: number };
  decidableCount: number;
  approvedSelectedCount: number;
  setFilter: (f: BatchFilter) => void;
  setSort: (s: BatchSort) => void;
  setThumb: (px: number) => void;
  toggle: (relPath: string) => void;
  toggleCheck: (relPath: string) => void;
  checkVisible: () => void;
  uncheckAll: () => void;
  toggleAllVisible: (on: boolean) => void;
  selectRow: (id: string, intent: SelectIntent) => void;
  moveActive: (step: 1 | -1) => void;
  selectActive: (id: string) => void;
  checkActive: () => void;
  uncheckActive: () => void;
  setRowMerge: (relPath: string, v: number | null) => void;
  clearRowMerge: (relPath: string) => void;
  decide: (ids: string[], review: BatchReviewStatus) => void;
  decideActive: (review: BatchReviewStatus) => void;
}

export function useBatchView(): BatchView {
  const core = useBatch();
  const ps = usePrefsState();
  const visible = useVisibleRows(core.s.rows, ps.prefs.filter, ps.prefs.sort);
  const sel = useBatchSelection(core, visible);
  const reviewCounts = useReviewCounts(core.s.rows);
  const decidableCount = useDecidableCount(core, sel);
  const approvedSelectedCount = useApprovedSelectedCount(core, sel);
  const visibleRef = useRef(visible); visibleRef.current = visible;
  // Stable callbacks: closures rebuilt per render made `v.decide` new on every
  // render, which re-ran every downstream effect (the scroll CPU spike).
  const decide = useCallback((ids: string[], review: BatchReviewStatus) => {
    advanceBatchReview(visibleRef.current, ids, review);
    core.decide(ids, review);
  }, [core.decide]);
  const decideActive = useCallback((review: BatchReviewStatus) => {
    const active = sel.activeId;
    if (active) decide([active], review);
  }, [sel.activeId, decide]);
  return useMemo(() => makeView({ core, ps, visible, sel, reviewCounts, decidableCount, approvedSelectedCount, decide, decideActive }),
    [core, ps, visible, sel, reviewCounts, decidableCount, approvedSelectedCount, decide, decideActive]);
}

type ViewArgs = { core: BatchApi; ps: ReturnType<typeof usePrefsState>; visible: Row[]; sel: BatchSelection; reviewCounts: BatchView["reviewCounts"]; decidableCount: number; approvedSelectedCount: number; decide: BatchView["decide"]; decideActive: BatchView["decideActive"] };

function makeView(a: ViewArgs): BatchView {
  const { core, ps, visible, sel, decide, decideActive } = a;
  return {
    core, filter: ps.prefs.filter, sort: ps.prefs.sort, thumb: ps.prefs.thumb, visible,
    header: sel.header, checkedCount: sel.checkedCount, visibleCount: sel.visibleCount,
    totalCount: sel.totalCount, selectedCount: sel.checkedCount, hiddenCount: sel.hiddenCount,
    affectedCount: sel.affectedCount, activeId: sel.activeId, anchorId: sel.anchorId,
    rowMerges: core.s.rowMerges,
    reviewCounts: a.reviewCounts, decidableCount: a.decidableCount, approvedSelectedCount: a.approvedSelectedCount,
    setFilter: ps.setFilter, setSort: ps.setSort, setThumb: ps.setThumb,
    toggle: sel.toggleCheck, toggleCheck: sel.toggleCheck, checkVisible: sel.checkVisible,
    uncheckAll: sel.uncheckAll, toggleAllVisible: sel.toggleAllVisible, selectRow: sel.selectRow,
    moveActive: sel.moveActive, selectActive: sel.selectActive, checkActive: sel.checkActive, uncheckActive: sel.uncheckActive,
    setRowMerge: core.setRowMerge, clearRowMerge: core.clearRowMerge,
    decide, decideActive,
  };
}

function usePrefsState() {
  const [prefs, setPrefs] = useState<BatchPrefs>(() => loadBatchPrefs());
  useEffect(() => { saveBatchPrefs(prefs); }, [prefs]);
  const setFilter = useCallback((f: BatchFilter) => setPrefs((p) => ({ ...p, filter: f })), []);
  const setSort = useCallback((s: BatchSort) => setPrefs((p) => ({ ...p, sort: s })), []);
  const setThumb = useCallback((px: number) => setPrefs((p) => ({ ...p, thumb: clampZoom(px) })), []);
  return useMemo(() => ({ prefs, setFilter, setSort, setThumb }), [prefs, setFilter, setSort, setThumb]);
}

function useVisibleRows(rows: Row[], filter: BatchFilter, sort: BatchSort) {
  return useMemo(() => sortBatchRows(applyBatchFilters(rows, filter), sort), [rows, filter, sort]);
}

function useReviewCounts(rows: Row[]): BatchView["reviewCounts"] {
  return useMemo(() => {
    let approved = 0, declined = 0, warning = 0, pending = 0;
    for (const r of rows) {
      if (r.review === "approved") approved++;
      else if (r.review === "declined") declined++;
      else if (r.review === "warning") warning++;
      else pending++;
    }
    return { approved, declined, warning, pending };
  }, [rows]);
}

function useDecidableCount(core: BatchApi, sel: BatchSelection): number {
  return useMemo(() => {
    const set = new Set(sel.checked.map((id) => id.toLowerCase()));
    return core.s.rows.filter((r) => set.has(r.relPath.toLowerCase())).length;
  }, [core.s.rows, sel.checked]);
}

function useApprovedSelectedCount(core: BatchApi, sel: BatchSelection): number {
  return useMemo(() => {
    const set = new Set(sel.checked.map((id) => id.toLowerCase()));
    return core.s.rows.filter((r) => set.has(r.relPath.toLowerCase()) && r.review === "approved").length;
  }, [core.s.rows, sel.checked]);
}

/** Review navigation does not change checks or the Shift anchor. */
function advanceBatchReview(visible: Row[], ids: string[], review: BatchReviewStatus): void {
  if (ids.length !== 1 || (review !== "approved" && review !== "declined")) return;
  const next = nextPendingBelow(visible, ids[0].toLowerCase(), (r) => r.relPath.toLowerCase(), (r) => r.review === "pending");
  const row = visible.find((r) => r.relPath.toLowerCase() === next);
  if (row) patchBatch({ activeId: row.relPath });
}
