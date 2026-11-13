// removerows.ts — "Remove" in SVG to upload (2026-11-06). The list shows items
// approved in Generate SVG, so taking a row out IS declining that item there
// (svg/declineitems). Nothing here edits the list directly for the click: the
// list follows every announced decision (`reactToUploadReviews`), so a click,
// an undo and a redo all update it the same way.

import { useCallback, useEffect, useRef } from "react";
import { getAppState, patchUpload } from "../state/appstore";
import { declineItems, plural, type DeclineCtx } from "../svg/declineitems";
import { onSvgReviewsWritten, type SvgReviewRec } from "../svg/reviewundo";
import { UPLOAD_HANDLE_KEY } from "./scan";
import type { UploadRow } from "./types";

export interface UploadRemoveCtx extends DeclineCtx {
  rows: UploadRow[];
}

const SPEC = { handleKey: UPLOAD_HANDLE_KEY, from: "SVG to upload", activity: "upload", alsoGone: "" };

/** Declines the rows' items in Generate SVG, which takes them out of this list. */
export async function removeUploadRows(c: UploadRemoveCtx, ids: readonly string[]): Promise<boolean> {
  const rows = c.rows.filter((r) => ids.includes(r.source.id));
  if (rows.length === 0) { c.say("Select the icons to remove", true); return false; }
  const busy = rows.filter((r) => r.running !== null).length;
  if (busy > 0) {
    c.say(`${plural(busy)} ${busy === 1 ? "is" : "are"} exporting or getting metadata — wait or cancel the run first; nothing was removed`, true);
    return false;
  }
  return declineItems(c, rows.map((r) => ({ id: r.source.id, metaPath: r.source.metaPath })), SPEC);
}

interface FollowParts {
  rows: UploadRow[];
  setRowsFn: (fn: (rows: UploadRow[]) => UploadRow[]) => void;
}

/** Declined items leave the list and the selection; an approved one it lacks needs a rescan. */
export function reactToUploadReviews(c: FollowParts, recs: readonly Pick<SvgReviewRec, "id" | "review">[]): { rescan: boolean } {
  const gone = new Set(recs.filter((r) => r.review !== "approved").map((r) => r.id));
  const listed = new Set(c.rows.map((r) => r.source.id));
  if ([...gone].some((id) => listed.has(id))) {
    c.setRowsFn((rows) => rows.filter((r) => !gone.has(r.source.id)));
    const { checked, activeId, anchorId } = getAppState().upload;
    patchUpload({
      checked: checked.filter((id) => !gone.has(id)),
      activeId: activeId !== null && gone.has(activeId) ? null : activeId,
      anchorId: anchorId !== null && gone.has(anchorId) ? null : anchorId,
    });
  }
  return { rescan: recs.some((r) => r.review === "approved" && !listed.has(r.id)) };
}

interface FollowCtx extends FollowParts {
  /** Rescans now if this tab is open and idle; otherwise its next visit rescans anyway. */
  rescanIfOpen: () => void;
}

/** The mounted panel follows every item decision written to files, wherever it came from. */
export function useUploadReviewFollower(c: FollowCtx): void {
  const latest = useRef(c);
  latest.current = c;
  useEffect(() => onSvgReviewsWritten((recs) => {
    if (reactToUploadReviews(latest.current, recs).rescan) latest.current.rescanIfOpen();
  }), []);
}

/** The Remove buttons' handler: one stable callback that reads the latest context. */
export function useUploadRemoveAction(c: UploadRemoveCtx): (ids: string[]) => void {
  const latest = useRef(c);
  latest.current = c;
  return useCallback((ids: string[]) => { void removeUploadRows(latest.current, ids); }, []);
}
