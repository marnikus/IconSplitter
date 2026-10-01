// SvgBulkBar.tsx — the bulk bar of the Generate SVG tab (prompt §2/§15/§17).
// Header checkbox with an indeterminate state, the selected/visible scope,
// select-visible and deselect-all, the thumbnail zoom slider, the estimate
// line, and the three bulk actions: Generate, Approve, Decline. There is no
// "approve visible" action — every bulk operation applies to the SELECTION
// only, and Approve/Decline stay disabled until a selected row has a valid
// SVG. While a run is in flight the bar shows the live batch progress and a
// Cancel that keeps everything already saved.

import { clampThumb, THUMB_MAX, THUMB_MIN, THUMB_STEP, thumbLabel } from "../lib/reviewprefs";
import { fmtCost, fmtTokens } from "../lib/svgusage";
import type { RunProgress } from "./types";

export interface SvgBulkBarProps {
  header: "none" | "some" | "all";
  checkedCount: number;
  visibleCount: number;
  decidableCount: number;
  thumb: number;
  model: string;
  totals: { tokens: number | null; cost: number | null };
  progress: RunProgress | null;
  running: boolean;
  onToggleAll: (on: boolean) => void;
  onSelectVisible: () => void;
  onDeselectAll: () => void;
  onThumb: (px: number) => void;
  onGenerate: () => void;
  onDecide: (decision: "approved" | "declined") => void;
  onCancel: () => void;
}

export default function SvgBulkBar(p: SvgBulkBarProps) {
  return (
    <div className="svg-bulk" data-testid="svg-bulk">
      <BulkLeft p={p} />
      <BulkRight p={p} />
    </div>
  );
}

function BulkLeft({ p }: { p: SvgBulkBarProps }) {
  return (
      <div className="svg-bulk-left">
        <input type="checkbox" data-testid="svg-check-all" aria-label="Select all visible sources"
          checked={p.header === "all"} onChange={(e) => p.onToggleAll(e.target.checked)}
          ref={(el) => { if (el) el.indeterminate = p.header === "some"; }} />
        <span className="svg-selected-copy" data-testid="svg-selected-count">{p.checkedCount} selected</span>
        <span className="svg-scope-copy" data-testid="svg-scope">across {p.visibleCount} approved sources</span>
        <span className="svg-divider" aria-hidden="true" />
        <button type="button" className="svg-btn" data-testid="svg-select-visible" onClick={p.onSelectVisible}>Select all visible</button>
        <button type="button" className="svg-btn" data-testid="svg-deselect" onClick={p.onDeselectAll}>Deselect all</button>
      </div>
  );
}

function BulkRight({ p }: { p: SvgBulkBarProps }) {
  return (
      <div className="svg-bulk-right">
        <div className="svg-zoom">
          <label htmlFor="svg-thumb">ZOOM</label>
          <span aria-hidden="true">{THUMB_MIN}</span>
          <input id="svg-thumb" data-testid="svg-thumb" type="range" min={THUMB_MIN} max={THUMB_MAX} step={THUMB_STEP}
            value={p.thumb} aria-label="Thumbnail maximum height"
            onChange={(e) => p.onThumb(clampThumb(Number(e.target.value)))} />
          <span aria-hidden="true">{THUMB_MAX}</span>
          <output className="svg-zoom-value" data-testid="svg-thumb-value" htmlFor="svg-thumb">{thumbLabel(p.thumb)}</output>
        </div>
        <span className="svg-divider" aria-hidden="true" />
        <Estimate p={p} />
        {p.running && (
          <button type="button" className="svg-btn" data-testid="svg-cancel-run" onClick={p.onCancel}>Cancel run</button>
        )}
        <button type="button" className="svg-btn primary" data-testid="svg-generate-selected"
          disabled={p.checkedCount === 0 || p.running} onClick={p.onGenerate}>✦ Generate selected</button>
        <button type="button" className="svg-btn success" data-testid="svg-approve-selected"
          disabled={p.decidableCount === 0} onClick={() => p.onDecide("approved")}>✓ Approve selected</button>
        <button type="button" className="svg-btn danger" data-testid="svg-decline-selected"
          disabled={p.decidableCount === 0} onClick={() => p.onDecide("declined")}>✕ Decline selected</button>
      </div>
  );
}

/** The estimate line doubles as the live batch counter while a run is in flight. */
function Estimate({ p }: { p: SvgBulkBarProps }) {
  return (
    <div className="svg-estimate" data-testid="svg-estimate">
      <strong>{p.checkedCount} images · {p.model}</strong>
      {p.progress === null
        ? <span>visible usage {fmtTokens(p.totals.tokens)} tokens · {fmtCost(p.totals.cost)} actual</span>
        : <span data-testid="svg-batch-progress">batch {p.progress.batchId} · {p.progress.saved} saved · {p.progress.failed} failed · {p.progress.missing} missing</span>}
    </div>
  );
}
