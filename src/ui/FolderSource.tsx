// Existing SVG folder toolbar and path row, shared without a second layout.
import type { ReactNode } from "react";
import type { DirHandleLike } from "../lib/fs";
import { FolderPathRow, OpenFolderButton } from "./FolderBar";
interface Props {
  root: DirHandleLike | null; openTestid: string; pathTestid: string; rescanTestid?: string;
  onOpen: () => void; onRescan: () => void; rescanDisabled: boolean; showRescan?: boolean; rescanLabel?: string;
  scope: ReactNode; scopeTestid?: string; audit?: ReactNode; summary?: ReactNode;
}
export default function FolderSource(p: Props) {
  return <>
    <div className="svg-toolbar">
      <div className="svg-source">
        <OpenFolderButton testid={p.openTestid} onClick={p.onOpen} />
        {p.showRescan !== false && <button type="button" className="svg-btn" data-testid={p.rescanTestid} disabled={p.rescanDisabled} onClick={p.onRescan}>{p.rescanLabel ?? "↻ Rescan"}</button>}
        <span className="svg-recursive" data-testid={p.scopeTestid}>{p.scope}</span>{p.audit}
      </div>
      {p.summary && <div className="svg-summary">{p.summary}</div>}
    </div>
    <FolderPathRow root={p.root} testid={p.pathTestid} />
  </>;
}
