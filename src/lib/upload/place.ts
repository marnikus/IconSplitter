// place.ts — the artwork placed in its artboard, measured as it SHIPS
// (I-60, 2026-10-09). The artboard used to be fitted to the SOURCE bounds,
// so a stroke the setting widened, or an expanded outline, lay partly outside
// the viewBox. Now every candidate is built on a CLONE of the cleaned source
// — bake(translate·scale) → the configured stroke, verbatim px → expansion
// (when on) — and then MEASURED: `shippedBounds` expands every stroke into
// its real outline on a probe copy, so joins and caps are exact, not a
// conservative hull. A pinned artboard (scale k ≠ 1) with verbatim strokes is
// not linear in k, so the fit is corrected from the measurements (each edge
// is k·geometry + a constant stroke reach — two samples pin it) and
// re-measured, at most MAX_PASSES times; the pass count is reported, a
// candidate that never settles is an honest failure, never a guess.

import { bakeGeometry } from "./bake";
import { expandStrokes } from "./expand";
import { fitArtboard, type ArtboardFit, type PinnedSize } from "./geom";
import { visibleBounds, type Bounds } from "./geom/bounds";
import { identity, type Matrix } from "./geom/matrix";
import { restyleStrokes, type StrokeStyle } from "./restyle";

export const MAX_PASSES = 4;
/** The file is written to 3 decimals; a residual under this is the rounding, not a misfit. */
const FILE_PRECISION = 0.002;

export interface PlaceWant {
  paddingPct: number;
  target: PinnedSize | null;
  style: StrokeStyle;
  expand: boolean;
}

export interface Placed {
  /** A placed COPY of the source root; the source element is untouched. */
  root: Element;
  fit: ArtboardFit;
  /** The shipped artwork's bounds in artboard px. */
  bounds: Bounds;
  passes: number;
  shapesBaked: number;
  widths: number;
  colors: number;
  expanded: number;
}

export type PlaceResult = ({ ok: true } & Placed) | { ok: false; code: "unsupported" | "no-fit"; detail: string };
type Candidate = Omit<Placed, "fit" | "passes">;
type CandidateResult = ({ ok: true } & Candidate) | Extract<PlaceResult, { ok: false }>;

/** [minX, minY, maxX, maxY] of the placed artwork with the fit's translation removed. */
type Edges = [number, number, number, number];
interface Sample { k: number; edges: Edges }

/** The source root placed in its artboard: the artwork clone, the fit and what the passes did. */
export function placeArtwork(source: Element, want: PlaceWant): PlaceResult {
  let bounds = shippedBounds(source);
  if (bounds === null) return { ok: false, code: "unsupported", detail: "the document has no visible geometry" };
  let fit = fitArtboard(bounds, want.paddingPct, want.target);
  const samples: Sample[] = [];
  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const got = candidate(source, fit, want);
    if (!got.ok) return got;
    if (settled(got.bounds, fit, bounds)) return { ...got, fit, passes: pass };
    samples.push({ k: fit.scale, edges: edgesOf(got.bounds, fit) });
    bounds = correctedBounds(samples, want);
    fit = fitArtboard(bounds, want.paddingPct, want.target);
  }
  return { ok: false, code: "no-fit", detail: `the artwork did not settle in its artboard after ${MAX_PASSES} passes` };
}

/** The bounds of the artwork as it ships: strokes measured by their real outline; the analytic bounds when the expander refuses. */
export function shippedBounds(root: Element): Bounds | null {
  const probe = root.cloneNode(true) as Element;
  const exact = bakeGeometry(probe, identity()).unsupported.length === 0 && expandStrokes(probe).refused === null;
  return visibleBounds(exact ? probe : root)?.bounds ?? null;
}

/** True when nothing the document paints lies outside its viewBox (to the file's precision). */
export function insideArtboard(root: Element): boolean {
  const [x, y, w, h] = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  const b = shippedBounds(root);
  if (b === null || [x, y, w, h].some((n) => !Number.isFinite(n))) return false;
  return b.minX >= x - FILE_PRECISION && b.minY >= y - FILE_PRECISION
    && b.minX + b.width <= x + w + FILE_PRECISION && b.minY + b.height <= y + h + FILE_PRECISION;
}

