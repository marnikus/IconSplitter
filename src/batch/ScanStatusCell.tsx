// ScanStatusCell.tsx — status badge for Batch row

import type { SourceStatus } from "../lib/statefile";
import type { Row } from "./useBatch";

const BADGE: Record<SourceStatus, { label: string }> = {
  unprocessed: { label: "unprocessed" },
  processed: { label: "processed" },
  skipped: { label: "skipped" },
  changed: { label: "changed" },
  missing: { label: "missing" },
  deleted: { label: "deleted" },
};

export default function ScanStatusCell({ r, locate }: { r: Row; locate?: (relPath: string) => void }) {
  const b = BADGE[r.status];
  return (
    <div className="svg-cell" data-testid={`batch-status-${r.relPath}`}>
      <span className={`svg-badge ${r.status}`}>{b.label}</span>
      {r.refRelPath === null && <small className="svg-error">ref missing</small>}
      {r.outRel && locate && (
        <button type="button" className="svg-btn tiny" data-testid={`batch-row-locate-${r.relPath}`} title={`Copy the splits folder: ${r.outRel}`} onClick={(e) => { e.stopPropagation(); locate(r.relPath); }}>📍 Location</button>
      )}
    </div>
  );
}
