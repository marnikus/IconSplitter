// SvgBuilderPanel.tsx — the SVG builder tab. Positions follow the reference
// "Glyph" constructor (header · library | stage | customize); every style comes
// from the app's own theme. The layout classes are the builder's own (`bld-*`):
// no other tab's layout class is borrowed (FIXES A1/A2).
import "./svgBuilder.css";
import SvgBuilderControls from "./SvgBuilderControls";
import SvgBuilderCustomize from "./SvgBuilderCustomize";
import SvgBuilderDialogs from "./SvgBuilderDialogs";
import SvgBuilderHeader from "./SvgBuilderHeader";
import SvgBuilderLibrary from "./SvgBuilderLibrary";
import SvgBuilderMetaWidget from "./SvgBuilderMetaWidget";
import SvgBuilderStage from "./SvgBuilderStage";
import SvgBuilderStatusBar from "./SvgBuilderStatusBar";
import SvgBuilderTemplates from "./SvgBuilderTemplates";
import { useSvgBuilder } from "./useSvgBuilder";

export default function SvgBuilderPanel({ active }: { active: boolean }) {
  const b = useSvgBuilder();
  return <section className="bld-panel" data-testid="builder-panel" data-active={active} aria-label="SVG builder workspace">
    {!b.supported && <div className="bld-note is-warn" data-testid="builder-unsupported" role="note">
      This browser does not expose the File System Access folder picker. A Chromium-based browser is required to open and scan a folder.
    </div>}
    <SvgBuilderControls b={b} />
    <SvgBuilderMetaWidget b={b} />
    <SvgBuilderHeader b={b} />
    <div className="bld-workspace" data-testid="builder-workspace">
      <SvgBuilderLibrary b={b} />
      <SvgBuilderStage b={b} />
      <SvgBuilderCustomize b={b} />
    </div>
    <SvgBuilderTemplates b={b} />
    <SvgBuilderStatusBar b={b} />
    <SvgBuilderDialogs b={b} />
  </section>;
}
