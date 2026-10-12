// useBatchSelection.ts — Batch folders selection with V2 behaviors
// Reuses reviewselect and V2 patterns, one undo per gesture, anchor survives.

import { useCallback, useEffect, useMemo } from "react";
import { getAppState, patchBatch } from "../state/appstore";
import { useAppState } from "../state/useAppState";
import { useOptionalHistory } from "../state/HistoryProvider";
import {
  checkState, checkedInView, selectOne, selectRange,
  setChecked, toggleChecked, type CheckState, type SelectIntent,
} from "../lib/reviewselect";

type BatchRow = { relPath: string; status: string };
type BatchCore = { s: { rows: BatchRow[] }; setSelected: (r: string[], on: boolean) => void; };

export interface BatchSelection {
  checked: string[]; activeId: string | null; anchorId: string | null;
  visible: BatchRow[]; header: CheckState;
  checkedCount: number; visibleCount: number; totalCount: number;
  hiddenCount: number; affectedCount: number;
  selectRow: (id: string, intent: SelectIntent) => void;
  toggleCheck: (id: string) => void;
  checkVisible: () => void; uncheckAll: () => void;
  toggleAllVisible: (on: boolean) => void;
  moveActive: (step: 1 | -1) => void; selectActive: (id: string) => void;
  checkActive: () => void; uncheckActive: () => void;
}

function selectableRows(rows: BatchRow[]): BatchRow[] {
  return rows.filter((r) => r.status !== "missing" && r.status !== "deleted");
}
function selectableIds(rows: BatchRow[]): string[] {
  return selectableRows(rows).map((r) => r.relPath);
}
function toLowerSet(ids: readonly string[]): Set<string> {
  return new Set(ids.map((id) => id.toLowerCase()));
}
function isRowSelected(rows: BatchRow[], rel: string): boolean {
  const r = rows.find((x) => x.relPath.toLowerCase() === rel.toLowerCase()) as { selected?: boolean } | undefined;
  return !!r?.selected;
}
function selectionLabel(ids: string[]): string {
  if (ids.length === 0) return "Clear selection";
  return ids.length === 1 ? "Select a row" : `Select ${ids.length} rows`;
}

