// offline.ts — how a decision reaches its store when the Selection panel is not
// mounted (design doc §3).
//
// Workbench renders one panel at a time, so an undo pressed from the Sheets tab
// has no hook to call. The stored decision file is the cross-tab source of
// truth, so this module writes it directly. When a panel IS mounted it binds
// itself here first, which keeps one canonical mutation path either way: the
// change always lands through the reducers that also drive counters, filters
// and persistence (RULE 12).

import { loadHandles } from "../batch/store";
import { patchRecords, type ReviewRecord } from "../lib/reviewfile";
import { loadDecisions, saveDecisions } from "./reviewstore";

export const SELECTION_HANDLE_KEY = "__selection__";

/**
 * What a history entry carries for a decision change: the records for exactly
 * the touched pairs in that state. A pair that is pending has no record (I-13),
 * so it is simply absent — that is how an undo back to pending is expressed.
 */
export interface DecisionPatch {
  recs: ReviewRecord[];
}

export type DecisionApplier = (touched: readonly string[], patch: DecisionPatch) => Promise<boolean>;

let live: DecisionApplier | null = null;

/** A mounted Selection/V2 panel claims the apply path; unmount releases it. */
export function bindDecisionApplier(apply: DecisionApplier): () => void {
  live = apply;
  return () => {
    if (live === apply) live = null;
  };
}

/** True when a panel is mounted and will apply the change itself. */
export function hasLiveApplier(): boolean {
  return live !== null;
}

/** Apply a decision change. False means "nothing changed" — never a partial write. */
export async function applyDecisionPatch(touched: readonly string[], patch: DecisionPatch): Promise<boolean> {
  if (live) return live(touched, patch);
  return applyToFile(touched, patch);
}

async function applyToFile(touched: readonly string[], patch: DecisionPatch): Promise<boolean> {
  const root = (await loadHandles(SELECTION_HANDLE_KEY))?.source ?? null;
  if (!root || touched.length === 0) return false;
  try {
    const stored = await loadDecisions(root);
    await saveDecisions(root, patchRecords(stored.records, touched, patch.recs));
    return true;
  } catch {
    return false; // a failed apply must not move the history cursor
  }
}
