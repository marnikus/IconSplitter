// fit.ts — fitting the artwork into the padded artboard (design §5, request §5).
// Pure geometry: it turns "these are the VISIBLE bounds (stroke included), this
// is the padding and this is the output scale" into ONE transform for the export
// copy plus the numbers the export JSON records. Why pure: the measurement of
// the bounds needs a browser, so it is injected (the caller measures with
// `getBBox`-style APIs); everything after the measurement is arithmetic that can
// be proven without a DOM — proportional, centred, never cropped, never
// stretched, and honest about degenerate input.

/** A box in the document's own user units. */
export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Uniform px, or the four sides top-right-bottom-left. */
export type Padding = number | { sides: [number, number, number, number] };

export interface FitArgs {
  /** Visible bounds: geometry bounds grown by the stroke margin. */
  bounds: Bounds;
  padding: Padding;
  /** The widest stroke the document draws, in user units (or 0 when none). */
  strokeWidth?: number;
  /** 1 = the padded artboard as measured; >1 = the same geometry, scaled up. */
  outputScale?: number;
}

export interface Fit {
  /** The export artboard in user units. */
  artboard: { w: number; h: number };
  /** The source-units → output-units factor the copy's transform applies. */
  scale: number;
  /** Source point (x, y) lands at (x * scale + dx, y * scale + dy). */
  dx: number;
  dy: number;
  /** Where the content sits in the artboard — never negative, never outside. */
  content: Bounds;
  /** The transform attribute for the wrapping group. */
  transform: string;
}

/** Half the stroke is outside the geometry bounds; that half must be visible. */
export function strokeMargin(strokeWidth: number): number {
  if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) return 0;
  return strokeWidth / 2;
}

export function fitArtboard(args: FitArgs): Fit {
  const scale = positive(args.outputScale ?? 1);
  const margin = strokeMargin(args.strokeWidth ?? 0);
  const sides = paddingSides(args.padding);
  const bounds = saneBounds(args.bounds);
  const content = {
    x: (margin + sides.left) * scale,
    y: (margin + sides.top) * scale,
    w: bounds.w * scale,
    h: bounds.h * scale,
  };
  const artboard = {
    w: (bounds.w + margin * 2 + sides.left + sides.right) * scale,
    h: (bounds.h + margin * 2 + sides.top + sides.bottom) * scale,
  };
  // The group transform is written in SVG's own order: translate then scale.
  const dx = content.x - bounds.x * scale;
  const dy = content.y - bounds.y * scale;
  return {
    artboard, scale, dx, dy, content,
    transform: `translate(${num(dx)} ${num(dy)}) scale(${num(scale)})`,
  };
}

interface Sides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function paddingSides(padding: Padding): Sides {
  if (typeof padding === "number") {
    const px = positive(padding);
    return { top: px, right: px, bottom: px, left: px };
  }
  const [top, right, bottom, left] = padding.sides;
  return { top: positive(top), right: positive(right), bottom: positive(bottom), left: positive(left) };
}

/** A negative or non-finite padding would move content OUT of the artboard. */
function positive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Degenerate bounds (an empty document) must not divide or vanish: keep 0. */
function saneBounds(b: Bounds): Bounds {
  return {
    x: Number.isFinite(b.x) ? b.x : 0,
    y: Number.isFinite(b.y) ? b.y : 0,
    w: Number.isFinite(b.w) && b.w > 0 ? b.w : 0,
    h: Number.isFinite(b.h) && b.h > 0 ? b.h : 0,
  };
}

/** Four decimals: enough for any artboard, and stable in a diff. */
function num(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
