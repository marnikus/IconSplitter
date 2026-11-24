// SvgBuilderPanel.tsx — the SVG builder tab. Positions follow the reference
// "Glyph" constructor (header · library | stage | customize); every style comes
// from the app's own theme. The layout classes are the builder's own (`bld-*`):
// no other tab's layout class is borrowed (FIXES A1/A2).
import { memo } from "react";
import "./svgBuilder.css";
import SvgBuilderControls from "./SvgBuilderControls";
import SvgBuilderCustomize from "./SvgBuilderCustomize";
import SvgBuilderDialogs from "./SvgBuilderDialogs";
import SvgBuilderIconEditor from "./SvgBuilderIconEditor";
import SvgBuilderHeader from "./SvgBuilderHeader";
import SvgBuilderLibrary from "./SvgBuilderLibrary";
import SvgBuilderMetaWidget from "./SvgBuilderMetaWidget";
import SvgBuilderStage from "./SvgBuilderStage";
import SvgBuilderStatusBar from "./SvgBuilderStatusBar";
import SvgBuilderTemplates from "./SvgBuilderTemplates";
import SvgBuilderArtboards from "./SvgBuilderArtboards";
import SvgBuilderExportProgress from "./SvgBuilderExportProgress";
import UploadRenameProgress from "../ui/UploadRenameProgress";
import { useSvgBuilder, type BuilderApi } from "./useSvgBuilder";
import { useBuilderReviewFollower } from "./declineasset";
import { useStageHotkeys } from "./useStageHotkeys";

function sameStaticPanels(prev: { b: BuilderApi }, next: { b: BuilderApi }): boolean {
  const a = prev.b, c = next.b;
  if (a === c) return true;
  if (c.busy !== null && a.root === c.root) return true;
  const keys = Object.keys(a) as Array<keyof BuilderApi>;
  return keys.every((k) => k === "busy" || a[k] === c[k]);
}

const BuilderStaticPanels = memo(function BuilderStaticPanels({ b }: { b: BuilderApi }) {
  return <>
    <div className="bld-workspace" data-testid="builder-workspace">
      <SvgBuilderLibrary b={b} />
      <SvgBuilderStage b={b} />
      <SvgBuilderCustomize b={b} />
    </div>
    <SvgBuilderTemplates b={b} />
    <SvgBuilderArtboards b={b} />
    <SvgBuilderIconEditor b={b} />
  </>;
}, sameStaticPanels);

const MemoMetaWidget = memo(SvgBuilderMetaWidget, sameStaticPanels);

export default function SvgBuilderPanel({ active }: { active: boolean }) {
  const b = useSvgBuilder();
  useBuilderReviewFollower(b);
  useStageHotkeys(b, active);
  return <section className="bld-panel" data-testid="builder-panel" data-active={active} aria-label="SVG builder workspace">
    {!b.supported && <div className="bld-note is-warn" data-testid="builder-unsupported" role="note">
      This browser does not expose the File System Access folder picker. A Chromium-based browser is required to open and scan a folder.
    </div>}
    <SvgBuilderControls b={b} />
    <SvgBuilderExportProgress />
    <UploadRenameProgress source="svgBuilder" />
    <MemoMetaWidget b={b} />
    <SvgBuilderHeader b={b} />
    <BuilderStaticPanels b={b} />
    <SvgBuilderStatusBar b={b} />
    <SvgBuilderDialogs b={b} />
  </section>;
}
