// SourceLine.tsx — the Generate SVG tab's source bar: the folder button (always
// offered, so the tab can be pointed at a folder by hand instead of only
// inheriting the Selection root), the rescan, the honest counts of what the scan
// found — and, in its own read-only row below, the picked folder's full path
// (I-44/I-46). Extracted from SvgControls so both stay inside the RULE 18 budget.

import { auditText } from "./sourcelist";
import { FolderPathRow, OpenFolderButton } from "../ui/FolderBar";
import type { DirHandleLike } from "../lib/fs";
import type { Discovery } from "./sources";

export interface SvgCounts {
  eligible: number;
  generated: number;
  approved: number;
  failed: number;
}

export interface SourceLineProps {
  rootName: string;
  /** The handle behind the name: the only thing that can prove its path (I-63). */
  rootHandle: DirHandleLike | null;
  discovery: Discovery | null;
  busy: string | null;
  counts: SvgCounts;
  onChooseRoot: () => void;
  onRescan: () => void;
}

export default function SourceLine({ rootName, rootHandle, discovery, busy, counts, onChooseRoot, onRescan }: SourceLineProps) {
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
      <FolderPathRow folder={{ name: rootName, handle: rootHandle }} testid="svg-folder-path" />
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
