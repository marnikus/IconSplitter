// SvgBuilderControls.tsx — the folder bar above the workspace (like the other
// tabs): Open folder, Rescan, scope copy, approved count, audit line and path.
import { FolderPathRow, OpenFolderButton } from "../ui/FolderBar";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderControls({ b }: { b: BuilderApi }) {
  return <section className="bld-folder" data-testid="builder-folder-widget" aria-label="Approved SVG folder">
    <div className="bld-folder-row">
      <OpenFolderButton testid="builder-open-folder" onClick={b.actions.openFolder} />
      <button type="button" className="svg-btn" data-testid="builder-rescan" onClick={b.actions.rescan}>↻ Rescan</button>
      <span className="v2-chip" data-testid="builder-scope-copy">Approved SVGs only · all folders · read-only</span>
      <span className="v2-chip approved" data-testid="builder-approved-count"><strong>{b.assets.length}</strong> approved</span>
      <span className="bld-audit" data-testid="builder-audit">{b.auditLine}</span>
    </div>
    <FolderPathRow root={b.root} testid="builder-folder-path" />
  </section>;
}
