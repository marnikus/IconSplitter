// useSelectionV2.ts — Selection V2 orchestration. It wraps useSelection (which
// now owns discovery, filters, decisions, checks, prefs and their persistence
// in ONE module store) and adds only what V2's layout needs: the check scope,
// the derived bulk scope and the reset scopes. Nothing here re-implements a V1
// rule, and no state is copied — every value is read from the shared store, so
// V1, V2 and Undo can never disagree (request §9).

import { useCallback, useMemo } from "react";
import { planReset } from "../lib/reviewreset";
import type { ReviewPrefs } from "../lib/reviewprefs";
import { bulkScope } from "../lib/reviewbulk";
import { checkState, type CheckState } from "../lib/reviewselect";
import { useSelection, type SelectionApi } from "../selection/useSelection";

export interface SelectionV2Api {
  core: SelectionApi;
  prefs: ReviewPrefs;
  checked: string[];
  header: CheckState;
  affected: string[]; // checked ∩ visible ∩ complete — the only ids approve touches
  resettable: string[]; // checked ∩ visible ∩ reviewed — reset always allows an incomplete pair
  blockedCount: number; // checked + visible, but an incomplete pair
  hiddenCount: number; // checked, but filtered out of the current view
  setMode: (mode: ReviewPrefs["mode"]) => void;
  setThumb: (px: number) => void;
  toggleCheck: (id: string) => void;
  checkVisible: () => void;
  uncheckAll: () => void;
  resetOne: (id: string) => void;
  resetSelected: () => void;
  resetVisible: () => void;
}

export function useSelectionV2(): SelectionV2Api {
  const core = useSelection();
  const visibleIds = useMemo(() => core.visible.map((p) => p.pairId), [core.visible]);
  const scope = bulkScope(core.visible, core.s.checked);
  const resettable = useMemo(() => planReset(core.visible, core.s.checked).resettable, [core.visible, core.s.checked]);
  const reset = core.reset;
  const resettableVisible = useCallback(() => { void reset(core.visible.map((p) => p.pairId)); }, [reset, core.visible]);
  return {
    core, prefs: core.s.prefs, checked: core.s.checked,
    affected: scope.affected, resettable,
    blockedCount: scope.blocked, hiddenCount: scope.hidden,
    header: checkState(visibleIds, core.s.checked),
    setMode: core.setMode, setThumb: core.setThumb, toggleCheck: core.toggleCheck,
    checkVisible: core.checkVisible, uncheckAll: core.uncheckAll,
    resetOne: useCallback((id: string) => { void reset([id]); }, [reset]),
    resetSelected: useCallback(() => { void reset(resettable); }, [reset, resettable]),
    resetVisible: resettableVisible,
  };
}
