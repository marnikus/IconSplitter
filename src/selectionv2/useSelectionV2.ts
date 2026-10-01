// useSelectionV2.ts — Selection V2 orchestration. It wraps useSelection (which
// owns discovery, filters, decisions and their atomic persistence) and adds
// only what V2's layout needs: checkbox selection, the view mode and the
// persisted thumbnail zoom. View / selection / decision state stay separate
// (spec V2 quality note); nothing here re-implements a V1 rule.

import { useCallback, useEffect, useMemo, useState } from "react";
import { clampThumb, type ReviewPrefs, type ViewMode } from "../lib/reviewprefs";
import { bulkScope } from "../lib/reviewbulk";
import { checkState, setChecked, toggleChecked, type CheckState } from "../lib/reviewselect";
import { useSelection, type SelectionApi } from "../selection/useSelection";
import { loadPrefs, savePrefs } from "./prefsstore";

export interface SelectionV2Api {
  core: SelectionApi;
  prefs: ReviewPrefs;
  checked: string[];
  header: CheckState;
  affected: string[]; // checked ∩ visible ∩ complete — the only ids bulk touches
  blockedCount: number; // checked + visible, but an incomplete pair
  hiddenCount: number; // checked, but filtered out of the current view
  setMode: (mode: ViewMode) => void;
  setThumb: (px: number) => void;
  toggleCheck: (id: string) => void;
  checkVisible: () => void;
  uncheckAll: () => void;
}

type CheckSetter = React.Dispatch<React.SetStateAction<string[]>>;

export function useSelectionV2(): SelectionV2Api {
  const core = useSelection();
  const [prefs, setPrefs] = useState<ReviewPrefs>(loadPrefs);
  const [checked, setCheckedIds] = useState<string[]>([]);
  const visibleIds = useMemo(() => core.visible.map((p) => p.pairId), [core.visible]);
  const known = useMemo(() => new Set(core.s.pairs.map((p) => p.pairId)), [core.s.pairs]);
  useEffect(() => { savePrefs(prefs); }, [prefs]);
  usePrune(known, setCheckedIds);
  const scope = bulkScope(core.visible, checked);
  return {
    core, prefs, checked,
    affected: scope.affected,
    blockedCount: scope.blocked,
    hiddenCount: scope.hidden,
    header: checkState(visibleIds, checked),
    setMode: useCallback((mode: ViewMode) => setPrefs((p) => ({ ...p, mode })), []),
    setThumb: useCallback((px: number) => setPrefs((p) => ({ ...p, thumbHeight: clampThumb(px) })), []),
    toggleCheck: useCallback((id: string) => setCheckedIds((c) => toggleChecked(c, id)), []),
    checkVisible: useCallback(() => setCheckedIds((c) => setChecked(c, visibleIds, true)), [visibleIds]),
    uncheckAll: useCallback(() => setCheckedIds([]), []),
  };
}

/** Drops checks for pairs a rescan removed, so bulk can never touch them. */
function usePrune(known: Set<string>, set: CheckSetter): void {
  useEffect(() => {
    set((prev) => (prev.every((id) => known.has(id)) ? prev : prev.filter((id) => known.has(id))));
  }, [known, set]);
}
