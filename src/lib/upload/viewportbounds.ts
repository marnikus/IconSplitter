// Viewport classification only: never replace conservative layout/placement bounds.
import { bakeGeometry } from "./bake";
import { expandStrokes } from "./expand";
import { visibleBounds, type Bounds } from "./geom/bounds";
import { identity } from "./geom/matrix";
import { tightGeometryBounds } from "./geom/tightbounds";

export interface ViewportBounds {
  geometry: Bounds | null;
  painted: Bounds | null;
  unsupported: string[];
  method: "conservative-contained" | "outlined-tight" | "unavailable";
}

/** One probe shared by repair and final veto. Conservative containment is already proof. */
export function measureViewportBounds(root: Element, frame: Bounds): ViewportBounds {
  const probe = outlinedProbe(root);
  const baseline = conservativeMeasurement(root, probe.unsupported.length === 0 ? probe.root : root);
  if (baseline.painted === null || containsBounds(baseline.painted, frame, 0.002)) return baseline;
  if (probe.unsupported.length > 0) return { ...baseline, unsupported: probe.unsupported, method: "unavailable" };
  const geometry = tightGeometryBounds(root), painted = tightGeometryBounds(probe.root);
  return { geometry: geometry.bounds, painted: painted.bounds, method: "outlined-tight",
    unsupported: [...new Set([...geometry.unsupported, ...painted.unsupported])] };
}

/** Preserve the old hull proof; empty geometry still carries unsupported provenance. */
function conservativeMeasurement(root: Element, probe: Element): ViewportBounds {
  const geometry = visibleBounds(root, false) ?? tightGeometryBounds(root);
  const painted = visibleBounds(probe);
  return { geometry: geometry.bounds, painted: painted?.bounds ?? null,
    unsupported: [...geometry.unsupported, ...(painted?.unsupported ?? [])], method: "conservative-contained" };
}

function outlinedProbe(root: Element): { root: Element; unsupported: string[] } {
  const probe = root.cloneNode(true) as Element;
  const baked = bakeGeometry(probe, identity());
  if (baked.unsupported.length > 0) return { root: probe, unsupported: baked.unsupported };
  const expanded = expandStrokes(probe);
  return { root: probe, unsupported: expanded.refused === null ? [] : [expanded.refused] };
}

/** Containment in the original source coordinate system, with an explicit tolerance. */
export function containsBounds(b: Bounds, frame: Bounds, tolerance: number): boolean {
  return b.minX >= frame.minX - tolerance && b.minY >= frame.minY - tolerance
    && b.minX + b.width <= frame.minX + frame.width + tolerance
    && b.minY + b.height <= frame.minY + frame.height + tolerance;
}
