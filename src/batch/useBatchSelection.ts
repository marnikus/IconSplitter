// useBatchSelection.ts — Batch folders selection with V2 behaviors, refactored to reuse batchselect lib

import { useCallback, useEffect, useMemo } from "react";
import { getAppState, patchBatch } from "../state/appstore";
import { useAppState } from "../state/useAppState";
import { useOptionalHistory } from "../state/HistoryProvider";
import { applyRowGesture, checkState, checkedInView, nextVisibleId, sameRowSelection, setChecked, toggleChecked, type CheckState, type SelectIntent } from "../lib/reviewselect";
import { selectableIds, toLowerSet, isRowSelected, selectionLabel } from "../lib/batchselect";

type BatchRow = { relPath: string; status: string };
type BatchCore = { s: { rows: BatchRow[] }; setSelected: (r: string[], on: boolean) => void };

export interface BatchSelection {
  checked: string[];
  activeId: string | null;
  anchorId: string | null;
  visible: BatchRow[];
  header: CheckState;
  checkedCount: number;
  visibleCount: number;
  totalCount: number;
  hiddenCount: number;
  affectedCount: number;
  selectRow: (id: string, intent: SelectIntent) => void;
  toggleCheck: (id: string) => void;
  checkVisible: () => void;
  uncheckAll: () => void;
  toggleAllVisible: (on: boolean) => void;
  moveActive: (step: 1 | -1) => void;
  selectActive: (id: string) => void;
  checkActive: () => void;
  uncheckActive: () => void;
}

function useSyncCoreRows(core: BatchCore, checked: string[]): void {
  useEffect(() => {
    const known = new Set(core.s.rows.map((r) => r.relPath.toLowerCase()));
    const pruned = checked.filter((id) => known.has(id.toLowerCase()));
    if (pruned.length !== checked.length) patchBatch({ checked: pruned });
    const set = toLowerSet(pruned);
    const toCheck = core.s.rows.filter((r) => set.has(r.relPath.toLowerCase()) && !isRowSelected(core.s.rows as any, r.relPath)).map((r) => r.relPath);
    const toUncheck = core.s.rows.filter((r) => !set.has(r.relPath.toLowerCase()) && isRowSelected(core.s.rows as any, r.relPath)).map((r) => r.relPath);
    if (toCheck.length) core.setSelected(toCheck, true);
    if (toUncheck.length) core.setSelected(toUncheck, false);
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

function usePushBatchChecked(gesture: boolean): PushFn {
  const hist = useOptionalHistory();
  return useCallback(
    (label, before, after, changed) => {
      if (!hist) return;
      const record = gesture ? hist.pushGesture : hist.push;
      record({
        type: "batchChecked",
        label,
        origin: getAppState().tab,
        ids: changed,
        before: { ids: before.ids, anchor: before.anchor, active: before.active },
        after: { ids: after.ids, anchor: after.anchor, active: after.active },
      });
    },
    [hist, gesture],
  );
}

function useApplySelect(visible: BatchRow[], push: PushFn) {
  return useCallback(
    (id: string, intent: SelectIntent) => {
      const batch = getAppState().batch;
      const before = { checked: batch.checked, anchor: batch.anchorId, active: batch.activeId };
      const after = applyRowGesture(before, { id, intent, visibleIds: selectableIds(visible) });
      if (sameRowSelection(before, after)) return;
      const changed = intent === "range" ? after.checked : [id];
      push(intent === "replace" ? "Select row" : selectionLabel(after.checked),
        { ids: before.checked, anchor: before.anchor, active: before.active },
        { ids: after.checked, anchor: after.anchor, active: after.active }, changed);
      patchBatch({ checked: after.checked, anchorId: after.anchor, activeId: after.active });
    },
    [visible, push],
  );
}

function useToggleCheck(push: PushFn) {
  return useCallback(
    (id: string) => {
      const b = getAppState().batch;
      const next = toggleChecked(b.checked, id);
      push(selectionLabel(next), { ids: b.checked, anchor: b.anchorId, active: b.activeId }, { ids: next, anchor: b.anchorId, active: b.activeId }, [id]);
      patchBatch({ checked: next });
    },
    [push],
  );
}

function useCheckVisible(visible: BatchRow[], push: PushFn) {
  return useCallback(() => {
    const b = getAppState().batch;
    const ids = selectableIds(visible);
    if (ids.length === 0) return;
    const next = setChecked(b.checked, ids, true);
    if (next.length === b.checked.length) return;
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
  return useCallback(
    (on: boolean) => {
      const b = getAppState().batch;
      const ids = selectableIds(visible);
      const next = setChecked(b.checked, ids, on);
      if (next.length === b.checked.length) return;
      const label = on ? "Select visible" : "Deselect visible";
      push(label, { ids: b.checked, anchor: b.anchorId, active: b.activeId }, { ids: next, anchor: b.anchorId, active: b.activeId }, ids);
      patchBatch({ checked: next });
    },
    [visible, push],
  );
}

function useMoveActive(visible: BatchRow[], push: PushFn) {
  return useCallback(
    (step: 1 | -1) => {
      const b = getAppState().batch;
      const vIds = selectableIds(visible);
      const current = vIds.find((id) => id.toLowerCase() === b.activeId?.toLowerCase()) ?? null;
      const nxt = nextVisibleId(vIds, current, step);
      if (!nxt || nxt === b.activeId) return;
      push("Move active row", { ids: b.checked, anchor: b.anchorId, active: b.activeId }, { ids: b.checked, anchor: b.anchorId, active: nxt }, [nxt]);
      patchBatch({ activeId: nxt });
    },
    [visible, push],
  );
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

function useSelectionActions(visible: BatchRow[], push: PushFn, pushGesture: PushFn) {
  const selectRow = useApplySelect(visible, push);
  const selectActive = useCallback((id: string) => selectRow(id, "replace"), [selectRow]);
  return {
    selectRow, selectActive,
    toggleCheck: useToggleCheck(push),
    checkVisible: useCheckVisible(visible, push),
    uncheckAll: useUncheckAll(push),
    toggleAllVisible: useToggleAllVisible(visible, push),
    moveActive: useMoveActive(visible, pushGesture),
    checkActive: useCheckActive(push),
    uncheckActive: useUncheckActive(push),
  };
}

export function useBatchSelection(core: BatchCore, visible: BatchRow[]): BatchSelection {
  const app = useAppState();
  const { checked, activeId, anchorId } = app.batch;
  useSyncCoreRows(core, checked);
  const header = useBatchHeader(visible, checked);
  const counts = useBatchCounts(core, visible, checked);
  const push = usePushBatchChecked(false);
  const pushGesture = usePushBatchChecked(true);
  const actions = useSelectionActions(visible, push, pushGesture);
  return {
    checked,
    activeId,
    anchorId,
    visible,
    header,
    checkedCount: counts.checkedCount,
    visibleCount: counts.visibleCount,
    totalCount: counts.totalCount,
    hiddenCount: counts.hiddenCount,
    affectedCount: counts.affectedCount,
    ...actions,
  };
}
