// SourceLine.tsx — the Generate SVG tab's source bar: the green Open folder
// button (always offered, so the tab can be pointed by hand instead of only
// inheriting the Selection root), the rescan, the honest counts of what the
// scan found, and the full-width read-only path row below (the remembered full
// path once captured, else the folder name — never an input, I-44). Extracted
// from SvgControls so both stay inside the RULE 18 size budget.

import { auditText } from "./sourcelist";
import { useRootPath } from "../ui/userootpath";
import PathHint from "../ui/PathHint";
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
    <>
      <div className="svg-toolbar">
        <div className="svg-source">
          <button type="button" className="svg-btn open" data-testid="svg-choose-root" onClick={onChooseRoot}>
            📂 Open folder
          </button>
          {rootName !== "" && <RescanButton busy={busy} onClick={onRescan} />}
          <span className="svg-recursive" data-testid="svg-scope-copy">
            Approved Selection images only · recursive · {discovery?.sources.length ?? 0} sources
          </span>
          {/* The whole picture, so a short list is never a mystery (invariant I-33). */}
          {discovery !== null && <span className="svg-audit" data-testid="svg-audit">{auditText(discovery.audit)}</span>}
        </div>
        <div className="svg-summary">
          <Chip value={counts.eligible} label="eligible" testid="svg-count-eligible" />
          <Chip value={counts.generated} label="generated" testid="svg-count-generated" />
          <Chip value={counts.approved} label="approved" cls="approved" testid="svg-count-approved" />
          <Chip value={counts.failed} label="failed" cls="failed" testid="svg-count-failed" />
        </div>
      </div>
      <PathRow rootName={rootName} />
    </>
  );
}

/** The picked folder, as read-only text: full path once known, else its name. */
function PathRow({ rootName }: { rootName: string }) {
  const stored = useRootPath(rootName);
  if (rootName === "") {
    return <p className="svg-pathrow empty" data-testid="svg-path">No folder selected — open a folder to start</p>;
  }
  const label = stored.path === "" ? rootName : stored.path;
  return (
    <>
      <p className="svg-pathrow" data-testid="svg-path" title={label}>📁 {label}</p>
      {stored.path === "" && <PathHint testid="svg-path-hint" />}
    </>
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
