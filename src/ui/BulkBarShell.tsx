// BulkBarShell.tsx — shared bulk bar layout for all tabs

import type { CheckState } from "../lib/reviewselect";
import type { ReactNode } from "react";

export interface BulkBarShellProps {
  testid: string;
  header: CheckState;
  checkedCount: number;
  visibleCount: number;
  hiddenCount?: number;
  onToggleAll: (on: boolean) => void;
  onSelectVisible: () => void;
  onDeselectAll: () => void;
  leftExtra?: ReactNode;
  right: ReactNode;
}

function Check({ p }: { p: BulkBarShellProps }) {
  return (
    <input
      type="checkbox"
      data-testid={`${p.testid.replace("-bulk", "")}-check-all`}
      aria-label="Select all visible"
      checked={p.header === "all"}
      onChange={(e) => p.onToggleAll(e.target.checked)}
      ref={(el) => {
        if (el) el.indeterminate = p.header === "some";
      }}
    />
  );
}

function Counts({ p }: { p: BulkBarShellProps }) {
  return (
    <>
      <span className="svg-selected-copy" data-testid={`${p.testid.replace("-bulk", "")}-selected-count`}>
        {p.checkedCount} selected
      </span>
      <span className="svg-scope-copy" data-testid={`${p.testid.replace("-bulk", "")}-scope`}>
        across {p.visibleCount} visible
      </span>
      {p.hiddenCount !== undefined && p.hiddenCount > 0 && (
        <span className="svg-scope-copy warn" data-testid={`${p.testid.replace("-bulk", "")}-hidden`}>
          {p.hiddenCount} checked but hidden by filters
        </span>
      )}
      {p.leftExtra}
    </>
  );
}

export default function BulkBarShell(p: BulkBarShellProps) {
  return (
    <div className="svg-bulk" data-testid={p.testid}>
      <div className="svg-bulk-left">
        <Check p={p} />
        <Counts p={p} />
        <span className="svg-divider" aria-hidden="true" />
        <button type="button" className="svg-btn" data-testid={`${p.testid.replace("-bulk", "")}-select-visible`} onClick={p.onSelectVisible}>
          Select visible
        </button>
        <button type="button" className="svg-btn" data-testid={`${p.testid.replace("-bulk", "")}-deselect`} onClick={p.onDeselectAll}>
          Deselect all
        </button>
      </div>
      <div className="svg-bulk-right">{p.right}</div>
    </div>
  );
}
