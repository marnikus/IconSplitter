// Repair small accidental stroke/cap overflow, never reveal out-of-frame geometry.
import type { Bounds } from "./geom/bounds";
import { containsBounds, measureViewportBounds, type ViewportBounds } from "./viewportbounds";

/** The original viewport plus a minor stroke-only overshoot; source is untouched. */
export function repairStrokeFrame(root: Element, frame: Bounds | null, measured?: ViewportBounds): Bounds | null {
  if (frame === null) return null;
  const { geometry, painted, unsupported } = measured ?? measureViewportBounds(root, frame);
  if (unsupported.length > 0) return frame;
  if (!geometry || !painted || !containsBounds(geometry, frame, 0.002)) return frame;
  // Large excursions can be deliberate clipping, even when the centreline is inside.
  const limit = Math.min(frame.width, frame.height) * 0.02;
  if (!containsBounds(painted, frame, limit)) return frame;
  const minX = Math.min(frame.minX, painted.minX);
  const minY = Math.min(frame.minY, painted.minY);
  return { minX, minY, width: Math.max(frame.minX + frame.width, painted.minX + painted.width) - minX,
    height: Math.max(frame.minY + frame.height, painted.minY + painted.height) - minY };
}
