// BuilderSourceBar.tsx — the top menu every tab shares, in the builder's own
// words (I-44/I-46): the one green folder button, the rescan, the approved-only
// scope line, the one audit line of the last scan, and the picked folder's real
// full path on its own read-only row. No rule lives here: the scan owns the
// counts, ui/pickroot owns the path capture.

import type { DirHandleLike } from "../lib/fs";
import { FolderPathRow, OpenFolderButton } from "../ui/FolderBar";

export interface BuilderScope {
  /** Approved icons the library lists right now. */
  icons: number;
  /** Every file the walk visited. */
  files: number;
  /** SVG files seen (before approval filtering). */
  svgFiles: number;
  /** Pairs that exist but are not listed, with a reason in the scan. */
  excluded: number;
  /** Pair files that could not be parsed. */
  corrupt: number;
  /** Files that could not be read (locked or being written). */
  unreadable: number;
}

export interface BuilderSourceBarProps {
  rootName: string;
  root: DirHandleLike | null;
  scope: BuilderScope | null;
  /** Non-null while the scan runs: the rescan button shows the same words. */
  busy: string | null;
  onChooseRoot: () => void;
  onRescan: () => void;
}

export default function BuilderSourceBar(p: BuilderSourceBarProps) {
  return (
    <div className="bld-source" data-testid="builder-source">
      <div className="bld-source-row">
        <OpenFolderButton testid="builder-open-folder" onClick={p.onChooseRoot} />
        {p.rootName !== "" && (
          <button type="button" className="svg-btn" data-testid="builder-rescan"
            disabled={p.busy !== null} onClick={p.onRescan}>
            {p.busy === null ? "↻ Rescan" : p.busy}
          </button>
        )}
        <span className="bld-scope" data-testid="builder-scope-copy">{scopeCopy(p)}</span>
      </div>
      <FolderPathRow root={p.root} testid="builder-folder-path" />
      {p.scope !== null && <p className="bld-audit" data-testid="builder-audit">{auditCopy(p.scope)}</p>}
    </div>
  );
}

/** The scope line: what the library is, in the same shape the other tabs use. */
function scopeCopy(p: BuilderSourceBarProps): string {
  if (p.rootName === "") return "Approved SVGs only · recursive · no folder picked";
  const n = p.scope === null ? 0 : p.scope.icons;
  return `Approved SVGs only · recursive · ${n} icon${n === 1 ? "" : "s"}`;
}

/**
 * The one audit line (RULE 2). Counts that are zero are said as zero — a scan that
 * could not read files must not look like a clean one.
 */
function auditCopy(s: BuilderScope): string {
  return [
    `${s.files} files`,
    `${s.svgFiles} SVG files`,
    `${s.icons} approved`,
    `${s.excluded} not listed`,
    `${s.corrupt} corrupt pair files`,
    `${s.unreadable} unreadable`,
  ].join(" · ");
}
