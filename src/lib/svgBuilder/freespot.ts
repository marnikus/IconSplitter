// freespot.ts — where a quick-edit toolbar may sit (2026-11-14): INSIDE its own
// element and clear of every other element, so the pointer never crosses
// another element on its way to the toolbar (which would switch the toolbar).
// The inside corners are tried first, then the area is scanned row by row from
// the top, right to left. Pure geometry in one coordinate space.
import type { Rect } from "./types";

export interface Size { width: number; height: number }
export interface Point { x: number; y: number }

const overlaps = (a: Rect, b: Rect, gap: number) =>
  a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;

function fits(spot: Rect, area: Rect, obstacles: readonly Rect[], gap: number): boolean {
  if (spot.x < area.x || spot.y < area.y || spot.x + spot.width > area.x + area.width || spot.y + spot.height > area.y + area.height) return false;
  return !obstacles.some((o) => o.width > 0 && o.height > 0 && overlaps(spot, o, gap));
}

/** The corners inside the area, inset: top-right, top-left, bottom-right, bottom-left. */
function corners(area: Rect, size: Size, inset: number): Point[] {
  const right = area.x + area.width - size.width - inset;
  const bottom = area.y + area.height - size.height - inset;
  return [{ x: right, y: area.y + inset }, { x: area.x + inset, y: area.y + inset }, { x: right, y: bottom }, { x: area.x + inset, y: bottom }];
}

/**
 * The toolbar's top-left inside `area`, clear of `obstacles`; null when no
 * spot is free (the caller then keeps it on the element's own edge).
 */
export function freeSpot(area: Rect, size: Size, obstacles: readonly Rect[], opts: { inset?: number; step?: number; gap?: number } = {}): Point | null {
  const inset = opts.inset ?? 6, step = Math.max(2, opts.step ?? 8), gap = opts.gap ?? 4;
  const at = (p: Point): Rect => ({ x: p.x, y: p.y, width: size.width, height: size.height });
  for (const p of corners(area, size, inset)) if (fits(at(p), area, obstacles, gap)) return p;
  for (let y = area.y + inset; y + size.height <= area.y + area.height - inset; y += step) {
    for (let x = area.x + area.width - size.width - inset; x >= area.x + inset; x -= step) {
      if (fits(at({ x, y }), area, obstacles, gap)) return { x, y };
    }
  }
  return null;
}
