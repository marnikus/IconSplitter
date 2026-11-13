// SVG gradient space → a Level 3 axial/radial shading and its affine transform.
import { multiply, type Matrix } from "./geom/matrix";
import type { Bounds } from "./geom/bounds";
import { epsTransform } from "./epstransform";
import { scalar, type GradientSource } from "./epsgradient";
import { Unsupported } from "./epspaint";

export interface GradientSpace { matrix: Matrix; coords: number[] }

export function gradientSpace(source: GradientSource, bounds: Bounds, viewport: number[]): GradientSpace {
  const units = source.attr("gradientUnits") ?? "objectBoundingBox";
  if (!["objectBoundingBox", "userSpaceOnUse"].includes(units)) throw new Unsupported("unsupported gradient units");
  const object = units === "objectBoundingBox";
  const box = object ? [0, 0, 1, 1] : viewport;
  const coordinate = (name: string, fallback: string, axis: number) => coordinateOf(source.attr(name) ?? fallback, box, axis);
  const coords = source.radial ? radialCoordinates(coordinate) : [coordinate("x1", "0%", 0), coordinate("y1", "0%", 1), coordinate("x2", "100%", 0), coordinate("y2", "0%", 1)];
  const base = object ? { a: bounds.width, b: 0, c: 0, d: bounds.height, e: bounds.minX, f: bounds.minY } : epsTransform(null);
  const matrix = multiply(base, epsTransform(source.attr("gradientTransform")));
  if (Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 1e-12) throw new Unsupported("degenerate gradient geometry");
  if (!source.radial && coords[0] === coords[2] && coords[1] === coords[3]) throw new Unsupported("degenerate linear gradient");
  return { matrix, coords };
}

function radialCoordinates(coordinate: (name: string, fallback: string, axis: number) => number): number[] {
  const cx = coordinate("cx", "50%", 0), cy = coordinate("cy", "50%", 1);
  const r = coordinate("r", "50%", 2);
  const fx = coordinate("fx", String(cx), 0), fy = coordinate("fy", String(cy), 1);
  const fr = coordinate("fr", "0", 2);
  if (r <= 0 || fr !== 0 || Math.hypot(fx - cx, fy - cy) >= r) throw new Unsupported("unsupported radial gradient radius or focal point");
  return [fx, fy, 0, cx, cy, r];
}

function coordinateOf(text: string, viewport: number[], axis: number): number {
  const n = scalar(text);
  if (!text.trim().endsWith("%")) return n;
  if (axis === 2) return n * Math.hypot(viewport[2], viewport[3]) / Math.SQRT2;
  return viewport[axis] + n * viewport[axis + 2];
}
