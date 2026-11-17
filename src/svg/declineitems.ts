// declineitems.ts — "Remove" from a list further down the chain (2026-11-06).
// SVG to upload lists items approved in Generate SVG; Upload lists the exports
// of those items. Taking a row out of either list IS declining its item in
// Generate SVG — the same decision a ✕ there writes, through the same path
// (reviewundo.applySvgReviewPatch) and the same "svgReview" history entry, so
// Undo approves it again and every list follows the announcement. Each record
// names where its pair file is (`at`), so the write never depends on Generate
// SVG having listed the item.

import { withActivity } from "../lib/activity";
import { getAppState } from "../state/appstore";
import type { HistoryActions } from "../state/HistoryProvider";
import { applySvgReviewPatch, type SvgReviewRec } from "./reviewundo";

/** One item to decline: its pair id and its pair file inside the tab's folder. */
export interface DeclineTarget {
  id: string;
  metaPath: string;
}

/** Which list asks: its remembered folder, its name in messages, its activity bar. */
export interface DeclineSpec {
  handleKey: string;
  from: string;
  activity: string;
  /** What else the item leaves, said after "declined in Generate SVG". */
  alsoGone: string;
}

export interface DeclineCtx {
  say: (msg: string, err?: boolean) => void;
  hist: Pick<HistoryActions, "push">;
}

export const plural = (n: number): string => `${n} item${n === 1 ? "" : "s"}`;

function recsOf(targets: readonly DeclineTarget[], spec: DeclineSpec, review: SvgReviewRec["review"]): SvgReviewRec[] {
  return targets.map((t) => ({ id: t.id, review, at: { handleKey: spec.handleKey, metaPath: t.metaPath } }));
}

/** Declines every target in Generate SVG as ONE undoable step; false = nothing written. */
export async function declineItems(c: DeclineCtx, targets: readonly DeclineTarget[], spec: DeclineSpec): Promise<boolean> {
  const n = targets.length;
  const after = recsOf(targets, spec, "declined");
  const ok = await withActivity(spec.activity, `Removing ${plural(n)} — marking declined in Generate SVG…`,
    () => applySvgReviewPatch({ recs: after })).catch(() => false);
  if (!ok) {
    c.say("Nothing was removed — the decision could not be written (the folder is not available, or Generate SVG is working on this item)", true);
    return false;
  }
  c.hist.push({
    type: "svgReview", label: `Remove ${plural(n)} from ${spec.from}`, origin: getAppState().tab,
    ids: targets.map((t) => t.id),
    // every row of these lists is approved by construction (I-78 / I-80)
    before: { recs: recsOf(targets, spec, "approved") }, after: { recs: after },
  });
  c.say(`Removed ${plural(n)} — declined in Generate SVG${spec.alsoGone} (Undo brings ${n === 1 ? "it" : "them"} back)`);
  return true;
}
