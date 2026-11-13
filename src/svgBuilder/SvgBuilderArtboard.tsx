// SvgBuilderArtboard.tsx — the live sheet: the composed (sanitised) SVG in a
// shadow root, plus preview-only overlays that are never exported: dashed "+"
// placeholders for empty cells and a lock button per placed icon. The wrapper
// takes the SCALED size, so a zoomed sheet scrolls to every edge (FIXES A3).
import { useEffect, useRef } from "react";
import type { CellFrame, SheetDocument } from "../lib/svgBuilder/types";
import type { BuilderApi } from "./useSvgBuilder";
import { isEmptySlot } from "../lib/svgBuilder/slots";
import { useInlineText } from "./SvgBuilderInlineText";

export default function SvgBuilderArtboard({ b, doc, zoom }: { b: BuilderApi; doc: SheetDocument; zoom: number }) {
  const host = useRef<HTMLDivElement | null>(null);
  const board = useRef<HTMLDivElement | null>(null);
  const { width, height } = b.config.artboard;
  const inline = useInlineText(b, zoom, board);
  useEffect(() => {
    const node = host.current;
    if (node === null) return;
    const root = node.shadowRoot ?? node.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{display:block}svg{display:block;width:100%;height:100%}[data-banner-text]{cursor:text}[data-banner-text]:hover{outline:1px dashed currentColor;outline-offset:3px}</style>${doc.svg}`;
  }, [doc.svg]);
  return <div className="bld-artboard-wrap" style={{ width: width * zoom, height: height * zoom }}>
    <div className="bld-artboard" data-testid="builder-artboard" data-zoom={zoom} aria-label="Editable SVG sheet artboard — double-click the banner text to edit it"
      ref={board} style={{ width, height, transform: `scale(${zoom})` }}>
      <div className="bld-artboard-svg" ref={host} />
      <CellOverlays b={b} placed={b.checked} />
      {inline.editor}
    </div>
    <span className="bld-artboard-caption">ARTBOARD 01 · {width} × {height}</span>
  </div>;
}

function CellOverlays({ b, placed }: { b: BuilderApi; placed: readonly string[] }) {
  return <div className="bld-overlay" style={{ color: b.config.icons.color }}>
    {b.layout.cells.map((cell) => {
      const id = placed[cell.index];
      return id === undefined || isEmptySlot(id) ? <Placeholder key={`e${cell.index}`} cell={cell} /> : <PlacedCell key={id} b={b} cell={cell} id={id} />;
    })}
  </div>;
}

function Placeholder({ cell }: { cell: CellFrame }) {
  const inset = (cell.size - cell.glyph) / 2;
  return <span className="bld-cell-empty" data-placeholder="true" data-testid={`builder-empty-cell-${cell.index}`}
    style={{ left: cell.x + inset, top: cell.y + inset, width: cell.glyph, height: cell.glyph, fontSize: Math.max(5, cell.glyph * 0.19) }}>+</span>;
}

/** Hover controls (lock, exclude) and the optional % closeness to the reference group. */
function PlacedCell({ b, cell, id }: { b: BuilderApi; cell: CellFrame; id: string }) {
  const locked = b.lockedIds.includes(id);
  const label = locked ? "Unlock this icon" : "Lock this icon while reshuffling";
  const small = Math.max(7, Math.min(13, cell.size * 0.22));
  return <span className={`bld-cell${locked ? " is-locked" : ""}`} style={{ left: cell.x, top: cell.y, width: cell.size, height: cell.size }}>
    <button type="button" className="bld-cell-lock" data-testid={`builder-cell-lock-${cell.index}`} aria-pressed={locked}
      aria-label={label} title={label} onClick={() => b.actions.toggleLock(id)}>{locked ? "🔒" : "○"}</button>
    <button type="button" className="bld-cell-exclude" data-testid={`builder-cell-exclude-${cell.index}`}
      aria-label="Exclude this icon and refill its cell" title="Exclude and refill this cell · Shift+click: remove and leave the cell empty"
      onClick={(e) => b.actions.excludeAsset(id, e.shiftKey)}>×</button>
    {b.prefs.showScores && <CellScore b={b} cell={cell} id={id} fontSize={small} />}
    {b.prefs.showUsage && <CellUse b={b} cell={cell} id={id} fontSize={small} />}
  </span>;
}

/**
 * How often the icon was already used (2026-11-13): saved use from exported
 * artboards, and "+M" for artboards whose use is not saved yet. Preview only.
 */
function CellUse({ b, cell, id, fontSize }: { b: BuilderApi; cell: CellFrame; id: string; fontSize: number }) {
  const used = b.discovery?.usage.get(id)?.used ?? 0;
  const pending = b.pendingUse.get(id) ?? 0;
  const title = `Used in ${used} exported artboard(s)${pending > 0 ? ` · on ${pending} more not exported yet` : ""}`;
  return <span className="bld-cell-use" data-used={used} data-testid={`builder-cell-use-${cell.index}`} title={title} style={{ fontSize }}>
    ×{used}{pending > 0 ? <small>+{pending}</small> : null}</span>;
}

/** "REF" for the reference group, "NN%" closeness (green ≥ threshold, amber below), "–" without vectors. */
function CellScore({ b, cell, id, fontSize }: { b: BuilderApi; cell: CellFrame; id: string; fontSize: number }) {
  const isRef = b.referenceIds.includes(id) && b.reference.count > 0;
  const asset = b.assets.find((a) => a.id === id);
  const v = scoreView(isRef || asset === undefined ? null : b.scoreOf(asset), isRef, b.recipe.threshold);
  return <span className="bld-cell-score" data-tone={v.tone} data-testid={`builder-cell-score-${cell.index}`} title={v.title}
    style={{ fontSize, opacity: b.prefs.scoreOpacity / 100 }}>{v.value}</span>;
}

interface ScoreView { value: string; tone: "ref" | "none" | "high" | "low"; title: string }

/** The label, colour and tooltip of one cell's closeness number. */
export function scoreView(raw: number | null, isRef: boolean, threshold: number): ScoreView {
  if (isRef) return { value: "REF", tone: "ref", title: "Part of the reference group" };
  if (raw === null) return { value: "–", tone: "none", title: "No similarity yet — index the icons and lock a reference" };
  const pct = Math.round(raw * 100);
  return { value: `${pct}%`, tone: pct >= threshold ? "high" : "low", title: `${pct}% similar to the reference group` };
}
