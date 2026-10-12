// BatchBulkBar.tsx — bulk bar for Batch folders, same visual as SVG output
// Refactored to reuse ZoomSliderBase, adds Preview splits beside Split approved,
// and the split-review bulk decisions (approve/decline the checked rows).

import type { CheckState } from "../lib/reviewselect";
import type { ReviewStatus } from "../lib/reviewstatus";
import ZoomSliderBase from "../ui/ZoomSliderBase";

export interface BatchBulkBarProps {
  header: CheckState;
  checkedCount: number;
  visibleCount: number;
  totalCount: number;
  hiddenCount: number;
  affectedCount: number;
  thumb: number;
  selectedCount: number;
  /** Checked rows the gate will actually split (checked AND approved). */
  approvedCheckedCount: number;
  onToggleAll: (on: boolean) => void;
  onSelectVisible: () => void;
  onDeselectAll: () => void;
  onThumb: (px: number) => void;
  onSplit: () => void;
  onPreview?: () => void;
  onDecide?: (review: ReviewStatus) => void;
  canSplit: boolean;
  canPreview?: boolean;
  previewing?: boolean;
}

function Left(p: BatchBulkBarProps) {
  return (
    <>
      <span className="svg-selected-copy" data-testid="batch-selected-count">
        {p.checkedCount} selected
      </span>
      <span className="svg-scope-copy" data-testid="batch-scope">
        across {p.visibleCount} visible images
      </span>
      {p.hiddenCount > 0 && (
        <span className="svg-scope-copy warn" data-testid="batch-hidden">
          {p.hiddenCount} checked but hidden by filters
        </span>
      )}
    </>
  );
}

function Right(p: BatchBulkBarProps) {
  return (
    <>
      <div className="svg-zoom" data-testid="batch-zoom">
        <ZoomSliderBase id="batch-thumb" testid="batch-thumb" value={p.thumb} onChange={p.onThumb} />
      </div>
      <span className="svg-divider" aria-hidden="true" />
      <span className="text-xs text-slate-400" data-testid="batch-total">
        {p.totalCount} total
      </span>
      <button
        type="button"
        className="svg-btn"
        data-testid="batch-preview"
        disabled={p.canPreview === false}
        onClick={p.onPreview}
      >
        {p.previewing ? "◍ Previewing…" : "◉ Preview splits"}
      </button>
      <ReviewButtons p={p} />
      <button type="button" className="svg-btn primary" data-testid="batch-process"
        disabled={!p.canSplit} title={p.canSplit ? undefined : "Run Preview splits first — only approved images are split"}
        onClick={p.onSplit}>
        ▶ Split approved ({p.approvedCheckedCount})
      </button>
    </>
  );
}

function ReviewButtons({ p }: { p: BatchBulkBarProps }) {
  return (
    <>
      <button type="button" className="svg-btn success" data-testid="batch-approve-selected"
        disabled={p.checkedCount === 0 || !p.onDecide} onClick={() => p.onDecide?.("approved")}>
        ✓ Approve selected
      </button>
      <button type="button" className="svg-btn danger" data-testid="batch-decline-selected"
        disabled={p.checkedCount === 0 || !p.onDecide} onClick={() => p.onDecide?.("declined")}>
        ✕ Decline selected
      </button>
    </>
  );
}

export default function BatchBulkBar(p: BatchBulkBarProps) {
  return (
    <div className="svg-bulk" data-testid="batch-bulk">
      <div className="svg-bulk-left">
        <input
          type="checkbox"
          data-testid="batch-check-all"
          aria-label="Select all visible images"
          checked={p.header === "all"}
          onChange={(e) => p.onToggleAll(e.target.checked)}
          ref={(el) => {
            if (el) el.indeterminate = p.header === "some";
          }}
        />
        <Left {...p} />
        <span className="svg-divider" aria-hidden="true" />
        <button type="button" className="svg-btn" data-testid="batch-select-visible" onClick={p.onSelectVisible}>
          Select visible
        </button>
        <button type="button" className="svg-btn" data-testid="batch-deselect" onClick={p.onDeselectAll}>
          Deselect all
        </button>
      </div>
      <div className="svg-bulk-right">
        <Right {...p} />
      </div>
    </div>
  );
}
