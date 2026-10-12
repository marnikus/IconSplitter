// useReview.ts — the Batch split-review orchestration (I-66…I-69).
// Owns: manual approve/decline gestures (row, bulk), the preview classifier
// (exactly N icons -> approved, everything else -> declined), the coalesced
// <base>.json writes and ONE undoable history entry per gesture (RULE 12/24).

import { useCallback, useEffect, useRef } from "react";
import { getAppState } from "../state/appstore";
import { useOptionalHistory } from "../state/HistoryProvider";
import { classifySplitCount, isDecidableRow } from "../lib/batchreview";
import type { ReviewStatus } from "../lib/reviewstatus";
import type { Row } from "./useBatchTypes";
import type { PreviewEntry } from "./useBatchPreview";
import { bindBatchReviewApplier, reviewOutcomes, type BatchReviewRec } from "./reviewundo";
import { applyOutcomes } from "./statewrite";
import type { DirHandleLike } from "../lib/fs";

export interface ReviewArgs {
  rows: Row[];
  rootRef: { current: DirHandleLike | null };
  expected: number;
  setReviews: (patch: ReadonlyMap<string, ReviewStatus>) => void;
  say: (msg: string, err?: boolean) => void;
}

interface Staged {
  rec: BatchReviewRec;
  before: ReviewStatus;
}

/** A pending decision with its original value, keyed by exact relPath. */
type StagedMap = Map<string, Staged>;

const FLUSH_MS = 400;

interface Refs {
  args: React.MutableRefObject<ReviewArgs>;
  staged: React.MutableRefObject<StagedMap>;
  timer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

export function useReview(args: ReviewArgs) {
  const hist = useOptionalHistory();
  const refs = useRefs(args);
  useEffect(() => bindApplier(refs.args, refs.staged), []);
  const apply = useApply(refs, hist);
  const decide = useDecideGesture(refs, apply);
  const flush = useFlushGesture(refs, apply);
  const classify = useClassifyGesture(refs, flush);
  return { decide, classify, flush };
}

function useRefs(args: ReviewArgs): Refs {
  const ref = useRef(args);
  ref.current = args;
  const staged = useRef<StagedMap>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return { args: ref, staged, timer };
}

function useApply(refs: Refs, hist: ReturnType<typeof useOptionalHistory>) {
  return useCallback((list: Staged[], label: string) => {
    const recs = list.map((s) => s.rec);
    const patch = new Map(recs.map((r) => [r.relPath, r.review]));
    refs.args.current.setReviews(patch);
    persist(refs.args.current.rootRef.current, recs, refs.args.current.say);
    const a = approvedOf(list);
    hist?.push({
      type: "batchReview", label, origin: getAppState().tab, ids: recs.map((r) => r.relPath),
      before: { recs: list.map((s) => withReview(s, s.before)) },
      after: { recs },
    });
    return a;
  }, [hist, refs]);
}

function useDecideGesture(refs: Refs, apply: (list: Staged[], label: string) => number) {
  return useCallback((relPaths: string[], review: ReviewStatus) => {
    const cur = refs.args.current;
    const list = stage(cur.rows, relPaths, review, refs.staged.current);
    if (list.length === 0) return cur.say("Nothing here can be decided", true);
    const n = apply(list, `${review === "approved" ? "Approve" : "Decline"} ${list.length} image${list.length === 1 ? "" : "s"}`);
    cur.say(`${n} image${n === 1 ? "" : "s"} marked ${review}`);
  }, [apply, refs]);
}

function useFlushGesture(refs: Refs, apply: (list: Staged[], label: string) => number) {
  return useCallback(() => {
    if (refs.staged.current.size === 0) return;
    const list = [...refs.staged.current.values()];
    refs.staged.current.clear();
    const a = approvedOf(list);
    apply(list, `Preview review: ${a} approved · ${list.length - a} declined`);
  }, [apply, refs]);
}

function useClassifyGesture(refs: Refs, flush: () => void) {
  return useCallback((entry: PreviewEntry) => {
    const { rows, expected } = refs.args.current;
    const row = rows.find((r) => r.relPath === entry.relPath);
    if (!row || !isDecidableRow(row)) return;
    const review = entry.status === "error" ? "declined" : classifySplitCount(entry.count, expected);
    if (row.review === review) return;
    refs.staged.current.set(row.relPath, {
      rec: { relPath: row.relPath, dirPath: row.dirPath, base: row.ai.base, review },
      before: row.review,
    });
    refs.args.current.setReviews(new Map([[row.relPath, review]])); // live badge (RULE 24)
    schedule(refs.timer, flush);
  }, [flush, refs]);
}

function bindApplier(ref: React.MutableRefObject<ReviewArgs>, staged: React.MutableRefObject<StagedMap>): () => void {
  return bindBatchReviewApplier(async (patch) => {
    const map = new Map<string, ReviewStatus>();
    for (const rec of patch.recs) {
      map.set(rec.relPath, rec.review);
      staged.current.delete(rec.relPath);
    }
    ref.current.setReviews(map);
    return persist(ref.current.rootRef.current, patch.recs, ref.current.say);
  });
}

function schedule(timer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>, flush: () => void): void {
  if (timer.current) clearTimeout(timer.current);
  timer.current = setTimeout(flush, FLUSH_MS);
}

/** Rows that would actually change, with their before-value for undo. */
function stage(rows: Row[], relPaths: string[], review: ReviewStatus, staged: StagedMap): Staged[] {
  const wanted = new Set(relPaths);
  const out: Staged[] = [];
  for (const row of rows) {
    if (!wanted.has(row.relPath) || !isDecidableRow(row) || row.review === review) continue;
    out.push({ rec: { relPath: row.relPath, dirPath: row.dirPath, base: row.ai.base, review }, before: row.review });
    staged.delete(row.relPath);
  }
  return out;
}

/** Writes the group files; a failed write is said, kept in memory, healed later. */
async function persist(root: DirHandleLike | null, recs: BatchReviewRec[], say: (m: string, e?: boolean) => void): Promise<boolean> {
  if (!root) return false;
  try {
    await applyOutcomes(root, reviewOutcomes(recs), new Date().toISOString());
    return true;
  } catch {
    say("Could not save the review decision — it stays for this session", true);
    return false;
  }
}

function approvedOf(list: Staged[]): number {
  return list.filter((s) => s.rec.review === "approved").length;
}

function withReview(s: Staged, review: ReviewStatus): BatchReviewRec {
  return { ...s.rec, review };
}
