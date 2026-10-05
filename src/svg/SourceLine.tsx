// SourceLine.tsx — the Generate SVG tab's source bar: the one Open folder
// button, the rescan, the picked folder's full path as a read-only row, and the
// honest counts of what the scan found. Extracted from SvgControls so both stay
// inside the RULE 18 size budget; the button and the row are shared with
// Selection V2 (ui/FolderBar, design 2026-10-05-folder-ui).

import { auditText } from "./sourcelist";
import { OpenFolderButton, RootPathRow } from "../ui/FolderBar";
import { useRootPath } from "../ui/userootpath";
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
  // The row shows the folder's real path as soon as a pick captured one, so the
  // user never has to open a dialog to find out what a copy will hand over.
  const path = useRootPath(rootName);
  return (
    <>
      <div className="svg-toolbar">
        <div className="svg-source">
          <OpenFolderButton testid="svg-open-folder" onClick={onChooseRoot} />
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
      <RootPathRow testid="svg-root-path" path={path} />
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
