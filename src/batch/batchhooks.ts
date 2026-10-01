// batchhooks.ts — the two effects the batch panel owns besides its actions
// (RULE 18: keeps useBatch an orchestration layer): reversible row checkboxes
// on the global timeline, and the toast that clears itself. Types come in
// type-only, so this module never creates a runtime cycle with useBatch.
import { useEffect, type Dispatch, type SetStateAction } from "react";
import { registerApplier, unregisterApplier } from "../history/historybus";
import { BATCH_SELECT_KIND } from "../history/kinds";
import { applySelection } from "./selectionhistory";
import type { BatchState } from "./useBatch";

type Setter = Dispatch<SetStateAction<BatchState>>;

/** Reversible row checkboxes: registered while the batch panel is mounted. */
export function useBatchSelectionHistory(ctx: { state: { current: BatchState } }, setS: Setter): void {
  useEffect(() => {
    registerApplier(BATCH_SELECT_KIND, {
      canApply: (e) => e.targets.every((t) => ctx.state.current.rows.some((r) => r.relPath === t)),
      apply: (e, dir) => {
        const payload = dir === "undo" ? e.before : e.after;
        setS((p) => ({ ...p, rows: applySelection(p.rows, payload) }));
        return true;
      },
    });
    return () => unregisterApplier(BATCH_SELECT_KIND);
  }, [ctx, setS]);
}

/** A toast disappears on its own after 4 s. */
export function useToastClear(toast: BatchState["toast"], setS: Setter): void {
  useEffect(() => {
    const t = toast ? setTimeout(() => setS((p) => ({ ...p, toast: null })), 4000) : 0;
    return () => clearTimeout(t);
  }, [toast, setS]);
}
