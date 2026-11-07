// SvgBuilderArtboard.tsx — the live sheet: the composed (sanitised) SVG in a
// shadow root, plus preview-only overlays that are never exported: dashed "+"
// placeholders for empty cells and a lock button per placed icon. The wrapper
// takes the SCALED size, so a zoomed sheet scrolls to every edge (FIXES A3).
import { useEffect, useRef } from "react";
import type { CellFrame, SheetDocument } from "../lib/svgBuilder/types";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderArtboard({ b, doc, zoom }: { b: BuilderApi; doc: SheetDocument; zoom: number }) {
  const host = useRef<HTMLDivElement | null>(null);
  const { width, height } = b.config.artboard;
  useEffect(() => {
    const node = host.current;
    if (node === null) return;
    const root = node.shadowRoot ?? node.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{display:block}svg{display:block;width:100%;height:100%}</style>${doc.svg}`;
  }, [doc.svg]);
  return <div className="bld-artboard-wrap" style={{ width: width * zoom, height: height * zoom }}>
    <div className="bld-artboard" data-testid="builder-artboard" data-zoom={zoom} aria-label="Editable SVG sheet artboard"
      style={{ width, height, transform: `scale(${zoom})` }}>
      <div className="bld-artboard-svg" ref={host} />
      <CellOverlays b={b} placed={doc.placedIds} />
    </div>
    <span className="bld-artboard-caption">ARTBOARD 01 · {width} × {height}</span>
  </div>;
}

function CellOverlays({ b, placed }: { b: BuilderApi; placed: readonly string[] }) {
  return <div className="bld-overlay" style={{ color: b.config.icons.color }}>
    {b.layout.cells.map((cell) => {
      const id = placed[cell.index];
      return id === undefined ? <Placeholder key={`e${cell.index}`} cell={cell} />
        : <LockButton key={id} cell={cell} id={id} locked={b.lockedIds.includes(id)} onToggle={b.actions.toggleLock} />;
    })}
  </div>;
}

function Placeholder({ cell }: { cell: CellFrame }) {
  const inset = (cell.size - cell.glyph) / 2;
  return <span className="bld-cell-empty" data-placeholder="true" data-testid={`builder-empty-cell-${cell.index}`}
    style={{ left: cell.x + inset, top: cell.y + inset, width: cell.glyph, height: cell.glyph, fontSize: Math.max(5, cell.glyph * 0.19) }}>+</span>;
}

function LockButton({ cell, id, locked, onToggle }: { cell: CellFrame; id: string; locked: boolean; onToggle: (id: string) => void }) {
  const label = locked ? "Unlock this icon" : "Lock this icon while reshuffling";
  return <span className={`bld-cell${locked ? " is-locked" : ""}`} style={{ left: cell.x, top: cell.y, width: cell.size, height: cell.size }}>
    <button type="button" className="bld-cell-lock" data-testid={`builder-cell-lock-${cell.index}`} aria-pressed={locked}
      aria-label={label} title={label} onClick={() => onToggle(id)}>{locked ? "🔒" : "○"}</button>
  </span>;
}
