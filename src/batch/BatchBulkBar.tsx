// BatchBulkBar.tsx — bulk bar for Batch folders, same visual as SVG output (fonts, text size, win header, titles)
// Refactored to reuse ZoomSliderBase and shared shell pattern, keeps same testids/classes.

import type { CheckState } from "../lib/reviewselect";
import ZoomSliderBase from "../ui/ZoomSliderBase";
import BatchPreviewBar from "./preview/BatchPreviewBar";
import type { SplitPreview } from "./preview/useSplitPreview";

export interface BatchBulkBarProps {
  header: CheckState;
  checkedCount: number;
  visibleCount: number;
  totalCount: number;
  hiddenCount: number;
  affectedCount: number;
  thumb: number;
  selectedCount: number;
  onToggleAll: (on: boolean) => void;
  onSelectVisible: () => void;
  onDeselectAll: () => void;
  onThumb: (px: number) => void;
  onSplit: () => void;
  canSplit: boolean;
  preview: SplitPreview;
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
      <BatchPreviewBar
        selected={p.selectedCount}
        running={p.preview.running}
        open={p.preview.open}
        progress={p.preview.progress}
        onStart={p.preview.start}
        onStop={p.preview.stop}
      />
      <button type="button" className="svg-btn primary" data-testid="batch-process" disabled={!p.canSplit} onClick={p.onSplit}>
        ▶ Split selected ({p.selectedCount})
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
