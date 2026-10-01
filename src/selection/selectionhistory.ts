// selectionhistory.ts — glue between the review store and the global timeline
// (request §3/§9). Registers the review appliers once, at module load, so Undo
// works from any tab (even while the Selection panel is not mounted). Every
// apply goes back through the SAME store commands/transitions a click uses.

import { registerApplier } from "../history/historybus";
import { missingTargets, type DecisionState } from "../lib/reviewsnapshot";
import type { ViewPatch } from "./state";
import { applyChecked, applyDecisionStates, applyViewPatch, getSelState } from "./selectionstore";
import { CHECKS_KIND, REVIEW_KIND, VIEW_KIND } from "../history/kinds";

type States = readonly DecisionState[];

function targetsExist(entry: { targets: string[] }): boolean {
  return missingTargets(getSelState().pairs, entry.targets).length === 0;
}

function applyStates(states: unknown): boolean {
  applyDecisionStates(states as States);
  return true;
}

/** Registers (or re-registers) the review kinds on the global timeline. */
export function registerSelectionHistory(): void {
  registerApplier(REVIEW_KIND, {
    canApply: (e) => targetsExist(e),
    apply: (e, dir) => applyStates(dir === "undo" ? e.before : e.after),
  });
  registerApplier(CHECKS_KIND, {
    canApply: (e) => targetsExist(e),
    apply: (e, dir) => {
      const side = (dir === "undo" ? e.before : e.after) as { checked: string[] };
      applyChecked(side.checked);
      return true;
    },
  });
  registerApplier(VIEW_KIND, {
    canApply: () => true, // view settings have no targets to go stale
    apply: (e, dir) => {
      applyViewPatch((dir === "undo" ? e.before : e.after) as ViewPatch);
      return true;
    },
  });
}

registerSelectionHistory();
