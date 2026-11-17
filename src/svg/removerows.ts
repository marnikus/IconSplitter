// removerows.ts — "Remove" in Generate SVG (2026-11-04). The list shows only
// images approved in Selection V2, so taking a row out of it IS declining that
// image: the same pair decision, written through the same path a Selection V2
// decline uses (selection/offline applyDecisionPatch), recorded as the same
// "decisions" history entry — undo restores "approved" and the row returns.
// Nothing here edits the list directly: the list follows every decision that
// reaches a file (`reactToDecisions`), so a click, an undo and a redo all
// update it the same way.

import { useCallback, useEffect, useRef } from "react";
import { toRecord, withDecision } from "../lib/pairmeta";
import { loadMetaAt, pairRefOf } from "../selection/pairstore";
import type { DirHandleLike } from "../lib/fs";
import type { ReviewRecord } from "../lib/reviewfile";
import { withActivity } from "../lib/activity";
import { applyDecisionPatch, onDecisionsWritten, type WrittenDecision } from "../selection/offline";
import { getAppState, patchSvg } from "../state/appstore";
import type { HistoryActions } from "../state/HistoryProvider";
import { metaForSource } from "./sources";
import type { SvgRefs, SvgRow } from "./types";

export interface RemoveCtx {
  refs: SvgRefs;
  rows: SvgRow[];
  say: (msg: string, err?: boolean) => void;
  hist: Pick<HistoryActions, "push">;
}

const plural = (n: number) => `${n} image${n === 1 ? "" : "s"}`;

/**
 * The pair's decision record before and after the decline (pending owns none,
 * I-13). "Before" is read from the pair file itself — Selection V2 may have
 * changed it since this list was scanned — and falls back to the scanned copy.
 */
async function recordsOf(c: RemoveCtx, row: SvgRow, nowIso: string): Promise<{ before: ReviewRecord | null; after: ReviewRecord | null }> {
  const root = c.refs.root.current as DirHandleLike | null;
  const onDisk = root === null ? null : (await loadMetaAt(root, row.source.metaPath).catch(() => null))?.meta ?? null;
  const meta = onDisk ?? c.refs.metas.get(row.source.id) ?? metaForSource(row.source, row.meta);
  const pair = pairRefOf(meta);
  return { before: toRecord(meta, pair), after: toRecord(withDecision(meta, "declined", nowIso), pair) };
}

/** Why these rows cannot leave the list right now, or null. */
function refusal(rows: readonly SvgRow[]): string | null {
  if (rows.length === 0) return "Select the images to remove";
  const busy = rows.filter((r) => r.running || r.queued);
  if (busy.length === 0) return null;
  return `${plural(busy.length)} ${busy.length === 1 ? "is" : "are"} generating or waiting in the queue — wait or drop it from the queue first; nothing was removed`;
}

/** Declines the images in Selection V2, which takes their rows out of Generate SVG. */
export async function removeFromList(c: RemoveCtx, ids: readonly string[]): Promise<boolean> {
  const rows = c.rows.filter((r) => ids.includes(r.source.id));
  const why = refusal(rows);
  if (why !== null) { c.say(why, true); return false; }
  const now = new Date().toISOString();
  const recs = await Promise.all(rows.map((row) => recordsOf(c, row, now)));
  const touched = rows.map((r) => r.source.id);
  const after = recs.flatMap((r) => (r.after === null ? [] : [r.after]));
  const ok = await withActivity("svg", `Removing ${plural(rows.length)} — marking declined…`,
    () => applyDecisionPatch(touched, { recs: after }));
  if (!ok) { c.say("The decline could not be written — the folder is not available; nothing was removed", true); return false; }
  c.hist.push({
    type: "decisions", label: `Remove ${plural(rows.length)} from Generate SVG`, origin: getAppState().tab, ids: touched,
    before: { recs: recs.flatMap((r) => (r.before === null ? [] : [r.before])) }, after: { recs: after },
  });
  c.say(`Removed ${plural(rows.length)} — declined in Selection V2 (Undo brings ${rows.length === 1 ? "it" : "them"} back)`);
  return true;
}

/**
 * The list follows written decisions: a pair that is no longer approved leaves
 * the list (and the selection); an approved pair the list lacks needs a rescan,
 * because only a scan can rebuild its row.
 */
export function reactToDecisions(
  c: Pick<RemoveCtx, "rows"> & { setRowsFn: (fn: (rows: SvgRow[]) => SvgRow[]) => void },
  written: readonly WrittenDecision[],
): { rescan: boolean } {
  const gone = new Set(written.filter((w) => w.decision !== "approved").map((w) => w.id));
  const listed = new Set(c.rows.map((r) => r.source.id));
  if (gone.size > 0) {
    c.setRowsFn((rows) => rows.filter((r) => !gone.has(r.source.id)));
    dropFromSelection(gone);
  }
  return { rescan: written.some((w) => w.decision === "approved" && !listed.has(w.id)) };
}

function dropFromSelection(gone: ReadonlySet<string>): void {
  const { checked, activeId, anchorId } = getAppState().svg;
  patchSvg({
    checked: checked.filter((id) => !gone.has(id)),
    activeId: activeId !== null && gone.has(activeId) ? null : activeId,
    anchorId: anchorId !== null && gone.has(anchorId) ? null : anchorId,
  });
}

interface FollowCtx {
  rows: SvgRow[];
  setRowsFn: (fn: (rows: SvgRow[]) => SvgRow[]) => void;
  /** Rescans when idle; a running process defers it to the next return to the tab. */
  rescanIfIdle: () => void;
}

/** The mounted panel follows every decision written to files, wherever it came from. */
export function useDecisionFollower(c: FollowCtx): void {
  const latest = useRef(c);
  latest.current = c;
  useEffect(() => onDecisionsWritten((written) => {
    if (reactToDecisions(latest.current, written).rescan) latest.current.rescanIfIdle();
  }), []);
}

/** The Remove button's handler: one callback that always reads the latest context. */
export function useRemoveAction(c: RemoveCtx): (ids: string[]) => void {
  const latest = useRef(c);
  latest.current = c;
  return useCallback((ids: string[]) => { void removeFromList(latest.current, ids); }, []);
}
