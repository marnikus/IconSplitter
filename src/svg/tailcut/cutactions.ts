// cutactions.ts — running the tail cutter on Generate SVG rows (2026-11-06).
// Only the given (checked) rows, never one a run is writing. Auto-cut: every
// row's tails are cut at once, ONE undo step for the whole run. Otherwise each
// row is reviewed (its tails kept for the highlights, nothing written) and
// Approve cuts the reviewed rows — again one undo step. An approve re-reads
// the file and re-detects when it changed since the review.

import { useEffect, useMemo } from "react";
import type { DirHandleLike } from "../../lib/fs";
import { cutTails, findTails, type Tail } from "../../lib/tailcut";
import { saveSvgEdits, type SvgEditFile } from "../svgedit";
import { readSvgText } from "../svgfiles";
import { getCutSettings } from "./cutsettings";
import { forgetTailReviews, getTailReview, setTailReviews, type TailReview } from "./tailreview";

/** One row as the cutter needs it. */
export interface CutItem { id: string; svgPath: string; label: string; busy: boolean }

export interface CutCtx {
  items: readonly CutItem[];
  rootRef: { current: DirHandleLike | null };
  say: (msg: string, err?: boolean) => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The rows to work on: given, known, not busy, with an SVG. */
function targets(c: CutCtx, ids: readonly string[]): CutItem[] {
  return c.items.filter((it) => ids.includes(it.id) && !it.busy && it.svgPath !== "");
}

async function readAll(c: CutCtx, rows: CutItem[]): Promise<{ row: CutItem; source: string }[]> {
  const root = c.rootRef.current;
  if (root === null) return [];
  const read = await Promise.all(rows.map(async (row) => ({ row, source: await readSvgText(root, row.svgPath).catch(() => null) })));
  return read.filter((r): r is { row: CutItem; source: string } => r.source !== null);
}

/** Cuts and saves, one undo step; returns tails cut and files written. */
async function cutAndSave(found: { row: CutItem; source: string; tails: Tail[] }[], label: string): Promise<{ tails: number; files: number }> {
  const files: SvgEditFile[] = found.flatMap(({ row, source, tails }) => {
    const after = cutTails(source, tails);
    return after === null ? [] : [{ id: row.id, svgPath: row.svgPath, before: source, after }];
  });
  const written = await saveSvgEdits(files, label);
  return { tails: found.reduce((n, f) => n + f.tails.length, 0), files: written };
}

/** "Cut tails": auto → cut at once; otherwise review (highlight) and wait for Approve. */
export async function runTailCutter(c: CutCtx, ids: readonly string[]): Promise<void> {
  const { tolerancePx, auto } = getCutSettings();
  const read = await readAll(c, targets(c, ids));
  const found = read.map((r) => ({ ...r, tails: findTails(r.source, tolerancePx) }));
  const count = found.reduce((n, f) => n + f.tails.length, 0);
  if (auto) {
    const done = await cutAndSave(found.filter((f) => f.tails.length > 0), `Cut ${plural(count, "tail")}`);
    forgetTailReviews(found.map((f) => f.row.id));
    c.say(`Cut ${plural(done.tails, "tail")} in ${plural(done.files, "SVG")} (Undo puts them back)`);
    return;
  }
  setTailReviews(new Map(found.map((f): [string, TailReview] => [f.row.id, { svgPath: f.row.svgPath, source: f.source, tails: f.tails }])));
  c.say(`Found ${plural(count, "tail")} in ${plural(found.filter((f) => f.tails.length > 0).length, "SVG")} — highlighted; approve to cut`);
}

/** Approve: cut every reviewed row among `ids` (re-detected if its file changed since the review). */
export async function approveCuts(c: CutCtx, ids: readonly string[]): Promise<void> {
  const reviewed = targets(c, ids).filter((it) => (getTailReview(it.id)?.tails.length ?? 0) > 0);
  const read = await readAll(c, reviewed);
  const { tolerancePx } = getCutSettings();
  const found = read.map((r) => {
    const review = getTailReview(r.row.id);
    return { ...r, tails: review !== null && review.source === r.source ? review.tails : findTails(r.source, tolerancePx) };
  });
  const count = found.reduce((n, f) => n + f.tails.length, 0);
  const done = await cutAndSave(found, `Cut ${plural(count, "tail")}`);
  forgetTailReviews(reviewed.map((r) => r.id));
  c.say(`Cut ${plural(done.tails, "tail")} in ${plural(done.files, "SVG")} (Undo puts them back)`);
}

let live: CutCtx | null = null;

/** The mounted panel lends its rows and folder, so a row's own Approve can cut it. */
export function useTailCutterBinding(c: CutCtx): void {
  useEffect(() => { live = c; return () => { if (live === c) live = null; }; }, [c]);
}

/** A row's "Approve cut" button. */
export function approveRowCut(id: string): void {
  if (live !== null) void approveCuts(live, [id]);
}

/** The bulk bar's surface: run on the checked rows, approve the checked reviewed rows. */
export function useTailCutter(c: CutCtx, checked: readonly string[]): { run: () => void; approve: () => void } {
  useTailCutterBinding(c);
  return useMemo(() => ({ run: () => { void runTailCutter(c, checked); }, approve: () => { void approveCuts(c, checked); } }), [c, checked]);
}

/** The Generate SVG tab's rows as the cutter needs them. */
export function cutItemsOf(rows: readonly { source: { id: string; stem: string }; running: boolean; queued: boolean }[], svgPathOf: (row: never) => string): CutItem[] {
  return rows.map((r) => ({ id: r.source.id, svgPath: svgPathOf(r as never), label: r.source.stem, busy: r.running || r.queued }));
}
