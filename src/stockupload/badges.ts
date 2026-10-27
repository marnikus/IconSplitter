import { addBadge, applyBadgeToIds, recolorBadge, removeBadge, renameBadge, toggleBadgeOn, statesEqual, type RowBadgeState } from "../lib/upload/rowbadge";
import { getRowBadgeState, setRowBadgeState } from "../upload/rowbadgestore";
import type { HistoryActions } from "../state/HistoryProvider";
export function stockBadgeActions(history: HistoryActions) {
  function commit(after: RowBadgeState | null): void {
    const before = getRowBadgeState(); if (after === null || statesEqual(before, after)) return;
    setRowBadgeState(after);
    history.push({ type: "uploadRowBadges", origin: "stockUpload", label: "Change Upload badges", ids: [], before, after });
  }
  return {
    onAdd: (name: string, color?: string) => commit(addBadge(getRowBadgeState(), name, color)),
    onRename: (id: string, name: string) => commit(renameBadge(getRowBadgeState(), id, name)),
    onRecolor: (id: string, color: string) => commit(recolorBadge(getRowBadgeState(), id, color)),
    onRemove: (id: string) => commit(removeBadge(getRowBadgeState(), id)),
    onToggle: (id: string, badge: string) => commit(toggleBadgeOn(getRowBadgeState(), id, badge)),
    onApply: (ids: string[], badge: string) => commit(applyBadgeToIds(getRowBadgeState(), ids, badge)),
  };
}
