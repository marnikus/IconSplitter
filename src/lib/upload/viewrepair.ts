// Repair small accidental stroke/cap overflow, never reveal out-of-frame geometry.
import { visibleBounds, type Bounds } from "./geom/bounds";
import { shippedBounds } from "./place";

/** The original viewport plus a minor stroke-only overshoot; source is untouched. */
export function repairStrokeFrame(root: Element, frame: Bounds | null): Bounds | null {
  if (frame === null) return null;
  const geometry = visibleBounds(root, false)?.bounds;
  const painted = shippedBounds(root);
  if (!geometry || !painted || !contained(geometry, frame, 0.002)) return frame;
  // Large excursions can be deliberate clipping, even when the centreline is inside.
  const limit = Math.min(frame.width, frame.height) * 0.02;
  if (!contained(painted, frame, limit)) return frame;
  const minX = Math.min(frame.minX, painted.minX);
  const minY = Math.min(frame.minY, painted.minY);
  return { minX, minY, width: Math.max(frame.minX + frame.width, painted.minX + painted.width) - minX,
    height: Math.max(frame.minY + frame.height, painted.minY + painted.height) - minY };
}
function contained(b: Bounds, frame: Bounds, tolerance: number): boolean {
  return b.minX >= frame.minX - tolerance && b.minY >= frame.minY - tolerance
    && b.minX + b.width <= frame.minX + frame.width + tolerance
    && b.minY + b.height <= frame.minY + frame.height + tolerance;
}
