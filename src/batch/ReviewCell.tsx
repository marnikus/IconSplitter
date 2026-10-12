// ReviewCell.tsx — the batch split-review cell: the decision badge (glyph +
// label, never colour alone) and the row's own approve/decline pair, the same
// controls and classes as the Generate SVG rows (shared DecisionButtons look).

import { statusInfo } from "../lib/reviewmeta";
import type { ReviewStatus } from "../lib/reviewstatus";
import type { Row } from "./useBatchTypes";

export interface ReviewCellProps {
  r: Row;
  onDecide?: (relPath: string, review: ReviewStatus) => void;
}

export default function ReviewCell({ r, onDecide }: ReviewCellProps) {
  const meta = statusInfo(r.review);
  const disabled = r.status === "missing" || r.status === "deleted" || !onDecide;
  return (
    <div className="svg-cell" data-testid={`batch-review-${r.relPath}`}>
      <span className={`svg-badge ${r.review}`} data-testid={`batch-review-badge-${r.relPath}`}>
        {meta.glyph} {meta.label}
      </span>
      <div className="flex gap-1 pt-1">
        <button
          type="button" className="svg-btn tiny success" disabled={disabled || r.review === "approved"}
          data-testid={`batch-review-approve-${r.relPath}`} aria-label={`Approve ${r.name}`}
          onClick={(e) => { e.stopPropagation(); onDecide?.(r.relPath, "approved"); }}
        >✓</button>
        <button
          type="button" className="svg-btn tiny danger" disabled={disabled || r.review === "declined"}
          data-testid={`batch-review-decline-${r.relPath}`} aria-label={`Decline ${r.name}`}
          onClick={(e) => { e.stopPropagation(); onDecide?.(r.relPath, "declined"); }}
        >✕</button>
      </div>
    </div>
  );
}
