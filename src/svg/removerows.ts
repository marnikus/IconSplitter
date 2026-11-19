// removerows.ts — "Remove" in Generate SVG (2026-11-04). The list shows only
// images approved in Selection V2, so taking a row out of it IS declining that
// image: the same pair decision, written through the same path a Selection V2
// decline uses (selection/offline applyDecisionPatch), recorded as the same
// "decisions" history entry — undo restores "approved" and the row returns.
// Nothing here edits the list directly: the list follows every decision that
// reaches a file (`reactToDecisions`), so a click, an undo and a redo all
// update it the same way.

import { useCallback, useEffect, useRef } from "react";
import { metaPathForAi, toRecord, withDecision, type PairMeta } from "../lib/pairmeta";
import { svgStem } from "../lib/svgfile";
import { baseRowId, styleRowId } from "../lib/svgstyles";
import { loadMetaAt, pairRefOf } from "../selection/pairstore";
import { styleMetaPathAt, stylePrefs } from "./styles";
import type { DirHandleLike } from "../lib/fs";
import type { ReviewPair } from "../lib/pairing";
import type { ReviewRecord } from "../lib/reviewfile";
import { withActivity } from "../lib/activity";
import { applyDecisionPatch, onDecisionsWritten, type WrittenDecision } from "../selection/offline";
import { getAppState, patchSvg } from "../state/appstore";
import type { HistoryActions } from "../state/HistoryProvider";
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
async function recordsOf(c: RemoveCtx, metaPath: string, known: PairMeta | null, nowIso: string): Promise<{ before: ReviewRecord | null; after: ReviewRecord | null }> {
  const root = c.refs.root.current as DirHandleLike | null;
  const onDisk = root === null ? null : (await loadMetaAt(root, metaPath).catch(() => null))?.meta ?? null;
  const meta = onDisk ?? known;
  if (meta === null) return { before: null, after: null };
  const pair = pairRefOf(meta);
  return { before: recordOf(meta, pair), after: recordOf(withDecision(meta, "declined", nowIso), pair) };
}

/**
 * The pair's own record — or, when `toRecord` refuses a face that is named but
 * was never hashed (a registered style pair: `sideOf(rel, "")`, 2026-11-18), a
 * record built from the names its pair file itself carries, so a removal's
 * decline reaches that file too and the listed row leaves with it. Pending
 * still owns no record (I-13).
 */
function recordOf(meta: PairMeta, pair: ReviewPair): ReviewRecord | null {
  const own = toRecord(meta, pair);
  if (own !== null) return own;
  if (meta.decision === null || meta.decision === "pending") return null;
  const ai = meta.ai.relPath === "" ? null : meta.ai.relPath;
  const source = meta.source?.relPath || null;
  if (ai === null && source === null) return null;
  return { pair_id: meta.id, source, ai_result: ai, decision: meta.decision, reviewed_at: meta.reviewedAt ?? new Date(0).toISOString() };
}

/**
 * Every pair file one removal declines (2026-11-17): the row's BASE pair and each
 * registered style pair the row's folder actually holds — so a removal made in
 * any mode takes the item out of ALL of them, and one undo brings them all back.
 * Style pairs are read from disk by the registration's own naming rule when the
 * scan's records do not hold them (a base-mode scan never reads style files).
 */
async function baseMember(c: RemoveCtx, rows: readonly SvgRow[], baseId: string, root: DirHandleLike | null): Promise<{ meta: PairMeta; metaPath: string } | null> {
  const listed = rows.find((r) => r.source.id === baseId);
  const known = (c.refs.metas.get(baseId) as PairMeta | undefined) ?? listed?.meta ?? null;
  const metaPath = listed?.source.metaPath ?? (known === null ? "" : metaPathForAi(known.ai.relPath));
  const meta = known ?? (root === null || metaPath === "" ? null : (await loadMetaAt(root, metaPath).catch(() => null))?.meta ?? null);
  return meta === null ? null : { meta, metaPath };
}

