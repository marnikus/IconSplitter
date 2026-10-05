// useSelectionV2.ts — Selection V2 orchestration. It wraps useSelection (which
// owns discovery, filters, decisions and their atomic persistence) and adds only
// what V2's layout needs: checkbox selection and the view prefs. View /
// selection / decision state stay separate (spec V2 quality note); checkbox
// selection and prefs live in the store above the tabs, so both survive a tab
// switch and a restart and both are undoable.

import { useMemo } from "react";
import { clampThumb, type ReviewPrefs, type ViewMode } from "../lib/reviewprefs";
import { bulkScope } from "../lib/reviewbulk";
import {
  checkState, selectOne, selectRange, setChecked, toggleChecked,
  type CheckState, type SelectIntent,
} from "../lib/reviewselect";
import { useSelection, type SelectionApi } from "../selection/useSelection";
import { getAppState, patchV2, patchView, setAppState } from "../state/appstore";
import { useAppState } from "../state/useAppState";
import { useHistory, type HistoryApi } from "../state/HistoryProvider";

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
  uncheckAll: () => void;
}

export function useSelectionV2(): SelectionV2Api {
  const core = useSelection({ watcher: false }); // V2 has no watcher (I-44)
  const hist = useHistory();
  const app = useAppState();
  const { checked, scrollY, anchorId } = app.v2;
  const visibleIds = useMemo(() => core.visible.map((p) => p.pairId), [core.visible]);
  const scope = bulkScope(core.visible, checked);
  return {
    core, prefs: app.prefs, checked, scrollY,
    affected: scope.affected,
    blockedCount: scope.blocked,
    hiddenCount: scope.hidden,
    header: checkState(visibleIds, checked),
    setMode: (mode) => editPrefs(hist, { mode }, `View mode: ${mode}`, false),
    setThumb: (px) => editPrefs(hist, { thumbHeight: clampThumb(px) }, `Thumbnail ${clampThumb(px)} px`, true),
    setScroll: (y) => patchV2({ scrollY: y }),
    selectRow: (id, intent) => applySelect({ hist, visibleIds, checked, anchorId, id, intent }),
    toggleCheck: (id) => editSelection(hist, toggleChecked(checked, id), anchorId),
    checkVisible: () => editSelection(hist, setChecked(checked, visibleIds, true), anchorId),
    uncheckAll: () => editSelection(hist, [], null),
  };
}

interface SelectArgs {
  hist: HistoryApi;
  visibleIds: string[];
  checked: string[];
  anchorId: string | null;
  id: string;
  intent: SelectIntent;
}

/**
 * Resolves one row click into the selection it produces (lib/reviewselect) and
 * makes the clicked row the active one. Both halves land in ONE entry, so one
 * undo reverses the whole click instead of leaving half of it behind.
 */
function applySelect(a: SelectArgs): void {
  const ids = a.intent === "range"
    ? selectRange(a.visibleIds, a.anchorId, a.id)
    : a.intent === "toggle" ? toggleChecked(a.checked, a.id) : selectOne(a.id);
  // ctrl/alt keeps the anchor, so the next shift+click still extends from it
  editSelection(a.hist, ids, a.intent === "toggle" ? a.anchorId : a.id, a.id);
}

/** One selection gesture = one entry holding the whole selection, so one undo
 *  restores every row it touched, not just the last one. `active` is set by a
 *  row click; the checkbox and header controls leave the active row alone. */
function editSelection(hist: HistoryApi, ids: string[], anchor: string | null, active?: string): void {
  const before = getAppState().v2;
  const beforeActive = getAppState().view.selectedId;
  const nextActive = active ?? beforeActive;
  patchV2({ checked: ids, anchorId: anchor });
  if (active !== undefined) patchView({ selectedId: active });
  hist.push({
    type: "checked", label: selectionLabel(ids), origin: getAppState().tab, ids,
    before: { ids: before.checked, anchor: before.anchorId, active: beforeActive },
    after: { ids, anchor, active: nextActive },
  });
}

function selectionLabel(ids: string[]): string {
  if (ids.length === 0) return "Clear selection";
  return `Select ${ids.length} row${ids.length === 1 ? "" : "s"}`;
}

/** Prefs stay in the store; prefsstore remains their only writer (see boot). */
function editPrefs(hist: HistoryApi, patch: Partial<ReviewPrefs>, label: string, gesture: boolean): void {
  const before = getAppState().prefs;
  const after = { ...before, ...patch };
  setAppState({ prefs: after });
  const entry = { type: "prefs", label, origin: getAppState().tab, ids: Object.keys(patch), before, after };
  if (gesture) hist.pushGesture(entry);
  else hist.push(entry);
}
