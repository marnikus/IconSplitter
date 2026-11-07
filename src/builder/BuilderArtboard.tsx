// BuilderArtboard.tsx — the sheet itself (design §6): one absolutely positioned
// SVG canvas at the artboard's own pixel size, scaled for the screen only. Every
// cell is drawn from `computeLayout`, so what the user sees is exactly what the
// serializer will write — the artboard never measures anything to decide a place.
//
// Artwork arrives from `lib/builder/place` (one sanitised root per icon, or the
// reason it cannot be drawn); a cell that cannot draw says so instead of showing
// an empty square that looks like a design choice.

import { useMemo } from "react";
import type { BuilderIcon } from "../lib/builder/rows";
import type { BuilderConfig } from "../lib/builder/defaults";
import { computeLayout, type CellFrame, type SheetLayout } from "../lib/builder/layout";
import { fittedSvg, PLACE_REFUSALS, type PlacedIcon, type PlaceResult } from "../lib/builder/place";

export interface BuilderArtboardProps {
  config: BuilderConfig;
  /** What each cell gets, by cell index — null is a hole (honest, not an error). */
  slots: (BuilderIcon | null)[];
  /** The read + sanitised artwork per icon id (absent while unread or refused). */
  placed: Map<string, PlaceResult>;
  /** The on-screen scale (the artboard stays at its own pixel size). */
  zoom: number;
}

export default function BuilderArtboard({ config, slots, placed, zoom }: BuilderArtboardProps) {
  const layout = useMemo(() => computeLayout(config), [config]);
  return (
    <section className="bld-stage" data-testid="builder-artboard" aria-label="Sheet preview">
      <div className="bld-stage-head">
        <span className="bld-stage-size" data-testid="builder-artboard-size">
          {config.artboard.width} × {config.artboard.height}
        </span>
        <span className="bld-stage-zoom" data-testid="builder-zoom">{Math.round(zoom * 100)}%</span>
        <span className="bld-stage-cap" data-testid="builder-capacity">
          {slots.filter((s) => s !== null).length} / {layout.capacity} used
        </span>
      </div>
      {layout.overflow && <OverflowNote layout={layout} />}
      <div className="bld-canvas-wrap" style={{ width: config.artboard.width * zoom, height: config.artboard.height * zoom }}>
        <svg className="bld-canvas" data-testid="builder-canvas" xmlns="http://www.w3.org/2000/svg"
          width={config.artboard.width} height={config.artboard.height}
          viewBox={`0 0 ${config.artboard.width} ${config.artboard.height}`}
          style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
          <Paper config={config} />
          <Banner config={config} layout={layout} />
          {layout.cells.map((cell) => (
            <Cell key={cell.index} cell={cell} config={config} icon={slots[cell.index] ?? null} placed={placed} />
          ))}
        </svg>
      </div>
    </section>
  );
}

/** The sheet's own paper (a rect, so a transparent export is a real difference). */
function Paper({ config }: { config: BuilderConfig }) {
  const a = config.artboard;
  return <rect data-testid="builder-paper" x={0} y={0} width={a.width} height={a.height} rx={a.radius} fill={a.background} />;
}

/** The banner band, when there is one. Its text is the sheet's own words. */
function Banner({ config, layout }: { config: BuilderConfig; layout: SheetLayout }) {
  const rect = layout.banner;
  if (rect === null) return null;
  const b = config.banner;
  return (
    <g data-testid="builder-banner">
      <rect x={rect.left} y={rect.top} width={rect.width} height={rect.height} fill={b.background} />
      {b.title !== "" && (
        <text x={rect.left + 18} y={rect.top + b.titleSize + 16} fill={b.textColor} fontSize={b.titleSize}
          fontFamily={faceOf(b.titleFace)}>{b.title}</text>
      )}
      {b.subtitle !== "" && (
        <text x={rect.left + 18} y={rect.top + b.titleSize + b.subtitleSize + 24} fill={b.subtitleColor}
          fontSize={b.subtitleSize} fontFamily={faceOf(b.titleFace)}>{b.subtitle}</text>
      )}
    </g>
  );
}

