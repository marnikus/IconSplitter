// BatchThumbInfoCell.tsx — thumbnail with file info underneath (name, path, ref missing)
// Replaces separate File/path column to free space for Detection + Preview, all flex

import { memo } from "react";
import type { Row } from "./useBatch";
import ScanThumb from "./ScanThumb";

interface Props {
  r: Row;
  thumbFor: (relPath: string) => Promise<string>;
  thumb: number;
}

function Inner({ r, thumbFor, thumb }: Props) {
  return (
    <div className="flex min-w-0 w-full flex-col gap-1.5" data-testid={`batch-thumbinfo-${r.relPath}`}>
      <ScanThumb relPath={r.relPath} thumbFor={thumbFor} thumb={thumb} />
      <div className="min-w-0 w-full">
        <div className="truncate text-[11px] font-semibold text-slate-200" title={r.name}>{r.name}</div>
        <div className="truncate text-[10px] text-slate-400" title={r.relPath}>{r.relPath}{r.refRelPath === null ? " · ⚠ ref missing" : ""}</div>
      </div>
    </div>
  );
}

export default memo(Inner);
