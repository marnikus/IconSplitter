// svgeditslot.tsx — a row's way into edit mode (2026-11-06): the small ✎ Edit
// control beside the SVG version. It opens the tab's full-screen edit mode
// (pathedit/SvgEditModal) on this row; the row itself never turns into an
// editor. Edit needs a drawn SVG with a shape and no run writing the row.

import type { ReactNode } from "react";
import { pathTags } from "../lib/pathedit/svgdoc";
import { openSvgEditor } from "./pathedit/editmodalstore";
import { approveRowCut } from "./tailcut/cutactions";
import type { TailReview } from "./tailcut/tailreview";
import type { SvgRow } from "./types";

/** The SVG side's bar: Edit (and, after a tail review, Approve cut) beside the version chips. */
export function svgBarOf(row: SvgRow, svg: string | null, chips: ReactNode, review: TailReview | null = null): ReactNode {
  return <>
    <SvgEditButton id={row.source.id} why={editBlocked(row, svg)} />
    {review !== null && <TailReviewBadge id={row.source.id} review={review} busy={row.running || row.queued} />}
    {chips}
  </>;
}

/** After a review: "✂ Approve cut (n)", or "no tails". */
function TailReviewBadge({ id, review, busy }: { id: string; review: TailReview; busy: boolean }) {
  const n = review.tails.length;
  if (n === 0) return <small className="svg-cut-none" data-testid={`svg-cut-none-${id}`}>no tails</small>;
  return (
    <button type="button" className="svg-btn tiny success" data-testid={`svg-cut-approve-${id}`} disabled={busy}
      title="Cut the highlighted tails of this SVG — one undo step" onClick={(e) => { e.stopPropagation(); approveRowCut(id); }}>
      ✂ Approve cut ({n})
    </button>
  );
}

export function PairBars({ ai, aiWidth, svg, svgWidth }: { ai: ReactNode; aiWidth: number; svg: ReactNode; svgWidth: number }) {
  return (
    <div className="svg-pair-bars">
      <div className="svg-pair-bar" style={{ width: `${aiWidth}px` }}>{ai}</div>
      <div className="svg-pair-bar" style={{ width: `${svgWidth}px` }}>{svg}</div>
    </div>
  );
}

/** Why this row cannot be edited now, or null. */
export function editBlocked(row: SvgRow, svg: string | null): string | null {
  if (svg === null) return "No SVG to edit yet";
  if (row.running || row.queued) return "Generating or queued — wait until it finishes";
  return pathTags(svg).length === 0 ? "This SVG has no shape to edit" : null;
}

/** The small Edit control beside the SVG version. */
function SvgEditButton({ id, why }: { id: string; why: string | null }) {
  return (
    <button type="button" className="svg-btn tiny" data-testid={`svg-edit-btn-${id}`} disabled={why !== null}
      title={why ?? "Edit this SVG in full screen: anchors stay visible until Finish edit (one undo step) or Cancel"}
      onClick={(e) => { e.stopPropagation(); openSvgEditor(id); }}>✎ Edit</button>
  );
}
