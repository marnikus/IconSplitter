// useSelectionV2.ts — Selection V2 orchestration. It wraps useSelection (which
// owns discovery, filters, decisions and their atomic persistence) and adds only
// what V2's layout needs: checkbox selection and the view prefs. View /
// selection / decision state stay separate (spec V2 quality note); checkbox
// selection and prefs live in the store above the tabs, so both survive a tab
// switch and a restart and both are undoable.

import { useCallback, useMemo } from "react";
import { type ReviewPrefs, type ViewMode } from "../lib/reviewprefs";
import { clampZoom } from "../lib/zoom";
import { bulkScope } from "../lib/reviewbulk";
import {
  applyRowGesture, checkState, sameRowSelection, setChecked, toggleChecked,
  type CheckState, type SelectIntent,
} from "../lib/reviewselect";
import { selectionPayloads } from "../lib/selectiondelta";
import { useSelection, type SelectionApi } from "../selection/useSelection";
import { getAppState, patchV2, patchV2Selection, setAppState } from "../state/appstore";
import { useAppSlice } from "../state/useAppState";
import { useHistoryActions, type HistoryActions } from "../state/HistoryProvider";

export interface SelectionV2Api {
  core: SelectionApi;
  prefs: ReviewPrefs;
  checked: string[];
  header: CheckState;
  affected: string[]; // checked ∩ visible ∩ complete — the only ids bulk touches
  blockedCount: number; // checked + visible, but an incomplete pair
  hiddenCount: number; // checked, but filtered out of the current view
  scrollY: number;
  /** Explorer-style row selection: plain, shift-range or ctrl/alt toggle. */
  selectRow: (id: string, intent: SelectIntent) => void;
  setMode: (mode: ViewMode) => void;
  setThumb: (px: number) => void;
  setScroll: (y: number) => void;
  toggleCheck: (id: string) => void;
  checkVisible: () => void;
  uncheckVisible: () => void;
  uncheckAll: () => void;
  checkActive: () => void;
  uncheckActive: () => void;
}

function makeCheckActive(hist: HistoryActions) {
  return () => {
    const a = getAppState().view.selectedId;
    if (!a) return;
    const cur = getAppState().v2;
    editSelection(hist, setChecked(cur.checked, [a], true), cur.anchorId);
  };
}

function makeUncheckActive(hist: HistoryActions) {
  return () => {
    const a = getAppState().view.selectedId;
    if (!a) return;
    const cur = getAppState().v2;
    editSelection(hist, setChecked(cur.checked, [a], false), cur.anchorId);
  };
}

