// rastertarget.ts — the ONE place a raster is checked against the size it was
// asked for (RULE 15).
//
// Two tabs rasterize SVG now: "SVG to upload" (a JPEG per icon, sent to Gemini)
// and the SVG builder (a PNG of the whole sheet, handed to the user). They differ
// in everything except the rule that matters — a raster whose decoded dimensions
// are not the target is a silent failure, and the user would only find it in their
// stock site. So the check lives here once, and both callers report the same way.

/** The size a raster was asked for, and the colour it was flattened onto. */
export interface RasterTarget {
  width: number;
  height: number;
  /** Normalized `#rrggbb` the canvas is pre-filled with (alpha flattened onto it). */
  background: string;
}

/** Whether a decoded raster is exactly the target — or the honest reason it is not. */
export interface RasterCheck {
  ok: boolean;
  /** `""` when ok; otherwise what went wrong, in the user's words. */
  reason: string;
}

/** The size the raster must have, for a message (`WxH`, upload's published wording). */
export function targetLabel(target: RasterTarget): string {
  return `${target.width}x${target.height}`;
}

/** `{ width, height }` → the check. `null` dimensions mean "undecodable". */
export function checkRasterSize(
  decoded: { width: number; height: number } | null, target: RasterTarget,
): RasterCheck {
  if (decoded === null) return { ok: false, reason: "the raster could not be decoded" };
  if (decoded.width === target.width && decoded.height === target.height) return { ok: true, reason: "" };
  return {
    ok: false,
    reason: `decoded dimensions ${decoded.width}x${decoded.height} do not match the target ${targetLabel(target)}`,
  };
}
