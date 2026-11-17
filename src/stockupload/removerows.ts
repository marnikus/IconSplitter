// removerows.ts — "Remove" in Upload (2026-11-06). Upload lists the exports of
// items approved in Generate SVG, so taking a row out IS declining its source
// item there (svg/declineitems): it leaves SVG to upload as well, and Upload's
// scan hides an export whose source is no longer approved. The list follows
// every announced decision (`reactToStockReviews`) — a click, an undo, a redo.

import { useCallback, useEffect, useRef } from "react";
import type { ExportedItem } from "../lib/stockupload/types";
import { getAppState, patchStockUpload } from "../state/appstore";
import { declineItems, plural, type DeclineCtx } from "../svg/declineitems";
import { onSvgReviewsWritten, type SvgReviewRec } from "../svg/reviewundo";
import { STOCK_UPLOAD_HANDLE_KEY } from "./scan";

export interface StockRemoveCtx extends DeclineCtx {
  items: ExportedItem[];
  uploading: boolean;
}

const SPEC = {
  handleKey: STOCK_UPLOAD_HANDLE_KEY, from: "Upload", activity: "stock", alsoGone: ", so it also left SVG to upload",
};

/** Why these items cannot be removed now, or null. */
function refusal(c: StockRemoveCtx, items: readonly ExportedItem[]): string | null {
  if (items.length === 0) return "Select the items to remove";
  if (c.uploading) return "An upload is running — wait or cancel it first; nothing was removed";
  const orphans = items.filter((it) => !it.source).length;
  if (orphans === 0) return null;
  return `${plural(orphans)} ${orphans === 1 ? "has" : "have"} no pair file under this folder — open the folder that holds the sources, not only export/; nothing was removed`;
}

/** Declines the items' sources in Generate SVG, which takes them out of this list. */
export async function removeStockItems(c: StockRemoveCtx, ids: readonly string[]): Promise<boolean> {
  const items = c.items.filter((it) => ids.includes(it.id));
  const why = refusal(c, items);
  if (why !== null) { c.say(why, true); return false; }
  const targets = items.flatMap((it) => (it.source ? [{ id: it.source.id, metaPath: it.source.metaPath }] : []));
  return declineItems(c, targets, SPEC);
}

interface FollowParts {
  items: ExportedItem[];
  setItems: (items: ExportedItem[]) => void;
}

/** Items whose source was declined leave the list and the selection; a re-approved one needs a rescan. */
export function reactToStockReviews(c: FollowParts, recs: readonly Pick<SvgReviewRec, "id" | "review">[]): { rescan: boolean } {
  const gone = new Set(recs.filter((r) => r.review !== "approved").map((r) => r.id));
  const hit = (it: ExportedItem) => gone.has(it.id) || (it.source ? gone.has(it.source.id) : false);
  const leaving = c.items.filter(hit).map((it) => it.id);
  if (leaving.length > 0) {
    c.setItems(c.items.filter((it) => !hit(it)));
    const out = new Set(leaving);
    const { checked, activeId, anchorId } = getAppState().stockUpload;
    patchStockUpload({
      checked: checked.filter((id) => !out.has(id)),
      activeId: activeId !== null && out.has(activeId) ? null : activeId,
      anchorId: anchorId !== null && out.has(anchorId) ? null : anchorId,
    });
  }
  const listed = (id: string) => c.items.some((it) => it.id === id || it.source?.id === id);
  return { rescan: recs.some((r) => r.review === "approved" && !listed(r.id)) };
}

interface FollowCtx extends FollowParts {
  /** Rescans now if this tab is open and idle; otherwise its next visit rescans anyway. */
  rescanIfOpen: () => void;
}

/** The mounted panel follows every item decision written to files, wherever it came from. */
export function useStockReviewFollower(c: FollowCtx): void {
  const latest = useRef(c);
  latest.current = c;
  useEffect(() => onSvgReviewsWritten((recs) => {
    if (reactToStockReviews(latest.current, recs).rescan) latest.current.rescanIfOpen();
  }), []);
}

/** The Remove buttons' handler: one stable callback that reads the latest context. */
export function useStockRemoveAction(c: StockRemoveCtx): (ids: string[]) => void {
  const latest = useRef(c);
  latest.current = c;
  return useCallback((ids: string[]) => { void removeStockItems(latest.current, ids); }, []);
}
