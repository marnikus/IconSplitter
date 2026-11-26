// SourceLine.tsx — the Generate SVG tab's source bar: the folder button (always
// offered, so the tab can be pointed at a folder by hand instead of only
// inheriting the Selection root), the rescan, the honest counts of what the scan
// found — and, in its own read-only row below, the picked folder's full path
// (I-44/I-46). Extracted from SvgControls so both stay inside the RULE 18 budget.

import { useEffect, useState } from "react";
import { peekPermission } from "../batch/picker";
import { auditText } from "./sourcelist";
import type { DirHandleLike } from "../lib/fs";
import { FolderPathRow, OpenFolderButton } from "../ui/FolderBar";
import type { Discovery } from "./sources";

export interface SvgCounts {
  eligible: number;
  generated: number;
  approved: number;
  failed: number;
}

export interface SourceLineProps {
  rootName: string;
  root: DirHandleLike | null;
  discovery: Discovery | null;
  busy: string | null;
  counts: SvgCounts;
  onChooseRoot: () => void;
  onRescan: () => void;
}

export default function SourceLine({ rootName, root, discovery, busy, counts, onChooseRoot, onRescan }: SourceLineProps) {
  const locked = useLocked(root, busy, discovery);
  return (
    <>
      <div className="svg-toolbar">
        <div className="svg-source">
          <OpenFolderButton testid="svg-open-folder" onClick={onChooseRoot} />
          {rootName !== "" && <RescanButton busy={busy} locked={locked} onClick={onRescan} />}
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
      <FolderPathRow root={root} testid="svg-folder-path" />
    </>
  );
}

/**
 * Is the folder waiting for the browser's OK (2026-11-26)? A reload restores it
 * without read access; only a click may ask — re-checked after every scan.
 */
function useLocked(root: DirHandleLike | null, busy: string | null, discovery: Discovery | null): boolean {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    let alive = true;
    if (root === null) { setLocked(false); return; }
    void peekPermission(root).then((p) => { if (alive) setLocked(p !== "granted"); });
    return () => { alive = false; };
  }, [root, busy, discovery]);
  return locked;
}

function RescanButton({ busy, locked, onClick }: { busy: string | null; locked: boolean; onClick: () => void }) {
  const label = busy !== null ? busy : locked ? "🔓 Restore access" : "↻ Rescan approved";
  return (
    <button type="button" className={`svg-btn${locked ? " primary" : ""}`} data-testid="svg-rescan" disabled={busy !== null} onClick={onClick}
      title={locked ? "The browser re-opens a remembered folder only after a click — this asks it, then scans" : undefined}>
      {label}
    </button>
  );
}

function Chip({ value, label, cls, testid }: { value: number; label: string; cls?: string; testid: string }) {
  return <span className={`svg-chip${cls ? ` ${cls}` : ""}`} data-testid={testid}><strong>{value}</strong>{label}</span>;
}
