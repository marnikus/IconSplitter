// SvgBuilderPanel.tsx — the seventh Workbench mode. One hook owns state; the
// header, library, stage, inspector and dialogs are split presentation modules.
import "./svgBuilder.css";
import SvgBuilderControls from "./SvgBuilderControls";
import SvgBuilderDialogs from "./SvgBuilderDialogs";
import SvgBuilderInspector from "./SvgBuilderInspector";
import SvgBuilderLibrary from "./SvgBuilderLibrary";
import SvgBuilderStage from "./SvgBuilderStage";
import SvgBuilderStatusBar from "./SvgBuilderStatusBar";
import { useSvgBuilder } from "./useSvgBuilder";

export default function SvgBuilderPanel({ active }: { active: boolean }) {
  const b = useSvgBuilder();
  return <section className="builder-panel svg-panel" data-testid="builder-panel" data-active={active}
    aria-label="SVG builder workspace">
    {!b.supported && <div className="builder-unsupported" data-testid="builder-unsupported" role="note">
      This browser does not expose the File System Access folder picker. A Chromium-based browser is required to open and scan a folder; all other controls remain read-only.
    </div>}
    <SvgBuilderControls b={b} />
    {b.root === null && <p className="builder-empty" data-testid="builder-empty">
      No folder selected. The builder never invents or downloads icons: open the root that contains your approved `.svg.json` pairs.
    </p>}
    <div className="builder-workspace" data-testid="builder-workspace">
      <SvgBuilderLibrary b={b} />
      <SvgBuilderStage b={b} />
      <SvgBuilderInspector b={b} />
    </div>
    <SvgBuilderStatusBar b={b} />
    <SvgBuilderDialogs b={b} />
  </section>;
}
