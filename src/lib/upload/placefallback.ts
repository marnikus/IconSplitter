// A bounded measured search when large verbatim strokes change the limiting
// edge: an affine edge model can switch branches and miss a valid pinned fit.
import { fmt, paddingBox, type ArtboardFit } from "./geom";
import type { Bounds } from "./geom/bounds";
import type { CandidateResult, PlaceResult, PlaceWant } from "./place";

type Probe = (fit: ArtboardFit) => CandidateResult;
type Good = Extract<CandidateResult, { ok: true }>;
const SEARCH_PASSES = 32;
const ROUNDING_GUARD = 0.008;

/** Never enlarge the requested pinned artboard, change strokes or stretch artwork. */
export function recoverPinnedFit(want: PlaceWant, initial: ArtboardFit, probe: Probe): PlaceResult | null {
  if (!want.target || "megapixels" in want.target) return null;
  const fit = { ...initial, offsetX: 0, offsetY: 0 };
  const found = searchScale(fit, probe);
  if (!found.ok) return found;
  const b = found.candidate.bounds, box = paddingBox(fit);
  // Use the same coordinate grid as the baked geometry: a fractional-grid shift
  // can re-round tiny segments and change their wide-stroke tangent extrema.
  const centered = { ...fit, scale: found.scale,
    offsetX: Number(fmt(box.minX + box.width / 2 - b.minX - b.width / 2)),
    offsetY: Number(fmt(box.minY + box.height / 2 - b.minY - b.height / 2)) };
  const final = probe(centered);
  if (!final.ok) return final;
  if (!insidePadding(final.bounds, centered)) return { ok: false, code: "no-fit", detail: "the measured artwork cannot fit the requested artboard with these strokes" };
  return { ...final, fit: centered, passes: SEARCH_PASSES + 5 };
}
function searchScale(fit: ArtboardFit, probe: Probe):
  { ok: true; scale: number; candidate: Good } | Extract<PlaceResult, { ok: false }> {
  let low = 0; let high = fit.scale; let best: Good | null = null;
  for (let i = 0; i < SEARCH_PASSES; i++) {
    const scale = (low + high) / 2;
    const got = probe({ ...fit, scale });
    if (!got.ok) return got;
    if (fitsSize(got.bounds, fit)) { low = scale; best = got; }
    else high = scale;
  }
  return best ? { ok: true, scale: low, candidate: best }
    : { ok: false, code: "no-fit", detail: "the requested stroke and padding leave no room for the artwork" };
}
function fitsSize(b: Bounds, fit: ArtboardFit): boolean {
  const box = paddingBox(fit);
  return b.width <= box.width - ROUNDING_GUARD && b.height <= box.height - ROUNDING_GUARD;
}
function insidePadding(b: Bounds, fit: ArtboardFit): boolean {
  const box = paddingBox(fit);
  return b.minX >= box.minX - 0.002 && b.minY >= box.minY - 0.002
    && b.minX + b.width <= box.minX + box.width + 0.002
    && b.minY + b.height <= box.minY + box.height + 0.002;
}