export function useSelectionV2(): SelectionV2Api {
  const core = useSelection();
  const hist = useHistoryActions();
  const { checked, scrollY } = useAppSlice("v2");
  const prefs = useAppSlice("prefs");
  const visibleIds = useMemo(() => core.visible.map((p) => p.pairId), [core.visible]);
  const scope = useMemo(() => bulkScope(core.visible, checked), [core.visible, checked]);
  const header = useMemo(() => checkState(visibleIds, checked), [visibleIds, checked]);
  // D7: the API object and every action in it keep one identity until an input
  // really changes. Hotkey effects and the panel memoize on this API, so a new
  // closure per render rebound their listeners on every keystroke.
  const onMode = useCallback((mode: ViewMode) => editPrefs(hist, { mode }, `View mode: ${mode}`, false), [hist]);
  const onThumb = useCallback((px: number) => editPrefs(hist, { thumbHeight: clampZoom(px) }, `Thumbnail ${clampZoom(px)} px`, true), [hist]);
  const onScroll = useCallback((y: number) => patchV2({ scrollY: y }), []);
  const onSelectRow = useCallback((id: string, intent: SelectIntent) => applySelect({ hist, visibleIds, id, intent }), [hist, visibleIds]);
  const onToggleCheck = useCallback((id: string) => editSelection(hist, toggleChecked(getAppState().v2.checked, id), getAppState().v2.anchorId), [hist]);
  const onCheckVisible = useCallback(() => editSelection(hist, setChecked(getAppState().v2.checked, visibleIds, true), getAppState().v2.anchorId), [hist, visibleIds]);
  const onUncheckVisible = useCallback(() => editSelection(hist, setChecked(getAppState().v2.checked, visibleIds, false), getAppState().v2.anchorId), [hist, visibleIds]);
  const onUncheckAll = useCallback(() => editSelection(hist, [], getAppState().v2.anchorId), [hist]);
  const onCheckActive = useMemo(() => makeCheckActive(hist), [hist]);
  const onUncheckActive = useMemo(() => makeUncheckActive(hist), [hist]);
  return useMemo(() => ({
    core, prefs, checked, scrollY,
    affected: scope.affected, blockedCount: scope.blocked, hiddenCount: scope.hidden, header,
    setMode: onMode, setThumb: onThumb, setScroll: onScroll, selectRow: onSelectRow,
    toggleCheck: onToggleCheck, checkVisible: onCheckVisible, uncheckVisible: onUncheckVisible,
    uncheckAll: onUncheckAll, checkActive: onCheckActive, uncheckActive: onUncheckActive,
  }), [core, prefs, checked, scrollY, scope, header, onMode, onThumb, onScroll, onSelectRow,
    onToggleCheck, onCheckVisible, onUncheckVisible, onUncheckAll, onCheckActive, onUncheckActive]);
}

interface SelectArgs {
  hist: HistoryActions;
  visibleIds: string[];
  id: string;
  intent: SelectIntent;
}

/**
 * Resolves one row click into the selection it produces (lib/reviewselect) and
 * makes the clicked row the active one. Both halves land in ONE entry, so one
 * undo reverses the whole click instead of leaving half of it behind.
 */
function applySelect(a: SelectArgs): void {
  const v2 = getAppState().v2;
  const before = { checked: v2.checked, anchor: v2.anchorId, active: getAppState().view.selectedId };
  const after = applyRowGesture(before, { id: a.id, intent: a.intent, visibleIds: a.visibleIds });
  editSelection(a.hist, after.checked, after.anchor, after.active);
}

/** One selection gesture = one entry, so one undo restores every row it touched,
 *  not just the last one. `active` is set by a row click; the checkbox and header
 *  controls leave the active row alone. The entry records the DIFF (ordered
 *  indices, lib/selectiondelta) and ONE store notification, so a 1,000-row list
 *  no longer copies its whole selection into history or wakes the other tabs. */
function editSelection(hist: HistoryActions, ids: string[], anchor: string | null, active?: string | null): void {
  const before = getAppState().v2;
  const beforeActive = getAppState().view.selectedId;
  const nextActive = active === undefined ? beforeActive : active;
  if (sameRowSelection({ checked: before.checked, anchor: before.anchorId, active: beforeActive },
    { checked: ids, anchor, active: nextActive })) return;
  patchV2Selection({ checked: ids, anchorId: anchor, activeId: nextActive });
  const payload = selectionPayloads(
    { checked: before.checked, anchor: before.anchorId, active: beforeActive },
    { checked: ids, anchor, active: nextActive },
  );
  hist.push({
    type: "checked", label: selectionLabel(ids), origin: getAppState().tab,
    ...payload,
  });
}

function selectionLabel(ids: string[]): string {
  if (ids.length === 0) return "Clear selection";
  return `Select ${ids.length} row${ids.length === 1 ? "" : "s"}`;
}

/** Prefs stay in the store; prefsstore remains their only writer (see boot). */
function editPrefs(hist: HistoryActions, patch: Partial<ReviewPrefs>, label: string, gesture: boolean): void {
  const before = getAppState().prefs;
  const after = { ...before, ...patch };
  setAppState({ prefs: after });
  const entry = { type: "prefs", label, origin: getAppState().tab, ids: Object.keys(patch), before, after };
  if (gesture) hist.pushGesture(entry);
  else hist.push(entry);
}
