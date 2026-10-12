// BatchBulkBar.tsx — bulk bar for Batch folders + review (approved/declined/warning)
// Reuses ZoomSliderBase, backward compatible with old tests

import type { CheckState } from "../lib/reviewselect";
import ZoomSliderBase from "../ui/ZoomSliderBase";
import type { BatchReviewStatus } from "../lib/statefile";

export interface BatchBulkBarProps {
  header: CheckState;
  checkedCount: number;
  visibleCount: number;
  totalCount: number;
  hiddenCount: number;
  affectedCount: number;
  thumb: number;
  selectedCount: number;
  reviewCounts?: { approved: number; declined: number; warning: number; pending: number };
  decidableCount?: number;
  approvedSelectedCount?: number;
  onToggleAll: (on: boolean) => void;
  onSelectVisible: () => void;
  onDeselectAll: () => void;
  onThumb: (px: number) => void;
  onSplit: () => void;
  onPreview?: () => void;
  onDecide?: (review: BatchReviewStatus) => void;
  canSplit: boolean;
  canPreview?: boolean;
  previewing?: boolean;
}

function Left(p: BatchBulkBarProps) {
  const rc = p.reviewCounts;
  return (
    <>
      <span className="svg-selected-copy" data-testid="batch-selected-count">{p.checkedCount} selected</span>
      <span className="svg-scope-copy" data-testid="batch-scope">across {p.visibleCount} visible images</span>
      {p.hiddenCount > 0 && <span className="svg-scope-copy warn" data-testid="batch-hidden">{p.hiddenCount} checked but hidden by filters</span>}
      {rc && <ReviewCounts rc={rc} />}
    </>
  );
}

function ReviewCounts({ rc }: { rc: NonNullable<BatchBulkBarProps["reviewCounts"]> }) {
  return (
    <>
      <span className="svg-divider" aria-hidden="true" />
      <span className="text-xs text-slate-400" data-testid="batch-review-counts">
        <span className="text-emerald-300">{rc.approved} approved</span> · <span className="text-amber-300">{rc.warning} warning</span> · <span className="text-slate-400">{rc.pending} pending</span> · <span className="text-rose-300">{rc.declined} declined</span>
      </span>
    </>
  );
}

function splitLabel(p: BatchBulkBarProps, approvedSel: number): string {
  return p.reviewCounts ? `▶ Split approved (${approvedSel})` : `Split selected (${p.selectedCount})`;
}

function PreviewBtn(p: BatchBulkBarProps) {
  if (!p.onPreview) return null;
  return (
    <button type="button" className="svg-btn" data-testid="batch-preview" disabled={p.canPreview === false} onClick={p.onPreview}>
      {p.previewing ? "◍ Previewing…" : "◉ Preview splits"}
    </button>
  );
}

function ReviewBtns({ decidable, onDecide }: { decidable: number; onDecide?: (r: BatchReviewStatus) => void }) {
  if (!onDecide) return null;
  return (
    <>
      <button type="button" className="svg-btn warning" data-testid="batch-warning-selected" disabled={decidable === 0} onClick={() => onDecide("warning")}>⚠ Warning selected</button>
      <button type="button" className="svg-btn success" data-testid="batch-approve-selected" disabled={decidable === 0} onClick={() => onDecide("approved")}>✓ Approve selected</button>
      <button type="button" className="svg-btn danger" data-testid="batch-decline-selected" disabled={decidable === 0} onClick={() => onDecide("declined")}>✕ Decline selected</button>
    </>
  );
}

function ZoomAndTotal(p: BatchBulkBarProps) {
  return (
    <>
      <div className="svg-zoom" data-testid="batch-zoom"><ZoomSliderBase id="batch-thumb" testid="batch-thumb" value={p.thumb} onChange={p.onThumb} /></div>
      <span className="svg-divider" aria-hidden="true" />
      <span className="text-xs text-slate-400" data-testid="batch-total">{p.totalCount} total</span>
    </>
  );
}

function Right(p: BatchBulkBarProps) {
  const decidable = p.decidableCount ?? p.checkedCount;
  const approvedSel = p.approvedSelectedCount ?? p.selectedCount;
  const showReview = !!p.reviewCounts && !!p.onDecide;
  return (
    <>
      <ZoomAndTotal {...p} />
      <PreviewBtn {...p} />
      {showReview && <ReviewBtns decidable={decidable} onDecide={p.onDecide} />}
      <button type="button" className="svg-btn primary" data-testid="batch-process" disabled={!p.canSplit} onClick={p.onSplit}>{splitLabel(p, approvedSel)}</button>
    </>
  );
}

export default function BatchBulkBar(p: BatchBulkBarProps) {
  return (
    <div className="svg-bulk" data-testid="batch-bulk">
      <div className="svg-bulk-left">
        <input type="checkbox" data-testid="batch-check-all" aria-label="Select all visible images" checked={p.header === "all"} onChange={(e) => p.onToggleAll(e.target.checked)} ref={(el) => { if (el) el.indeterminate = p.header === "some"; }} />
        <Left {...p} />
        <span className="svg-divider" aria-hidden="true" />
        <button type="button" className="svg-btn" data-testid="batch-select-visible" onClick={p.onSelectVisible}>Select visible</button>
        <button type="button" className="svg-btn" data-testid="batch-deselect" onClick={p.onDeselectAll}>Deselect all</button>
      </div>
      <div className="svg-bulk-right"><Right {...p} /></div>
    </div>
  );
}
