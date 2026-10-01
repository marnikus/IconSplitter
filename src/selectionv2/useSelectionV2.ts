// useSelectionV2.ts — Selection V2 orchestration. It wraps useSelection (which
// owns discovery, filters, decisions and their atomic persistence) and adds only
// what V2's layout needs: checkbox selection and the view prefs. View /
// selection / decision state stay separate (spec V2 quality note); checkbox
// selection and prefs live in the store above the tabs, so both survive a tab
// switch and a restart and both are undoable.

import { useMemo } from "react";
import { clampThumb, type ReviewPrefs, type ViewMode } from "../lib/reviewprefs";
import { bulkScope } from "../lib/reviewbulk";
import { checkState, setChecked, toggleChecked, type CheckState } from "../lib/reviewselect";
import { useSelection, type SelectionApi } from "../selection/useSelection";
import { getAppState, patchV2, setAppState } from "../state/appstore";
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
  setMode: (mode: ViewMode) => void;
  setThumb: (px: number) => void;
  setScroll: (y: number) => void;
  toggleCheck: (id: string) => void;
  checkVisible: () => void;
  uncheckAll: () => void;
}

export function useSelectionV2(): SelectionV2Api {
  const core = useSelection();
  const hist = useHistory();
  const app = useAppState();
  const { checked, scrollY } = app.v2;
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
    toggleCheck: (id) => editChecked(hist, toggleChecked(checked, id)),
    checkVisible: () => editChecked(hist, setChecked(checked, visibleIds, true)),
    uncheckAll: () => editChecked(hist, []),
  };
}

/** One checkbox gesture = one entry naming every row it ends up selecting. */
function editChecked(hist: HistoryApi, next: string[]): void {
  const before = getAppState().v2.checked;
  patchV2({ checked: next });
  hist.push({
    type: "checked", label: checkedLabel(next), origin: getAppState().tab,
    ids: next, before, after: next,
  });
}

function checkedLabel(next: string[]): string {
  if (next.length === 0) return "Clear selection";
  return `Select ${next.length} row${next.length === 1 ? "" : "s"}`;
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
