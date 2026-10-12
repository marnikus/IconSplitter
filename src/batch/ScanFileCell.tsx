// ScanFileCell.tsx — file name + path + ref missing note

import type { Row } from "./useBatch";

export default function ScanFileCell({ r }: { r: Row }) {
  return (
    <div className="svg-file-main">
      <div className="svg-file-name" title={r.name}>
        {r.name}
      </div>
      <div className="svg-file-sub" title={r.relPath}>
        {r.relPath}
        {r.refRelPath === null ? " · ⚠ ref missing" : ""}
      </div>
    </div>
  );
}
