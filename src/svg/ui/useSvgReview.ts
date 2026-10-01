// ui/useSvgReview.ts — version-level decisions on durable sidecars with global
// undo/redo snapshots; unlike generation, a review edit never touches SVG bytes.

import type { DirHandleLike } from "../../lib/fs";
import { getAppState } from "../../state/appstore";
import { useHistory } from "../../state/HistoryProvider";
import { writeSvgReviewChanges, type SvgReviewChange } from "../review";
import type { SvgReviewDecision, SvgSourceRow } from "../types";

export function useSvgReview() {
  const history = useHistory();
  async function review(root: DirHandleLike | null, rows: SvgSourceRow[], decision: SvgReviewDecision, version?: number): Promise<string | null> {
    const changes = reviewChanges(rows, decision, version);
    if (!root || changes.length === 0) return "No available SVG version in the visible selection can be reviewed.";
    if (!await writeSvgReviewChanges(root, changes, "after")) return "Review metadata could not be saved; no review change was recorded.";
    history.push(historyEntry(changes, decision));
    return null;
  }
  return { review };
}

function reviewChanges(rows: SvgSourceRow[], decision: SvgReviewDecision, requestedVersion?: number): SvgReviewChange[] {
  const timestamp = new Date().toISOString();
  return rows.flatMap((row) => {
    const version = row.versions.find((item) => item.version === (requestedVersion ?? row.newestVersion) && item.available);
    return version ? [{ sourceId: row.sourceId, sourcePath: row.relativePath, version: version.version,
      before: version.review, beforeAt: version.reviewedAt, after: decision,
      afterAt: decision === "pending" ? null : timestamp }] : [];
  });
}

function historyEntry(changes: SvgReviewChange[], decision: SvgReviewDecision) {
  const label = `${decision === "approved" ? "Approve" : decision === "declined" ? "Decline" : "Reset"} ${changes.length} SVG version${changes.length === 1 ? "" : "s"}`;
  return {
    type: "svgReview", label, origin: getAppState().tab, ids: changes.map((change) => change.sourceId),
    before: { side: "before", changes }, after: { side: "after", changes },
  };
}
