// SvgBuilderStage.tsx — centre column: LAYOUT presets (+ CUSTOM pill), zoom
// − NN% + / fit / 1:1, the fitted artboard with its preview overlays, the
// floating Reshuffle and Corrected-brief buttons, and the live status line.
import { useEffect, useRef, useState } from "react";
import { LAYOUT_PRESETS, type LayoutPresetId } from "../lib/svgBuilder/config";
import SvgBuilderArtboard from "./SvgBuilderArtboard";
import { placedOnly } from "../lib/svgBuilder/slots";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderStage({ b }: { b: BuilderApi }) {
  const box = useRef<HTMLDivElement | null>(null);
  const fit = useFitScale(box, b.config.artboard.width, b.config.artboard.height);
  const zoom = b.prefs.fit ? fit : b.prefs.zoom;
  return <main className="bld-stage" data-testid="builder-stage" aria-label="Sheet stage">
    <StageToolbar b={b} zoom={zoom} />
    <div className="bld-canvas" ref={box} data-testid="builder-canvas">
      {b.document === null ? <StageEmpty b={b} /> : <SvgBuilderArtboard b={b} doc={b.document} zoom={zoom} />}
      <button type="button" className="svg-btn bld-float-reshuffle" data-testid="builder-reshuffle-stage" disabled={b.assets.length === 0}
        onClick={b.actions.reshuffle}>↻ Reshuffle</button>
      <button type="button" className="svg-btn ghost bld-float-brief" data-testid="builder-corrected-brief" onClick={b.actions.openBrief}>✦ Corrected brief</button>
    </div>
    <StageStatus b={b} />
  </main>;
}

/** Reference fit: min((stageW − 54) / W, (stageH − 68) / H, 1.15), never below 0.16; recomputed on resize. */
export function fitScaleOf(stageW: number, stageH: number, w: number, h: number): number {
  if (stageW <= 0 || stageH <= 0) return 1;
  return Math.max(0.16, Math.min((stageW - 54) / w, (stageH - 68) / h, 1.15));
}

function useFitScale(ref: { current: HTMLElement | null }, w: number, h: number): number {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    const measure = () => setSize({ w: node.clientWidth, h: node.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [ref]);
  return fitScaleOf(size.w, size.h, w, h);
}

function StageToolbar({ b, zoom }: { b: BuilderApi; zoom: number }) {
  return <div className="bld-toolbar">
    <span className="bld-eyebrow">LAYOUT</span>
    {LAYOUT_PRESETS.map((p) => <button type="button" key={p.id} title={p.hint} data-testid={`builder-layout-${p.id}`}
      className={`svg-btn ghost bld-preset${b.prefs.layout === p.id ? " is-on" : ""}`} aria-pressed={b.prefs.layout === p.id}
      onClick={() => b.actions.applyLayoutPreset(p.id)}><PresetThumb id={p.id} /><span>{p.label}</span></button>)}
    {b.prefs.layout === "custom" && <span className="bld-pill" data-testid="builder-custom-pill">CUSTOM</span>}
    <button type="button" className={`svg-btn tiny${b.prefs.showScores ? " primary" : " ghost"}`} data-testid="builder-toggle-scores"
      aria-pressed={b.prefs.showScores} title={b.prefs.showScores ? "Hide the % similarity numbers on the artboard" : "Show each icon's % similarity to the reference group"}
      onClick={() => b.actions.toggleScores(!b.prefs.showScores)}>% Similarity</button>
    {b.prefs.showScores && <ScoreOpacity b={b} />}
    <div className="bld-zoom" aria-label="Artboard zoom">
      <button type="button" className="svg-btn tiny" data-testid="builder-zoom-out" onClick={() => b.actions.setZoom(zoom - 0.1)}>−</button>
      <button type="button" className="svg-btn ghost tiny bld-zoom-value" data-testid="builder-zoom" title="Fit to stage"
        onClick={b.actions.fitZoom}>{Math.round(zoom * 100)}%</button>
      <button type="button" className="svg-btn tiny" data-testid="builder-zoom-in" onClick={() => b.actions.setZoom(zoom + 0.1)}>+</button>
      <button type="button" className={`svg-btn tiny${b.prefs.fit ? " primary" : ""}`} data-testid="builder-fit" title="Fit" onClick={b.actions.fitZoom}>⤢</button>
      <button type="button" className="svg-btn ghost tiny" data-testid="builder-zoom-1" title="Actual size" onClick={() => b.actions.setZoom(1)}>1:1</button>
    </div>
  </div>;
}

/** How visible the artboard % labels are: 1–100 %. */
function ScoreOpacity({ b }: { b: BuilderApi }) {
  return <label className="bld-opacity" title="Opacity of the % similarity labels">
    <span aria-hidden="true">◐</span>
    <input type="range" className="bld-range" data-testid="builder-score-opacity" aria-label="Similarity label opacity in percent"
      min={1} max={100} step={1} value={b.prefs.scoreOpacity} onChange={(e) => b.actions.setScoreOpacity(Number(e.target.value))} />
    <span className="bld-opacity-value" data-testid="builder-score-opacity-value">{b.prefs.scoreOpacity}%</span>
  </label>;
}

function PresetThumb({ id }: { id: LayoutPresetId }) {
  const body = id === "editorial" ? <rect x="1" y="1" width="6" height="12" />
    : id === "masthead" ? <><rect x="1" y="1" width="18" height="4" /><rect x="1" y="1" width="7" height="4" opacity=".55" /></>
      : <><rect x="4" y="5" width="3" height="3" /><rect x="9" y="5" width="3" height="3" /><rect x="14" y="5" width="3" height="3" /></>;
  return <svg className="bld-preset-thumb" viewBox="0 0 20 14" aria-hidden="true"><rect x=".5" y=".5" width="19" height="13" rx="1.5" fill="none" stroke="currentColor" />{body}</svg>;
}

function StageEmpty({ b }: { b: BuilderApi }) {
  return <div className="bld-stage-empty" data-testid="builder-stage-empty">
    <h3>{b.root === null ? "Open a folder to see approved icons" : b.assets.length === 0 ? "No approved SVGs in this folder" : "Loading approved SVGs…"}</h3>
    <p>Nothing is generated here. Only `.svg.json`-approved icons from every folder in the selected root can be placed.</p>
  </div>;
}

function StageStatus({ b }: { b: BuilderApi }) {
  const placed = Math.min(placedOnly(b.checked.slice(0, b.layout.capacity)).length, b.layout.capacity);
  const empty = b.layout.capacity - placed;
  const line = b.layout.overflow ? <span className="bld-warn">Grid auto-fitted to {Math.round(b.layout.fitScale * 100)}% to remain inside the artboard</span>
    : empty > 0 ? <span>{empty} empty cell{empty === 1 ? "" : "s"} · reshuffle to fill</span>
      : <span><b>{placed}</b> glyphs placed · every stroke inside its box</span>;
  return <div className="bld-stage-status" data-testid="builder-stage-status">
    <span className="bld-status-dot" data-warn={b.layout.overflow} aria-hidden="true" />{line}
    <span className="bld-status-right">LIVE VECTOR PREVIEW · {b.config.artboard.width} × {b.config.artboard.height} px</span>
  </div>;
}