/** One pass: clone → bake the fit → the configured stroke → expansion → measure. */
function candidate(source: Element, fit: ArtboardFit, want: PlaceWant): CandidateResult {
  const root = source.cloneNode(true) as Element;
  const baked = bakeGeometry(root, matrixOf(fit));
  if (baked.unsupported.length > 0) return { ok: false, code: "unsupported", detail: `unsupported content: ${baked.unsupported.join(", ")}` };
  const touched = restyleStrokes(root, want.style);
  const expanded = want.expand ? expandStrokes(root) : { shapes: 0, refused: null };
  if (expanded.refused !== null) return { ok: false, code: "unsupported", detail: `unsupported: ${expanded.refused}` };
  const bounds = shippedBounds(root);
  if (bounds === null) return { ok: false, code: "unsupported", detail: "the placed document has no visible geometry" };
  return { ok: true, root, bounds, shapesBaked: baked.baked, widths: touched.widths, colors: touched.colors, expanded: expanded.shapes };
}

/** The artboard's placement as a matrix: translate(offset) · scale(scale) — what the bake absorbs. */
function matrixOf(fit: ArtboardFit): Matrix {
  return { a: fit.scale, b: 0, c: 0, d: fit.scale, e: fit.offsetX, f: fit.offsetY };
}

/** The measured box sits where the fit put the bounds it was given, to the file's precision. */
function settled(measured: Bounds, fit: ArtboardFit, given: Bounds): boolean {
  const tol = FILE_PRECISION;
  const want: Edges = [
    fit.offsetX + fit.scale * given.minX, fit.offsetY + fit.scale * given.minY,
    fit.offsetX + fit.scale * (given.minX + given.width), fit.offsetY + fit.scale * (given.minY + given.height),
  ];
  const got: Edges = [measured.minX, measured.minY, measured.minX + measured.width, measured.minY + measured.height];
  return got.every((edge, i) => Math.abs(edge - want[i]) <= tol);
}

function edgesOf(b: Bounds, fit: ArtboardFit): Edges {
  return [b.minX - fit.offsetX, b.minY - fit.offsetY, b.minX + b.width - fit.offsetX, b.minY + b.height - fit.offsetY];
}

/**
 * The scale-1 bounds whose fit reproduces the measurements: every edge is
 * `k · geometry + reach` (the stroke reach does not scale when the width is
 * verbatim), so two samples at different k give both terms; one sample, or
 * two at the same k, is read as pure scaling. The fixed point of fit ∘ model
 * is found on the model alone (no DOM work), then verified by the next pass.
 */
function correctedBounds(samples: Sample[], want: PlaceWant): Bounds {
  const at = edgeModel(samples);
  let k = samples[samples.length - 1].k;
  for (let i = 0; i < 64; i++) {
    const next = fitArtboard(at(k), want.paddingPct, want.target).scale;
    if (Math.abs(next - k) <= 1e-12 * Math.max(1, k)) break;
    k = next;
  }
  return at(k);
}

/** The model's bounds in scale-1 units for a scale k: edges(k) / k. */
function edgeModel(samples: Sample[]): (k: number) => Bounds {
  const last = samples[samples.length - 1];
  const prev = samples.length > 1 ? samples[samples.length - 2] : null;
  const linear = prev !== null && Math.abs(last.k - prev.k) > 1e-9;
  const slope = last.edges.map((e, i) => (linear ? (e - prev!.edges[i]) / (last.k - prev!.k) : e / last.k));
  const reach = last.edges.map((e, i) => (linear ? e - slope[i] * last.k : 0));
  return (k) => {
    const e = slope.map((a, i) => (a * k + reach[i]) / k);
    return { minX: e[0], minY: e[1], width: e[2] - e[0], height: e[3] - e[1] };
  };
}
