// skew.ts — skewing a group selection by ANGLE from one edge of its bounding
// box, the Photoshop way (2026-11-09). A press on the box's edge (between the
// corner handles) and a drag ALONG that edge skews the selected points about
// the CENTRE of the box: the dragged edge follows the pointer, the opposite
// edge goes the other way, and the amount is an angle — tan(angle) is the
// pointer's travel over the edge's distance from the centre. A top / bottom edge
// shears x (↔), a left / right edge shears y (↕); lengths along the sheared axis
// stay (a shear, not a perspective). Anchors and their handles skew together.
// Shift snaps the angle to 15° steps. Pure.

import { cloneModel, type AnchorRef, type PathModel, type Pt } from "./model";
import type { Box } from "./scale";

export type SkewEdge = "n" | "s" | "e" | "w";

/** True for the top and bottom edges: they run along x, so the drag shears x. */
export const runsAlongX = (edge: SkewEdge): boolean => edge === "n" || edge === "s";

const STEP = Math.PI / 12;
/** A skew never reaches 90° (the shape would flatten to a line). */
const MAX = (85 * Math.PI) / 180;

/** The edge of the padded box under `p`: within `band` of it and between its ends; the nearest wins. */
export function skewEdgeAt(box: Box, p: Pt, z: { pad: number; band: number }): SkewEdge | null {
  const x0 = box.x0 - z.pad, y0 = box.y0 - z.pad, x1 = box.x1 + z.pad, y1 = box.y1 + z.pad;
  const inX = p.x >= x0 && p.x <= x1, inY = p.y >= y0 && p.y <= y1;
  const near: [SkewEdge, number][] = [];
  if (inX) near.push(["n", Math.abs(p.y - y0)], ["s", Math.abs(p.y - y1)]);
  if (inY) near.push(["w", Math.abs(p.x - x0)], ["e", Math.abs(p.x - x1)]);
  const best = near.filter(([, d]) => d <= z.band).sort((a, b) => a[1] - b[1])[0];
  return best === undefined ? null : best[0];
}

/** How far the pointer moved along the edge since the press. */
export const alongEdge = (edge: SkewEdge, from: Pt, to: Pt): number => (runsAlongX(edge) ? to.x - from.x : to.y - from.y);

/** The middle of the box: the skew's fixed point. */
export const boxCenter = (box: Box): Pt => ({ x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 });

/**
 * The skew angle (radians) for a pointer travel `delta` along `edge`: the edge follows the pointer, so
 * tan(angle) = delta ÷ the edge's distance from the centre. Up / left is negative. Shift snaps to 15°.
 */
export function skewAngleFor(edge: SkewEdge, box: Box, delta: number, snap: boolean): number {
  const half = (runsAlongX(edge) ? box.y1 - box.y0 : box.x1 - box.x0) / 2;
  if (half <= 0 || delta === 0) return 0;
  const raw = Math.atan(delta / half);
  return Math.max(-MAX, Math.min(MAX, snap ? Math.round(raw / STEP) * STEP : raw));
}

/** One point skewed: the dragged edge's side moves with `angle`, the opposite side the other way. */
function shearer(edge: SkewEdge, box: Box, angle: number): (p: Pt) => Pt {
  const t = Math.tan(angle);
  const c = boxCenter(box);
  switch (edge) {
    case "n": return (p) => ({ x: p.x + (c.y - p.y) * t, y: p.y });
    case "s": return (p) => ({ x: p.x + (p.y - c.y) * t, y: p.y });
    case "w": return (p) => ({ x: p.x, y: p.y + (c.x - p.x) * t });
    default: return (p) => ({ x: p.x, y: p.y + (p.x - c.x) * t });
  }
}

/** One skew: which edge was dragged, the selection's box, and the angle (radians). */
export interface SkewSpec { edge: SkewEdge; box: Box; angle: number }

/** The selected anchors (and their handles) skewed as `spec` says, about the box's centre. */
export function skewAnchors(m: PathModel, refs: readonly AnchorRef[], spec: SkewSpec): PathModel {
  const { edge, box, angle } = spec;
  const out = cloneModel(m);
  if (angle === 0) return out;
  const shear = shearer(edge, box, angle);
  for (const r of refs) {
    const a = out.subs[r.sub]?.anchors[r.i];
    if (a === undefined) continue;
    out.subs[r.sub].anchors[r.i] = { ...a, ...shear(a), in: a.in && shear(a.in), out: a.out && shear(a.out) };
  }
  return out;
}

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/** The box's own corners (nw, ne, se, sw) after the skew: the skewed box the overlay shows. */
export function skewedCorners(box: Box, edge: SkewEdge, angle: number): Pt[] {
  const shear = shearer(edge, box, angle);
  const corners: Pt[] = [{ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, { x: box.x1, y: box.y1 }, { x: box.x0, y: box.y1 }];
  return corners.map((c) => shear(c)).map((p) => ({ x: round6(p.x), y: round6(p.y) }));
}
