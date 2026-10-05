// reviewact.ts — the SVG review decision and its undo path (prompt §15, RULE 12).
// Owns: approving/declining the newest version of one or many sources, writing
// each pair's OWN file (versions + review stay beside the images, I-41), and
// publishing ONE history entry for the whole operation so an undo reverses every
// source it touched — never one at a time.

import { useEffect, useRef } from "react";
import { withVersion, type PairMeta } from "../lib/pairmeta";
import type { ReviewStatus } from "../lib/svgmodel";
import { getAppState } from "../state/appstore";
import { saveMetaAt } from "../selection/pairfile";
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
function metaOf(row: SvgRow): PairMeta {
  return row.meta ?? metaForSource(row.source, null);
}

/** Undo/redo entry point: set the recorded review status on every named version. */
export async function applyReviewPatch(s: ReviewCtx, patch: SvgReviewPatch): Promise<boolean> {
  const root = s.refs.root.current as DirHandleLike | null;
  let changed = false;
  for (const rec of patch.recs) {
    const row = s.rows.find((r) => r.source.id === rec.id);
    if (!row?.newest) continue;
    const next = withVersion(metaOf(row), { ...row.newest, review: rec.review });
    s.refs.metas.set(rec.id, next);
    if (root) await saveMetaAt(root, row.source.metaPath, next);
    s.setRowsFn((rows) => rows.map((r) => (r.source.id === rec.id
      ? { ...r, meta: next, newest: { ...(r.newest as NonNullable<SvgRow["newest"]>), review: rec.review } }
      : r)));
    changed = true;
  }
  return changed;
}

/** Approve / decline the newest version of every named source. */
export async function decideReview(s: ReviewCtx, ids: string[], decision: ReviewStatus): Promise<void> {
  const rows = ids.map((id) => rowOf(s, id)).filter(hasNewest);
  if (rows.length === 0) return s.say("No generated SVG to review yet", true);
  const recs = rows.map((r) => recOf(r, decision));
  await writeAll(s, rows, decision);
  patchRows(s, rows, decision);
  pushEntry(s, rows, decision, recs);
}

/** Keeps the newest version's status in step without touching other rows. */
function patchRows(s: ReviewCtx, rows: SvgRow[], decision: ReviewStatus): void {
  s.setRowsFn((all) => all.map((r) => {
    const hit = rows.find((x) => x.source.id === r.source.id);
    return hit && r.newest ? { ...r, meta: s.refs.metas.get(r.source.id) ?? r.meta, newest: { ...r.newest, review: decision } } : r;
  }));
}

function pushEntry(s: ReviewCtx, rows: SvgRow[], decision: ReviewStatus, recs: SvgReviewRec[]): void {
  const before = rows.map((r) => recOf(r, r.newest?.review ?? "pending"));
  const n = recs.length;
  s.say(`${n} SVG${n === 1 ? "" : "s"} marked ${decision}`);
  s.hist.push({
    type: "svgReview",
    label: `${decision === "approved" ? "Approve" : "Decline"} ${n} SVG${n === 1 ? "" : "s"}`,
    origin: getAppState().tab, ids: recs.map((r) => r.id),
    before: { recs: before }, after: { recs },
  });
}

function rowOf(s: ReviewCtx, id: string): SvgRow | undefined {
  return s.rows.find((r) => r.source.id === id);
}

function hasNewest(row: SvgRow | undefined): row is SvgRow {
  return row !== undefined && row.newest !== null;
}

function recOf(row: SvgRow, review: ReviewStatus): SvgReviewRec {
  return { id: row.source.id, version: row.newest?.version ?? 0, review };
}

/** Writes one pair file per source; a failed write never blocks the others. */
async function writeAll(s: ReviewCtx, rows: SvgRow[], decision: ReviewStatus): Promise<void> {
  const root = s.refs.root.current as DirHandleLike | null;
  for (const row of rows) {
    const next = withVersion(metaOf(row), { ...(row.newest as NonNullable<SvgRow["newest"]>), review: decision });
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
