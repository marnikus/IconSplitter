// SourceLine.tsx — the Generate SVG tab's source bar: the picked root, the
// folder picker (always offered, so the tab can be pointed by hand instead of
// only inheriting the Selection root), the rescan, the root's real full path
// for copies, and the honest counts of what the scan found. Extracted from
// SvgControls so both stay inside the RULE 18 size budget.

import RootPathField from "../ui/RootPathField";
import type { Discovery } from "./sources";

export interface SvgCounts {
  eligible: number;
  generated: number;
  approved: number;
  failed: number;
}

export interface SourceLineProps {
  rootName: string;
  discovery: Discovery | null;
  busy: string | null;
  counts: SvgCounts;
  onChooseRoot: () => void;
  onRescan: () => void;
}

export default function SourceLine({ rootName, discovery, busy, counts, onChooseRoot, onRescan }: SourceLineProps) {
  return (
    <div className="svg-toolbar">
      <div className="svg-source">
        {rootName === "" ? <PickButton label="Choose source folder…" onClick={onChooseRoot} /> : (
          <>
            <span className="svg-path-pill" data-testid="svg-root" title={rootName}>📂 Root: {rootName}</span>
            <PickButton label="Change folder…" onClick={onChooseRoot} />
            <RescanButton busy={busy} onClick={onRescan} />
            <RootPathField key={rootName} rootName={rootName} testid="svg-root-path" />
          </>
        )}
        <span className="svg-recursive" data-testid="svg-scope-copy">
          Approved Selection images only · recursive · {discovery?.sources.length ?? 0} sources
        </span>
      </div>
      <div className="svg-summary">
        <Chip value={counts.eligible} label="eligible" testid="svg-count-eligible" />
        <Chip value={counts.generated} label="generated" testid="svg-count-generated" />
        <Chip value={counts.approved} label="approved" cls="approved" testid="svg-count-approved" />
        <Chip value={counts.failed} label="failed" cls="failed" testid="svg-count-failed" />
      </div>
    </div>
  );
}

function PickButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="svg-btn primary" data-testid="svg-choose-root" onClick={onClick}>{label}</button>
  );
}

function RescanButton({ busy, onClick }: { busy: string | null; onClick: () => void }) {
  return (
    <button type="button" className="svg-btn" data-testid="svg-rescan" disabled={busy !== null} onClick={onClick}>
      {busy === null ? "↻ Rescan approved" : busy}
    </button>
  );
}

function Chip({ value, label, cls, testid }: { value: number; label: string; cls?: string; testid: string }) {
  return <span className={`svg-chip${cls ? ` ${cls}` : ""}`} data-testid={testid}><strong>{value}</strong>{label}</span>;
}
