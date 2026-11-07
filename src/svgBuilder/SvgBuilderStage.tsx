// SvgBuilderStage.tsx — live artboard, layout presets, zoom and export menu.
// The exported document and the preview use the same composition object.
import { PRESETS } from "../lib/svgBuilder/config";
import SvgBuilderArtboard from "./SvgBuilderArtboard";
import SvgBuilderExportMenu from "./SvgBuilderExportMenu";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderStage({ b }: { b: BuilderApi }) {
  return <main className="builder-stage" data-testid="builder-stage" aria-label="SVG sheet stage">
    <StageToolbar b={b} />
    <StageWarning b={b} />
    <StageArtboard b={b} />
    <StageFacts b={b} />
  </main>;
}

function StageToolbar({ b }: { b: BuilderApi }) {
  const zoom = b.prefs.zoom;
  return <div className="builder-stage-toolbar">
    <div className="builder-preset-buttons" aria-label="Layout presets">
      {PRESETS.map((p) => <button type="button" key={p.id} className="builder-btn subtle"
        data-testid={`builder-layout-${p.id}`} onClick={() => b.actions.applyLayoutPreset(p.id)}>{p.label}</button>)}
    </div>
    <div className="builder-zoom" aria-label="Artboard zoom">
      <button type="button" className="builder-btn subtle" data-testid="builder-zoom-out"
        onClick={() => b.actions.setZoom(Math.max(0.25, zoom - 0.1))}>−</button>
      <span data-testid="builder-zoom">{Math.round(zoom * 100)}%</span>
      <button type="button" className="builder-btn subtle" data-testid="builder-zoom-in"
        onClick={() => b.actions.setZoom(Math.min(3, zoom + 0.1))}>＋</button>
      <button type="button" className="builder-btn subtle" data-testid="builder-fit"
        onClick={() => b.actions.setZoom(b.layout.fitScale)}>Fit</button>
    </div>
    <SvgBuilderExportMenu b={b} />
  </div>;
}

function StageWarning({ b }: { b: BuilderApi }) {
  const notes = [...b.notices, ...(b.layout.overflow ? ["The recipe exceeds this artboard's capacity"] : [])];
  return notes.length > 0 ? <p className="builder-stage-warning" data-testid="builder-stage-warning">{notes.join(" · ")}</p> : null;
}

function StageArtboard({ b }: { b: BuilderApi }) {
  return <div className="builder-artboard-scroll">
    {b.document === null
      ? <div className="builder-stage-empty" data-testid="builder-stage-empty">
          <span className="builder-empty-symbol" aria-hidden="true">◇</span>
          <h3>{b.root === null ? "Open a folder to see approved icons" : "Loading approved SVGs…"}</h3>
          <p>Nothing is generated here. Only `.svg.json`-approved icons from every folder in the selected root can be placed.</p>
        </div>
      : <SvgBuilderArtboard doc={b.document} config={b.config} zoom={b.prefs.zoom} />}
  </div>;
}

function StageFacts({ b }: { b: BuilderApi }) {
  if (b.document === null) return null;
  return <div className="builder-document-facts" data-testid="builder-document-facts">
    <span>config {b.document.configFingerprint}</span>
    <span>{b.document.placedIds.length} placed · {b.document.brokenIds.length} broken</span>
    <span>{b.document.metadata?.state === "accepted" ? `metadata: ${b.document.metadata.title}` : "metadata: draft-only"}</span>
  </div>;
}
