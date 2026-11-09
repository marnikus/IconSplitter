// selectionactions.ts — shared RULE 25 list selection + badge actions for stockUpload.

import { useMemo, useRef } from "react";
import {
  applyRowGesture, invertChecked, sameRowSelection, setChecked, toggleChecked,
  type RowSelection, type SelectIntent,
} from "../lib/reviewselect";
import { selectionPayloads } from "../lib/selectiondelta";
import { drawRandomIds, randomSelectionMessage, randomSelectionPool } from "../lib/randomselect";
import type { ExportedItem } from "../lib/stockupload/types";
import {
  addBadge, applyBadgeToIds, recolorBadge, removeBadge, removeBadgeFromIds, renameBadge, statesEqual,
  toggleBadgeOn, type RowBadgeState,
} from "../lib/upload/rowbadge";
import type { HistoryActions } from "../state/HistoryProvider";
import { getAppState, patchStockUpload } from "../state/appstore";
import { getRowBadgeState, setRowBadgeState } from "../upload/rowbadgestore";
import {
  dropRejectedFromHistory, planRejectedRemoval, rejectedSummary, withoutStockBadge,
  type RejectedRemovalInput, type RejectedRemovalResult,
} from "./rejectedremoval";

export interface StockSelectionApi {
  toggleCheck: (id: string) => void;
  selectVisible: () => void;
  selectIds: (ids: readonly string[]) => void;
  /** Replace the checks with N random listed items (checked-only pool when some are checked). */
  selectRandom: (count: number) => void;
  invertVisible: () => void;
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
  /** Pasted names a stock refused: drop that stock's badge (undoable) and its history records. */
  removeRejectedUploads: (input: RejectedRemovalInput) => RejectedRemovalResult;
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

interface SelectionSource {
  items: readonly ExportedItem[];
  visible: readonly ExportedItem[];
  hist: HistoryActions;
  say: (msg: string, err?: boolean) => void;
}

/** One random draw through the same selection commit path as every other gesture. */
function commitRandomSelection(ref: { current: SelectionSource }, count: number): void {
  const before = currentSelection();
  const pool = randomSelectionPool(ref.current.items.map((r) => r.id), before.checked);
  const after = { ...before, checked: drawRandomIds(pool, count) };
  commitSelection(ref.current.hist, after, "Select random");
  if (!sameRowSelection(before, after)) ref.current.say(randomSelectionMessage(after.checked.length));
}

function buildSelectionApi(ref: { current: SelectionSource }): StockSelectionApi {
  const ids = () => ref.current.visible.map((r) => r.id);
  return {
    toggleCheck: (id) => commitSelection(ref.current.hist, { ...currentSelection(), checked: toggleChecked(currentSelection().checked, id) }, "Toggle exported row"),
    selectVisible: () => commitSelection(ref.current.hist, { ...currentSelection(), checked: setChecked(currentSelection().checked, ids(), true) }, "Select visible"),
    selectIds: (requested) => {
      const visibleSet = new Set(ids());
      const matches = [...new Set(requested)].filter((id) => visibleSet.has(id));
      commitSelection(ref.current.hist, { ...currentSelection(), checked: setChecked([], matches, true) }, "Select batch items");
    },
    selectRandom: (count) => commitRandomSelection(ref, count),
    uncheckVisible: () => commitSelection(ref.current.hist, { ...currentSelection(), checked: setChecked(currentSelection().checked, ids(), false) }, "Deselect visible"),
    deselectAll: () => commitSelection(ref.current.hist, { ...currentSelection(), checked: [] }, "Deselect all"),
    invertVisible: () => commitSelection(ref.current.hist, { ...currentSelection(), checked: invertChecked(currentSelection().checked, ids()) }, "Invert selection"),
    ...buildActiveRowGestures(ref, ids),
  };
}

/** Gestures on the active row and row clicks (Space/Enter, click, Shift-click, arrow moves). */
function buildActiveRowGestures(
  ref: { current: SelectionSource }, ids: () => string[],
): Pick<StockSelectionApi, "checkActive" | "uncheckActive" | "selectRow" | "setActive"> {
  return {
    checkActive: () => {
      const b = currentSelection();
      if (b.active) commitSelection(ref.current.hist, { ...b, checked: setChecked(b.checked, [b.active], true) }, "Select active row");
    },
    uncheckActive: () => {
      const b = currentSelection();
      if (b.active) commitSelection(ref.current.hist, { ...b, checked: setChecked(b.checked, [b.active], false) }, "Deselect active row");
    },
    selectRow: (id, intent) => {
      const before = currentSelection();
      // In Stock Upload, a plain row pick replaces the queued upload set; the
      // checkbox is the additive/toggle affordance for composing a larger set.
      const gesture = applyRowGesture(before, { id, intent, visibleIds: ids() });
      const after = intent === "replace" && gesture !== before
        ? { ...gesture, checked: [id] }
        : gesture;
      commitSelection(ref.current.hist, after, intent === "replace" ? "Select row" : "Select range");
    },
    setActive: (id) => commitSelection(ref.current.hist, { ...currentSelection(), active: id }, "Move active row", "active"),
  };
}

export function useStockSelectionActions(
  items: readonly ExportedItem[], visible: readonly ExportedItem[], hist: HistoryActions, say: (msg: string, err?: boolean) => void,
): StockSelectionApi {
  const ref = useRef({ items, visible, hist, say });
  ref.current = { items, visible, hist, say };
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
    removeRejectedUploads: (input) => applyRejectedRemoval(ref.current, input),
  }), []);
}

/** One Process click: badge change on the undo timeline, then the stored history edit. */
function applyRejectedRemoval(
  c: { hist: HistoryActions; say: (msg: string, err?: boolean) => void }, input: RejectedRemovalInput,
): RejectedRemovalResult {
  const match = planRejectedRemoval(input);
  const before = getRowBadgeState();
  const badge = withoutStockBadge(before, input.stock, match.itemIds);
  const label = `Remove ${input.stock.name} badge from rejected uploads`;
  commitBadgeChange(c.hist, () => {}, { before, after: badge.after, label, ids: match.itemIds });
  const stored = dropRejectedFromHistory(input.stock.id, match.itemIds);
  const result = { items: match.itemIds.length, badges: badge.removed, ...stored, unmatched: match.unmatchedNames };
  c.say(rejectedSummary(input.stock.name, result), result.items === 0);
  return result;
}
