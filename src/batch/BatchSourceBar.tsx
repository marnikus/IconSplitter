// BatchSourceBar.tsx — folder row for Batch folders, same visual/function as V2
// Reuses FolderBar + batchCounters lib for code reuse.

import type { DirHandleLike } from "../lib/fs";
import { FolderPathRow, OpenFolderButton } from "../ui/FolderBar";
import { batchCounters } from "../lib/batchselect";
import type { SourceStatus } from "../lib/statefile";

export interface BatchSourceBarProps {
  rootName: string;
  root: DirHandleLike | null;
  rows: { status: SourceStatus }[];
  chooseRoot: () => void;
  rescan: () => void;
}

export default function BatchSourceBar(p: BatchSourceBarProps) {
  const c = batchCounters(p.rows);
  return (
    <>
      <div className="v2-toolbar">
        <div className="v2-source">
          <OpenFolderButton testid="batch-open-folder" onClick={p.chooseRoot} />
          <button className="v2-btn primary" data-testid="batch-rescan" onClick={p.rescan}>
            ↻ Rescan
          </button>
          {p.rootName !== "" && (
            <span className="v2-recursive" data-testid="batch-scan-scope">
              Scope: all folders
            </span>
          )}
        </div>
        <div className="v2-toolbar-right">
          <Summary c={c} />
        </div>
      </div>
      <FolderPathRow root={p.root} testid="batch-folder-path" />
    </>
  );
}

function Summary({ c }: { c: ReturnType<typeof batchCounters> }) {
  return (
    <div className="v2-summary">
      <Chip n={c.total} label="total" testid="batch-count-total" />
      <Chip n={c.unprocessed} label="unprocessed" testid="batch-count-unprocessed" tone="pending" />
      <Chip n={c.processed} label="processed" testid="batch-count-processed" tone="approved" />
      {c.skipped > 0 && <Chip n={c.skipped} label="skipped" testid="batch-count-skipped" tone="pending" />}
      {c.changed > 0 && <Chip n={c.changed} label="changed" testid="batch-count-changed" tone="pending" />}
    </div>
  );
}

function Chip({ n, label, testid, tone }: { n: number; label: string; testid: string; tone?: string }) {
  return (
    <span className={`v2-chip${tone ? ` ${tone}` : ""}`} data-testid={testid}>
      <strong>{n}</strong> {label}
    </span>
  );
}
