import { withCompletionSound } from "../ui/completionSound";
import { reserveSources, SOURCE_BUSY } from "./jobstate";
// reviewact.ts — the SVG review decision and its undo path (prompt §15, RULE 12).
// Owns: approving/declining ONE item at a time (2026-10-20). The status belongs
// to the pair, not to a version, so a decision is written once per row and
// switching the shown version cannot change it. Each pair's OWN file carries it
// (beside the images, I-41); ONE history entry covers the whole operation so an
// undo reverses every source it touched — never one at a time.

import { useEffect, useRef } from "react";
import { withReview, type PairMeta } from "../lib/pairmeta";
import type { ReviewStatus } from "../lib/svgmodel";
import { getAppState } from "../state/appstore";
import { saveMetaAt } from "../selection/pairstore";
import { shownVersion, withMeta } from "./rowmodel";
import { bindSvgReviewApplier, type SvgReviewPatch, type SvgReviewRec } from "./reviewundo";
import { metaForSource } from "./sources";
import type { DirHandleLike } from "../lib/fs";
import type { SvgRefs, SvgRow } from "./types";
import type { SvgSource } from "./sources";

/** A mounted panel owns the review apply path, so an undo lands in the same
 *  pair-file write a click uses (RULE 12). */
export function useReviewApplier(s: ReviewCtx): void {
  const latest = useRef(s);
  latest.current = s;
  useEffect(() => bindSvgReviewApplier((patch) => applyReviewPatch(latest.current, patch)), []);
}

/** What the review actions need from the hook. */
export interface ReviewCtx {
  rows: SvgRow[];
  refs: SvgRefs;
  setRowsFn: (fn: (rows: SvgRow[]) => SvgRow[]) => void;
  say: (msg: string, err?: boolean) => void;
  hist: { push: (entry: {
    type: string; label: string; origin: string; ids: string[];
    before: unknown; after: unknown;
  }) => void };
}

/** The pair's record, or a fresh one when the pair has none yet. */
function metaOf(s: ReviewCtx, row: SvgRow): PairMeta {
  return s.refs.metas.get(row.source.id) ?? row.meta ?? metaForSource(row.source, null);
}

/** Undo/redo entry point: set the recorded item status on every named source. */
export async function applyReviewPatch(s: ReviewCtx, patch: SvgReviewPatch): Promise<boolean> {
  const release = reserveSources(s, patch.recs.map((rec) => rec.id));
  if (release === null) { s.say(SOURCE_BUSY, true); return false; }
  try { return await writeReviewPatch(s, patch); } finally { release(); }
}

async function writeReviewPatch(s: ReviewCtx, patch: SvgReviewPatch): Promise<boolean> {
  const root = s.refs.root.current as DirHandleLike | null;
  let changed = false;
  for (const rec of patch.recs) {
    const row = s.rows.find((r) => r.source.id === rec.id);
    if (!row || row.review === rec.review) continue;
    // The status is the item's, so an undo needs no version: whatever version is
    // shown now, the row goes back to the status the entry recorded.
    const next = withReview(metaOf(s, row), rec.review);
    s.refs.metas.set(rec.id, next);
    if (root) await saveMetaAt(root, row.source.metaPath, next);
    s.setRowsFn((rows) => rows.map((r) => (r.source.id === rec.id ? withMeta(r, next) : r)));
    changed = true;
  }
  return changed;
}

/** Approve / decline the whole item for every named source. */
export async function decideReview(s: ReviewCtx, ids: string[], decision: ReviewStatus): Promise<void> {
  const release = reserveSources(s, ids);
  if (release === null) return s.say(SOURCE_BUSY, true);
  try { await saveReviewDecision(s, ids, decision); } finally { release(); }
}

async function saveReviewDecision(s: ReviewCtx, ids: string[], decision: ReviewStatus): Promise<void> {
  const rows = ids.map((id) => rowOf(s, id)).filter(hasSvg);
  if (rows.length === 0) return s.say("No generated SVG to review yet", true);
  const recs = rows.map((r) => recOf(r, decision));
  await withCompletionSound(async () => {
    await writeAll(s, rows, decision);
    patchRows(s, rows, decision);
    pushEntry(s, rows, decision, recs);
  });
}

/** Re-reads the written pair files into the list without touching other rows. */
function patchRows(s: ReviewCtx, rows: SvgRow[], decision: ReviewStatus): void {
  void decision; // the new status is already inside the written pair file
  s.setRowsFn((all) => all.map((r) => {
    const hit = rows.find((x) => x.source.id === r.source.id);
    const meta = s.refs.metas.get(r.source.id);
    return hit && meta ? withMeta(r, meta) : r;
  }));
}

function pushEntry(s: ReviewCtx, rows: SvgRow[], decision: ReviewStatus, recs: SvgReviewRec[]): void {
  const before = rows.map((r) => recOf(r, r.review));
  const n = recs.length;
  s.say(`${n} SVG${n === 1 ? "" : "s"} marked ${decision}`);
  s.hist.push({
    type: "svgReview",
    label: `${decision === "approved" ? "Approve" : decision === "declined" ? "Decline" : "Needs review"} ${n} SVG${n === 1 ? "" : "s"}`,
    origin: getAppState().tab, ids: recs.map((r) => r.id),
    before: { recs: before }, after: { recs },
  });
}

function rowOf(s: ReviewCtx, id: string): SvgRow | undefined {
  return s.rows.find((r) => r.source.id === id);
}

function hasSvg(row: SvgRow | undefined): row is SvgRow {
  return row !== undefined && shownVersion(row) !== null;
}

/** One history record per row: which source, and the item status it had. */
function recOf(row: SvgRow, review: ReviewStatus): SvgReviewRec {
  return { id: row.source.id, review };
}

/** Writes one pair file per source; a failed write never blocks the others. */
async function writeAll(s: ReviewCtx, rows: SvgRow[], decision: ReviewStatus): Promise<void> {
  const root = s.refs.root.current as DirHandleLike | null;
  for (const row of rows) {
    if (shownVersion(row) === null) continue; // decided rows always have one; a rescan may race
    const next = withReview(metaOf(s, row), decision);
    s.refs.metas.set(row.source.id, next);
    try {
      if (root) await saveMetaAt(root, row.source.metaPath, next);
    } catch {
      s.say(`Could not save the review for ${row.source.name}`, true);
    }
  }
}

/** Kept for the hook's import graph: the sources a review record names. */
export type { SvgSource };
