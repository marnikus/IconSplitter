// previewqueue.ts — the multi-row preview run: up to three rows at a time, abortable,
// one entry written per finished row (RULE 5). Owns the one referee the run shares
// with the single-row preview: a row the user previewed on its OWN bar (Apply/Reset)
// is never repainted by a result the run computed before that click — the run's
// answer was made with the distance the row had a moment ago (2026-10-13).

import { useCallback, useRef } from "react";
import type { MutableRefObject, Dispatch, SetStateAction } from "react";
import type { PreviewEntry, PreviewOne, PreviewSet, Row } from "./useBatchTypes";

const MAX_CONCURRENT = 3;

/** Rows the user previewed on their own; a multi-row run must leave them alone. */
export interface OwnRows {
  claim: (relPath: string) => void;
  holds: (relPath: string) => boolean;
  releaseAll: () => void;
}

export function makeOwnRows(): OwnRows {
  const keys = new Set<string>();
  const key = (relPath: string) => relPath.toLowerCase();
  return {
    claim: (relPath) => void keys.add(key(relPath)),
    holds: (relPath) => keys.has(key(relPath)),
    releaseAll: () => keys.clear(),
  };
}

export function useOwnRows(): OwnRows {
  const ref = useRef<OwnRows | null>(null);
  if (!ref.current) ref.current = makeOwnRows();
  return ref.current;
}

export interface PreviewRun {
  rows: Row[];
  ac: AbortController;
  previewOne: PreviewOne;
  /** How a finished row lands — the one place a run's own rules live (see below). */
  write: (entry: PreviewEntry) => void;
}

/** The plain rule: this entry is the newest word about its row. */
export function setEntry(setPreviews: PreviewSet, entry: PreviewEntry): void {
  setPreviews((prev) => {
    const next = new Map(prev);
    next.set(entry.relPath, entry);
    return next;
  });
}

/** Every other row keeps its entry; this run only writes the rows it was given. */
export function markLoading(rows: Row[], setPreviews: PreviewSet): void {
  setPreviews((prev) => {
    const next = new Map(prev);
    for (const r of rows) next.set(r.relPath, { relPath: r.relPath, count: 0, thumbs: [], boxes: [], status: "loading" });
    return next;
  });
}

/** null = aborted or failed — nothing is written (each row reports its own outcome). */
async function compute(run: PreviewRun, row: Row): Promise<PreviewEntry | null> {
  try {
    const entry = await run.previewOne(row, run.ac.signal);
    return run.ac.signal.aborted ? null : entry;
  } catch {
    return null;
  }
}

async function runWorker(run: PreviewRun, next: () => Row | null): Promise<void> {
  for (let row = next(); row !== null; row = next()) {
    const entry = await compute(run, row);
    if (entry) run.write(entry);
    await new Promise((r) => setTimeout(r, 0));
  }
}

/** Runs `run.rows` with bounded concurrency; each finished row lands immediately. */
export async function runPreviewRows(run: PreviewRun): Promise<void> {
  const queue = run.rows.slice();
  let idx = 0;
  const next = () => (run.ac.signal.aborted || idx >= queue.length ? null : queue[idx++]);
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, queue.length) }, () => runWorker(run, next));
  await Promise.all(workers);
}

function selectable(rows: Row[]): Row[] {
  return rows.filter((r) => r.status !== "missing" && r.status !== "deleted");
}

export interface PreviewQueueArgs {
  previewOne: PreviewOne;
  setPreviews: PreviewSet;
  setIsPreviewing: Dispatch<SetStateAction<boolean>>;
  abortRef: MutableRefObject<AbortController | null>;
  own: OwnRows;
}

/** The "Preview splits" button: every eligible checked row, replacing any earlier run. */
export function usePreviewQueue(args: PreviewQueueArgs) {
  const { previewOne, setPreviews, setIsPreviewing, abortRef, own } = args;
  return useCallback(
    async (selected: Row[]) => {
      const eligible = selectable(selected);
      if (eligible.length === 0) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      own.releaseAll(); // a fresh run covers every row again — including the hand-tuned ones
      setIsPreviewing(true);
      markLoading(eligible, setPreviews);
      // A row the user tuned on its own bar keeps its preview: this run's answer for
      // that row was computed with the distance it had a moment ago (2026-10-13).
      const write = (entry: PreviewEntry) => {
        if (!own.holds(entry.relPath)) setEntry(setPreviews, entry);
      };
      await runPreviewRows({ rows: eligible, ac, previewOne, write });
      if (!ac.signal.aborted) setIsPreviewing(false);
    },
    [previewOne, abortRef, setPreviews, setIsPreviewing, own],
  );
}
