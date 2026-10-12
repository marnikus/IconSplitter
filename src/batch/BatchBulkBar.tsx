// BatchBulkBar.tsx — bulk bar for Batch folders (filtered multi-select + zoom + split)
// Reference: src/selectionv2/BulkBar.tsx (image-1.png). Keeps split size separate.

import type { CheckState } from "../lib/reviewselect";
import BatchZoomSlider from "./BatchZoomSlider";

export interface BatchBulkBarProps {
  header: CheckState;
  checkedCount: number;
  visibleCount: number;
  totalCount: number;
  thumb: number;
  selectedCount: number;
  onToggleAll: (on: boolean) => void;
  onSelectVisible: () => void;
  onDeselectAll: () => void;
  onThumb: (px: number) => void;
  onSplit: () => void;
  canSplit: boolean;
}

export default function BatchBulkBar(p: BatchBulkBarProps) {
  return (
    <div className="v2-bulk" data-testid="batch-bulk">
      <div className="v2-bulk-left">
        <input type="checkbox" data-testid="batch-check-all" aria-label="Select all visible images"
          checked={p.header === "all"} onChange={(e) => p.onToggleAll(e.target.checked)}
          ref={(el) => { if (el) el.indeterminate = p.header === "some"; }} />
        <span className="v2-selected-copy" data-testid="batch-selected-count">{p.checkedCount} selected</span>
        <span className="v2-scope-copy" data-testid="batch-scope">across {p.visibleCount} visible images</span>
        <span className="v2-divider" aria-hidden="true" />
        <button type="button" className="v2-btn" data-testid="batch-select-visible" onClick={p.onSelectVisible}>Select visible</button>
        <button type="button" className="v2-btn" data-testid="batch-deselect" onClick={p.onDeselectAll}>Deselect all</button>
      </div>
      <div className="v2-bulk-right">
        <BatchZoomSlider value={p.thumb} onChange={p.onThumb} />
        <span className="v2-divider" aria-hidden="true" />
        <span className="text-xs text-slate-400" data-testid="batch-total">{p.totalCount} total</span>
        <button type="button" className="v2-btn success" data-testid="batch-process" disabled={!p.canSplit} onClick={p.onSplit}>
          ▶ Split selected ({p.selectedCount})
        </button>
      </div>
    </div>
  );
}
