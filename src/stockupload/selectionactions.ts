// selectionactions.ts — shared RULE 25 list selection + badge actions for stockUpload.

import { useMemo, useRef } from "react";
import {
  applyRowGesture, sameRowSelection, setChecked, toggleChecked,
  type RowSelection, type SelectIntent,
} from "../lib/reviewselect";
import { selectionPayloads } from "../lib/selectiondelta";
import type { ExportedItem } from "../lib/stockupload/types";
import {
  addBadge, applyBadgeToIds, recolorBadge, removeBadge, removeBadgeFromIds, renameBadge, statesEqual,
  toggleBadgeOn, type RowBadgeState,
} from "../lib/upload/rowbadge";
import type { HistoryActions } from "../state/HistoryProvider";
import { getAppState, patchStockUpload } from "../state/appstore";
import { getRowBadgeState, setRowBadgeState } from "../upload/rowbadgestore";

export interface StockSelectionApi {
  toggleCheck: (id: string) => void;
  selectVisible: () => void;
  uncheckVisible: () => void;
  deselectAll: () => void;
  checkActive: () => void;
  uncheckActive: () => void;
  selectRow: (id: string, intent: SelectIntent) => void;
  setActive: (id: string) => void;
}

export interface StockBadgeApi {
  addRowBadge: (name: string, color?: string) => void;
  removeRowBadge: (id: string) => void;
  renameRowBadge: (id: string, name: string) => void;
  recolorRowBadge: (id: string, color: string) => void;
  toggleRowBadge: (pairId: string, badgeId: string) => void;
  removeRowBadgeSelected: (badgeId: string) => void;
  applyRowBadgeSelected: (ids: string[], badgeId: string) => void;
}

function currentSelection(): RowSelection {
  const { checked, activeId, anchorId } = getAppState().stockUpload;
  return { checked, active: activeId, anchor: anchorId };
}

function commitSelection(hist: HistoryActions, after: RowSelection, label: string, gesture?: string): void {
  const before = currentSelection();
  if (sameRowSelection(before, after)) return;
  patchStockUpload({ checked: after.checked, activeId: after.active, anchorId: after.anchor });
  const payload = selectionPayloads(before, after);
  const record = gesture === undefined ? hist.push : hist.pushGesture;
  record({
    type: "stockUploadChecked", label, origin: getAppState().tab,
    ...(gesture === undefined ? {} : { gesture }),
    ids: payload.ids, before: payload.before, after: payload.after,
  });
}

function buildSelectionApi(ref: { current: { visible: readonly ExportedItem[]; hist: HistoryActions } }): StockSelectionApi {
  const ids = () => ref.current.visible.map((r) => r.id);
  return {
    toggleCheck: (id) => commitSelection(ref.current.hist, { ...currentSelection(), checked: toggleChecked(currentSelection().checked, id) }, "Toggle exported row"),
    selectVisible: () => commitSelection(ref.current.hist, { ...currentSelection(), checked: setChecked(currentSelection().checked, ids(), true) }, "Select visible"),
    uncheckVisible: () => commitSelection(ref.current.hist, { ...currentSelection(), checked: setChecked(currentSelection().checked, ids(), false) }, "Deselect visible"),
    deselectAll: () => commitSelection(ref.current.hist, { ...currentSelection(), checked: [] }, "Deselect all"),
    checkActive: () => {
      const b = currentSelection();
      if (b.active) commitSelection(ref.current.hist, { ...b, checked: setChecked(b.checked, [b.active], true) }, "Select active row");
    },
    uncheckActive: () => {
      const b = currentSelection();
      if (b.active) commitSelection(ref.current.hist, { ...b, checked: setChecked(b.checked, [b.active], false) }, "Deselect active row");
    },
    selectRow: (id, intent) => commitSelection(ref.current.hist, applyRowGesture(currentSelection(), { id, intent, visibleIds: ids() }), intent === "replace" ? "Select row" : "Select range"),
    setActive: (id) => commitSelection(ref.current.hist, { ...currentSelection(), active: id }, "Move active row", "active"),
  };
}

export function useStockSelectionActions(visible: readonly ExportedItem[], hist: HistoryActions): StockSelectionApi {
  const ref = useRef({ visible, hist });
  ref.current = { visible, hist };
  return useMemo(() => buildSelectionApi(ref), []);
}

function commitBadgeChange(
  hist: HistoryActions,
  say: (m: string) => void,
  args: { before: RowBadgeState; after: RowBadgeState | null; label: string; ids?: string[]; gesture?: boolean },
): void {
  if (args.after === null || statesEqual(args.before, args.after)) return;
  setRowBadgeState(args.after);
  const entry = {
    type: "uploadRowBadges", label: args.label, origin: getAppState().tab,
    ids: args.ids ?? [], before: args.before, after: args.after,
  };
  if (args.gesture) hist.pushGesture(entry);
  else hist.push(entry);
  say(args.label);
}

export function useStockRowBadgeActions(
  hist: HistoryActions,
  say: (msg: string, err?: boolean) => void,
  onClearRemovedBadgeFilter: (removedId: string) => void,
): StockBadgeApi {
  const ref = useRef({ hist, say, onClearRemovedBadgeFilter });
  ref.current = { hist, say, onClearRemovedBadgeFilter };
  return useMemo(() => ({
    addRowBadge: (name, color) => commitBadgeChange(ref.current.hist, ref.current.say, { before: getRowBadgeState(), after: addBadge(getRowBadgeState(), name, color), label: "Add badge" }),
    removeRowBadge: (id) => {
      commitBadgeChange(ref.current.hist, ref.current.say, { before: getRowBadgeState(), after: removeBadge(getRowBadgeState(), id), label: "Remove badge", ids: [id] });
      ref.current.onClearRemovedBadgeFilter(id);
    },
    renameRowBadge: (id, name) => commitBadgeChange(ref.current.hist, ref.current.say, { before: getRowBadgeState(), after: renameBadge(getRowBadgeState(), id, name), label: "Rename badge", ids: [id], gesture: true }),
    recolorRowBadge: (id, color) => commitBadgeChange(ref.current.hist, ref.current.say, { before: getRowBadgeState(), after: recolorBadge(getRowBadgeState(), id, color), label: "Recolour badge", ids: [id], gesture: true }),
    toggleRowBadge: (pairId, badgeId) => commitBadgeChange(ref.current.hist, ref.current.say, { before: getRowBadgeState(), after: toggleBadgeOn(getRowBadgeState(), pairId, badgeId), label: "Toggle badge", ids: [pairId] }),
    removeRowBadgeSelected: (badgeId) => {
      const ids = currentSelection().checked;
      const before = getRowBadgeState();
      commitBadgeChange(ref.current.hist, ref.current.say, { before, after: removeBadgeFromIds(before, ids, badgeId), label: "Remove badge from selected", ids });
    },
    applyRowBadgeSelected: (ids, badgeId) => commitBadgeChange(ref.current.hist, ref.current.say, { before: getRowBadgeState(), after: applyBadgeToIds(getRowBadgeState(), ids, badgeId), label: "Apply badge to selected", ids }),
  }), []);
}