/** One registered style pair the row's folder holds: the scan's records, else the disk by the registration's naming rule. */
async function styleMember(c: RemoveCtx, root: DirHandleLike | null, at: { id: string; meta: PairMeta }, style: string): Promise<{ meta: PairMeta; metaPath: string } | null> {
  const id = styleRowId(at.id, style);
  const known = (c.refs.metas.get(id) as PairMeta | undefined) ?? null;
  if (known !== null) return { meta: known, metaPath: metaPathForAi(known.ai.relPath) };
  if (root === null) return null;
  const path = await styleMetaPathAt(root, at.meta.dirPath, svgStem(at.meta.ai.name), style);
  if (path === null) return null;
  const read = await loadMetaAt(root, path).catch(() => null);
  return read?.meta?.id === id ? { meta: read.meta, metaPath: path } : null;
}

async function familyOf(c: RemoveCtx, rows: readonly SvgRow[], root: DirHandleLike | null): Promise<Map<string, { meta: PairMeta; metaPath: string }>> {
  const out = new Map<string, { meta: PairMeta; metaPath: string }>();
  for (const baseId of new Set(rows.map((r) => baseRowId(r.source.id)))) {
    const base = await baseMember(c, rows, baseId, root);
    if (base === null) continue; // an unknown base: nothing to decline
    out.set(baseId, base);
    for (const style of stylePrefs().styles) {
      const member = await styleMember(c, root, { id: baseId, meta: base.meta }, style);
      if (member !== null) out.set(styleRowId(baseId, style), member);
    }
  }
  return out;
}

/** Why these rows cannot leave the list right now, or null. */
function refusal(rows: readonly SvgRow[]): string | null {
  if (rows.length === 0) return "Select the images to remove";
  const busy = rows.filter((r) => r.running || r.queued);
  if (busy.length === 0) return null;
  return `${plural(busy.length)} ${busy.length === 1 ? "is" : "are"} generating or waiting in the queue — wait or drop it from the queue first; nothing was removed`;
}

/** Declines the images in Selection V2 — base pair and every style pair — which takes their rows out of Generate SVG, in every mode. */
export async function removeFromList(c: RemoveCtx, ids: readonly string[]): Promise<boolean> {
  const rows = c.rows.filter((r) => ids.includes(r.source.id));
  const why = refusal(rows);
  if (why !== null) { c.say(why, true); return false; }
  const root = c.refs.root.current as DirHandleLike | null;
  const family = await familyOf(c, rows, root);
  if (family.size === 0) { c.say("Nothing to remove — no pair file behind these rows", true); return false; }
  const now = new Date().toISOString();
  const entries = [...family.entries()];
  const recs = await Promise.all(entries.map(([, f]) => recordsOf(c, f.metaPath, f.meta, now)));
  const touched = entries.map(([id]) => id);
  const after = recs.flatMap((r) => (r.after === null ? [] : [r.after]));
  const ok = await withActivity("svg", `Removing ${plural(rows.length)} — marking declined…`,
    () => applyDecisionPatch(touched, { recs: after }));
  if (!ok) { c.say("The decline could not be written — the folder is not available; nothing was removed", true); return false; }
  const styleCount = touched.length - rows.length;
  c.hist.push({
    type: "decisions", label: `Remove ${plural(rows.length)} from Generate SVG`, origin: getAppState().tab, ids: touched,
    before: { recs: recs.flatMap((r) => (r.before === null ? [] : [r.before])) }, after: { recs: after },
  });
  const styles = styleCount > 0 ? `, with ${styleCount} style pair${styleCount === 1 ? "" : "s"}` : "";
  c.say(`Removed ${plural(rows.length)} — declined in Selection V2${styles} (Undo brings ${rows.length === 1 ? "it" : "them"} back)`);
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
