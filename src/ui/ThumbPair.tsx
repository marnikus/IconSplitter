// ThumbPair.tsx — the ONE two-preview shell (2026-10-05). Selection V2 and
// Generate SVG render the same pair of labelled previews through this
// component, so "the zoom resizes both thumbnails" means the same thing in
// both tabs: each cell is a positioning context for its label, the pair wraps
// when the two boxes no longer fit side by side (they stack instead of
// overlapping the next column), and every box is capped by its column so
// nothing is ever clipped. Sizing itself is lib/reviewprefs (`thumbBox` for a
// raster, `vectorThumbBox` for an SVG); this file only lays the pair out.

import type { CSSProperties, ReactNode } from "react";
import type { ThumbSize } from "../lib/reviewprefs";

export interface ThumbCellSpec {
  /** The label over the artwork: "Original" / "AI result" / "Newest SVG". */
  tag: string;
  /** The wrapper's testid, so each surface keeps its own handle. */
  testid?: string;
  /** Extra classes for this surface (e.g. the SVG preview frame). */
  className?: string;
  /** Inline style for this surface (e.g. the frame's background colour). */
  style?: CSSProperties;
  children: ReactNode;
}

/** Two labelled previews: side by side while they fit, stacked when they do not. */
export default function ThumbPair({ cells }: { cells: readonly [ThumbCellSpec, ThumbCellSpec] }) {
  return (
    <div className="thumb-pair">
      {cells.map((cell) => <ThumbCell key={cell.tag} cell={cell} />)}
    </div>
  );
}

/** One labelled preview; the artwork keeps its own size and fit. */
export function ThumbCell({ cell }: { cell: ThumbCellSpec }) {
  const className = cell.className === undefined ? "thumb-cell" : `thumb-cell ${cell.className}`;
  return (
    <span className={className} style={cell.style} data-testid={cell.testid}>
      {cell.children}
      <span className="thumb-tag">{cell.tag}</span>
    </span>
  );
}

/**
 * The box one thumbnail occupies: the size the zoom value produced, and a
 * `max-width` cap so a box wider than its column shrinks (the artwork is
 * contained, never cropped or stretched) instead of overlapping its neighbour.
 */
export function boxStyle(box: ThumbSize): CSSProperties {
  return { width: box.width, height: box.height, maxWidth: "100%" };
}
