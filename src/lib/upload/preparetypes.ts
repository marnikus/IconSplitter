// preparetypes.ts — the prepare stage's public result types and its one
// failure constructor (2026-11-17, split out of prepare.ts so the orchestrator
// stays inside the ratchet). Every prepare module shares these.
import type { Bounds } from "./geom/bounds";
import type { GlobalStroke } from "./strokeglobal";
import type { ArtboardFit } from "./geom";

export type PrepareFailureCode = "parse" | "no-geometry" | "unsupported" | "no-fit";

export interface PreparedSvg {
  /** The export SVG text; the source document is never touched. */
  svg: string;
  fit: ArtboardFit;
  bounds: Bounds;
  /** Shapes whose coordinates were rewritten in artboard px (every transform spent). */
  shapesBaked: number;
  /** Elements whose stroke-width was set to the configured px (0 when strokePx = 0). */
  strokesNormalized: number;
  /** Elements whose stroke paint was set (0 when strokeColor = artwork). */
  strokesRecolored: number;
  /** Visible strokes turned into filled shapes, automatic non-uniform-stroke repairs, size guide and badge handles included. */
  strokesExpanded: number;
  /** The background the export paints: `transparent` or the normalized hex. */
  background: string;
  /** What the root defines once (`stroke`, `stroke-width`); null = per shape, or nothing strokes. */
  globalStroke: GlobalStroke;
  /** Placement passes it took to settle the shipped artwork in its artboard (1 = the first fit was exact; 0 = as is). */
  passes: number;
  /** Every visual setting at "default": `svg` IS the approved source text (2026-10-19). */
  asIs: boolean;
}

export type PrepareFailure = Extract<PrepareResult, { ok: false }>;

export type PrepareResult =
  | ({ ok: true } & PreparedSvg)
  | { ok: false; code: PrepareFailureCode; detail: string };


export function fail(code: PrepareFailureCode, detail: string): PrepareFailure {
  return { ok: false, code, detail };
}