function useSyncCoreRows(core: BatchCore, checked: string[]): void {
  useEffect(() => {
    const known = new Set(core.s.rows.map((r) => r.relPath.toLowerCase()));
    const pruned = checked.filter((id) => known.has(id.toLowerCase()));
    if (pruned.length !== checked.length) patchBatch({ checked: pruned });
    const set = toLowerSet(pruned);
    const toCheck = core.s.rows.filter((r) => set.has(r.relPath.toLowerCase()) && !isRowSelected(core.s.rows, r.relPath)).map((r) => r.relPath);
    const toUncheck = core.s.rows.filter((r) => !set.has(r.relPath.toLowerCase()) && isRowSelected(core.s.rows, r.relPath)).map((r) => r.relPath);
    if (toCheck.length) core.setSelected(toCheck, true);
    if (toUncheck.length) core.setSelected(toUncheck, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [core.s.rows, checked]);
}

function useBatchHeader(visible: BatchRow[], checked: string[]): CheckState {
  return useMemo(() => checkState(selectableIds(visible), checked), [checked, visible]);
}
function useBatchCounts(core: BatchCore, visible: BatchRow[], checked: string[]) {
  const checkedCount = checked.length;
  const visibleCount = visible.length;
  const totalCount = core.s.rows.length;
  const hiddenCount = useMemo(() => {
    const vis = new Set(visible.map((r) => r.relPath.toLowerCase()));
    return checked.filter((id) => !vis.has(id.toLowerCase())).length;
  }, [checked, visible]);
  const affectedCount = useMemo(() => checkedInView(selectableIds(visible), checked).length, [checked, visible]);
  return { checkedCount, visibleCount, totalCount, hiddenCount, affectedCount };
}

type PushFn = (label: string, before: { ids: string[]; anchor: string | null; active: string | null }, after: { ids: string[]; anchor: string | null; active: string | null }, changed: string[]) => void;
function usePushBatchChecked(): PushFn {
  const hist = useOptionalHistory();
  return useCallback((label, before, after, changed) => {
    if (!hist) return;
    hist.pushGesture({
      type: "batchChecked", label, origin: getAppState().tab, ids: changed,
      before: { ids: before.ids, anchor: before.anchor, active: before.active },
      after: { ids: after.ids, anchor: after.anchor, active: after.active },
    });
  }, [hist]);
}

function useApplySelect(visible: BatchRow[], push: PushFn) {
  return useCallback((id: string, intent: SelectIntent) => {
    const before = getAppState().batch;
    const vIds = selectableIds(visible);
    if (vIds.length === 0) return;
    const nextIds = intent === "range" ? selectRange(vIds, before.anchorId, id) : intent === "toggle" ? toggleChecked(before.checked, id) : selectOne(id);
    const nextAnchor = intent === "toggle" ? before.anchorId : id;
    const changed = intent === "range" ? nextIds : [id];
    push(selectionLabel(nextIds), { ids: before.checked, anchor: before.anchorId, active: before.activeId }, { ids: nextIds, anchor: nextAnchor, active: id }, changed);
    patchBatch({ checked: nextIds, anchorId: nextAnchor, activeId: id });
  }, [visible, push]);
}
function useToggleCheck(push: PushFn) {
  return useCallback((id: string) => {
    const b = getAppState().batch;
    const next = toggleChecked(b.checked, id);
    push(selectionLabel(next), { ids: b.checked, anchor: b.anchorId, active: b.activeId }, { ids: next, anchor: b.anchorId, active: b.activeId }, [id]);
    patchBatch({ checked: next });
  }, [push]);
}
function useCheckVisible(visible: BatchRow[], push: PushFn) {
  return useCallback(() => {
    const b = getAppState().batch;
    const ids = selectableIds(visible);
    if (ids.length === 0) return;
    const next = setChecked(b.checked, ids, true);
    push("Select visible", { ids: b.checked, anchor: b.anchorId, active: b.activeId }, { ids: next, anchor: b.anchorId, active: b.activeId }, ids);
    patchBatch({ checked: next });
  }, [visible, push]);
}
function useUncheckAll(push: PushFn) {
  return useCallback(() => {
    const b = getAppState().batch;
    if (b.checked.length === 0) return;
    push("Deselect all", { ids: b.checked, anchor: b.anchorId, active: b.activeId }, { ids: [], anchor: b.anchorId, active: b.activeId }, b.checked);
    patchBatch({ checked: [] });
  }, [push]);
}
function useToggleAllVisible(visible: BatchRow[], push: PushFn) {
  return useCallback((on: boolean) => {
    const b = getAppState().batch;
    const ids = selectableIds(visible);
    const next = setChecked(b.checked, ids, on);
    const label = on ? "Select visible" : "Deselect visible";
    push(label, { ids: b.checked, anchor: b.anchorId, active: b.activeId }, { ids: next, anchor: b.anchorId, active: b.activeId }, ids);
    patchBatch({ checked: next });
  }, [visible, push]);
}
function useMoveActive(visible: BatchRow[], push: PushFn) {
  return useCallback((step: 1 | -1) => {
    const b = getAppState().batch;
    const vIds = selectableIds(visible);
    if (vIds.length === 0) return;
    const cur = b.activeId ? vIds.findIndex((v) => v.toLowerCase() === b.activeId!.toLowerCase()) : -1;
    const nxtIdx = cur === -1 ? (step === 1 ? 0 : vIds.length - 1) : Math.min(Math.max(cur + step, 0), vIds.length - 1);
    const nxt = vIds[nxtIdx];
    if (!nxt || nxt === b.activeId) return;
    push("Move active row", { ids: b.checked, anchor: b.anchorId, active: b.activeId }, { ids: b.checked, anchor: b.anchorId, active: nxt }, [nxt]);
    patchBatch({ activeId: nxt });
  }, [visible, push]);
}
function useSelectActive(push: PushFn) {
  return useCallback((id: string) => {
    const b = getAppState().batch;
    if (b.activeId === id) return;
    push("Select row", { ids: b.checked, anchor: b.anchorId, active: b.activeId }, { ids: b.checked, anchor: b.anchorId, active: id }, [id]);
    patchBatch({ activeId: id });
  }, [push]);
}
function useCheckActive(push: PushFn) {
  return useCallback(() => {
    const b = getAppState().batch;
    const id = b.activeId;
    if (!id) return;
    if (b.checked.some((x) => x.toLowerCase() === id.toLowerCase())) return;
    const next = setChecked(b.checked, [id], true);
    push("Select active row", { ids: b.checked, anchor: b.anchorId, active: b.activeId }, { ids: next, anchor: b.anchorId, active: b.activeId }, [id]);
    patchBatch({ checked: next });
  }, [push]);
}
function useUncheckActive(push: PushFn) {
  return useCallback(() => {
    const b = getAppState().batch;
    const id = b.activeId;
    if (!id) return;
    if (!b.checked.some((x) => x.toLowerCase() === id.toLowerCase())) return;
    const next = setChecked(b.checked, [id], false);
    push("Deselect active row", { ids: b.checked, anchor: b.anchorId, active: b.activeId }, { ids: next, anchor: b.anchorId, active: b.activeId }, [id]);
    patchBatch({ checked: next });
  }, [push]);
}

export function useBatchSelection(core: BatchCore, visible: BatchRow[]): BatchSelection {
  const app = useAppState();
  const { checked, activeId, anchorId } = app.batch;
  useSyncCoreRows(core, checked);
  const header = useBatchHeader(visible, checked);
  const counts = useBatchCounts(core, visible, checked);
  const push = usePushBatchChecked();
  const selectRow = useApplySelect(visible, push);
  const toggleCheck = useToggleCheck(push);
  const checkVisible = useCheckVisible(visible, push);
  const uncheckAll = useUncheckAll(push);
  const toggleAllVisible = useToggleAllVisible(visible, push);
  const moveActive = useMoveActive(visible, push);
  const selectActive = useSelectActive(push);
  const checkActive = useCheckActive(push);
  const uncheckActive = useUncheckActive(push);
  return {
    checked, activeId, anchorId, visible, header,
    checkedCount: counts.checkedCount, visibleCount: counts.visibleCount,
    totalCount: counts.totalCount, hiddenCount: counts.hiddenCount,
    affectedCount: counts.affectedCount,
    selectRow, toggleCheck, checkVisible, uncheckAll,
    toggleAllVisible, moveActive, selectActive, checkActive, uncheckActive,
  };
}
