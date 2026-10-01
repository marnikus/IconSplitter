// SvgBatchStrip.tsx — the live batch strip (prompt §3/§17): the contact sheet
// the current request was built from, its grid shape, and the running counts
// for that batch. The composite is the image the provider actually received,
// shown so a partial failure can be traced back to a position; it lives in
// memory only and is never written into the SVG output folder.

import type { RunProgress } from "./types";

export interface SvgBatchStripProps {
  progress: RunProgress;
  onCancel: () => void;
}

export default function SvgBatchStrip({ progress, onCancel }: SvgBatchStripProps) {
  return (
    <section className="svg-batch" data-testid="svg-batch" aria-label="Batch in flight">
      <img className="svg-batch-img" data-testid="svg-batch-composite" src={progress.composite}
        alt={`Contact sheet for batch ${progress.batchId}: ${progress.count} images in a ${progress.cols} by ${progress.rows} grid`} />
      <div className="svg-batch-meta">
        <strong data-testid="svg-batch-id">{progress.batchId}</strong>
        <span data-testid="svg-batch-grid">{progress.cols}×{progress.rows} grid · {progress.count} image(s)</span>
        <span data-testid="svg-batch-counts">{progress.saved} saved · {progress.failed} failed · {progress.missing} missing</span>
        <span className="svg-masked">hash {progress.hash.slice(0, 12)}</span>
      </div>
      <button type="button" className="svg-btn" data-testid="svg-batch-cancel" onClick={onCancel}>Cancel</button>
    </section>
  );
}