/** One cell: the icon's square, its caption, or the reason it is a hole. */
function Cell({ cell, config, icon, placed }: {
  cell: CellFrame; config: BuilderConfig; icon: BuilderIcon | null; placed: Map<string, PlaceResult>;
}) {
  const result = icon === null ? null : placed.get(icon.id) ?? null;
  return (
    <g className="bld-cell" data-testid="builder-cell" data-cell={cell.index} data-icon-id={icon?.id ?? ""}>
      <rect x={cell.left} y={cell.top} width={cell.width} height={cell.height} fill="none" />
      {icon === null ? null : <Artwork cell={cell} config={config} icon={icon} result={result} />}
      {icon !== null && config.grid.captions && (
        <text data-testid="builder-cell-caption" x={cell.left + cell.width / 2}
          y={cell.top + cell.iconSize + cell.captionHeight - 2} textAnchor="middle"
          fontSize={Math.max(4, config.grid.captionSize * fitOf(cell, config))} fill={config.grid.captionColor}>
          {config.grid.captionCase === "upper" ? icon.name.toUpperCase() : icon.name}
        </text>
      )}
    </g>
  );
}

/** The icon's drawing, or the one line that says why there is none. */
function Artwork({ cell, config, icon, result }: {
  cell: CellFrame; config: BuilderConfig; icon: BuilderIcon; result: PlaceResult | null;
}) {
  if (result === null) {
    return <text x={cell.left + cell.width / 2} y={cell.top + cell.iconSize / 2} textAnchor="middle"
      fontSize={9} fill="#8b93a7" data-testid="builder-cell-loading">…</text>;
  }
  if (!result.ok) {
    return <g data-testid="builder-cell-refused" data-refusal={result.kind}>
      <rect x={cell.left} y={cell.top} width={cell.iconSize} height={cell.iconSize} fill="none"
        stroke="#f97316" strokeDasharray="3 3" />
      <text x={cell.left + cell.iconSize / 2} y={cell.top + cell.iconSize / 2} textAnchor="middle"
        fontSize={9} fill="#f97316">not drawable</text>
    </g>;
  }
  return <g data-testid="builder-cell-icon" data-icon-id={icon.id}>
    <g dangerouslySetInnerHTML={{ __html: innerOf(fittedSvg(result as PlacedIcon, cell.iconSize, paintOf(config))) }}
      transform={`translate(${cell.left} ${cell.top})`} />
  </g>;
}

/** The sheet's paint, or undefined when the artwork keeps its own colours. */
function paintOf(config: BuilderConfig): { stroke: string; strokeWidth: number } | undefined {
  return config.icons.strokeWidth > 0 ? { stroke: config.icons.color, strokeWidth: config.icons.strokeWidth } : undefined;
}

/** The children of the wrapper `fittedSvg` built (the cell supplies its own size). */
function innerOf(wrapped: string): string {
  const open = wrapped.indexOf(">");
  const close = wrapped.lastIndexOf("</svg>");
  return open < 0 || close < 0 ? "" : wrapped.slice(open + 1, close);
}

/** A cell's fit scale, relative to the configured icon box. */
function fitOf(cell: CellFrame, config: BuilderConfig): number {
  return config.icons.box <= 0 ? 1 : cell.iconSize / config.icons.box;
}

/** The system font stacks (RULE 20: no CDN, so the ref's web fonts cannot come along). */
function faceOf(face: BuilderConfig["banner"]["titleFace"]): string {
  if (face === "serif") return "Georgia, 'Times New Roman', serif";
  if (face === "mono") return "ui-monospace, SFMono-Regular, Menlo, monospace";
  return "system-ui, -apple-system, 'Segoe UI', sans-serif";
}

/** The grid had to shrink: say it, with the number, and never claim it fits. */
function OverflowNote({ layout }: { layout: SheetLayout }) {
  return (
    <p className="bld-overflow" data-testid="builder-overflow" role="status">
      This grid does not fit the sheet as configured: it shrinks to {Math.round(layout.fitScale * 100)}% so
      nothing leaves the artboard. Fewer columns/rows — or a smaller icon box — fit it exactly.
    </p>
  );
}

export { PLACE_REFUSALS };
