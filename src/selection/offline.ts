// offline.ts — how a decision reaches its store when the Selection panel is not
// mounted (design doc §3, I-41/I-43).
//
// Workbench renders one panel at a time, so an undo pressed from the Sheets tab
// has no hook to call. Every decision lives in the pair's OWN file beside its
// images, so this module writes exactly the files a history entry names: the
// ones the patch carries get its decision, and a pair that goes back to pending
// is located through the id -> path index (the same cache the SVG undo uses).
// A pair whose images are not under the remembered root is skipped — an undo
// never creates a file in a folder the pair does not live in. When a panel IS
// mounted it binds itself here first, which keeps one canonical mutation path
// either way (RULE 12).

import { loadHandles } from "../batch/store";
import { resolveFile } from "./handles";
import { withDecision } from "../lib/pairmeta";
import type { ReviewRecord } from "../lib/reviewfile";
import { loadSourceIndex } from "../state/sourceindex";
import type { DirHandleLike } from "../lib/fs";
import { loadMetaAt, saveMetaAt } from "./pairstore";
import { metaFromRecord, metaPathOf } from "./pairrecord";

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
  return applyToFiles(touched, patch);
}

async function applyToFiles(touched: readonly string[], patch: DecisionPatch): Promise<boolean> {
  const root = (await loadHandles(SELECTION_HANDLE_KEY))?.source ?? null;
  if (!root || touched.length === 0) return false;
  const named = new Map(patch.recs.map((r) => [r.pair_id, r]));
  let changed = false;
  for (const id of touched) {
    const rec = named.get(id) ?? pendingRecord(id);
    if (rec === null) continue;
    changed = (await writeOne(root, rec)) || changed;
  }
  return changed;
}

/** A pair going back to pending: the index still knows the file it lives in. */
function pendingRecord(id: string): ReviewRecord | null {
  const entry = loadSourceIndex().get(id);
  if (!entry) return null;
  return { pair_id: id, source: null, ai_result: entry.relPath, decision: "pending", reviewed_at: new Date().toISOString() };
}

async function writeOne(root: DirHandleLike, rec: ReviewRecord): Promise<boolean> {
  const relPath = metaPathOf(rec);
  if (relPath === "") return false;
  try {
    const read = await loadMetaAt(root, relPath);
    // No pair file yet: only write one where the images really are.
    if (read.meta === null && !(await imagesHere(root, rec))) return false;
    const base = read.meta ?? metaFromRecord(rec);
    await saveMetaAt(root, relPath, withDecision(base, rec.decision, rec.reviewed_at));
    return true;
  } catch {
    return false; // a failed apply must not move the history cursor
  }
}

/** True when the pair's AI image (or its reference) exists under this root. */
async function imagesHere(root: DirHandleLike, rec: ReviewRecord): Promise<boolean> {
  for (const relPath of [rec.ai_result, rec.source]) {
    if (relPath !== null && relPath !== "" && (await resolveFile(root, relPath)) !== null) return true;
  }
  return false;
}
