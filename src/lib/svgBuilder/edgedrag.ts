// edgedrag.ts — dragging the banner's inner edge and the icon padding edges right
// on the artboard (2026-11-14). Pure geometry in artboard pixels: where each
// handle sits, and the clamped value a drag of (dx, dy) gives.
import { RANGES, bannerRange, clampTo } from "./ranges";
import type { Rect, SheetConfig } from "./types";

export type Side = "left" | "right" | "top" | "bottom";
/** "size" grips sit on the artboard's right / bottom border and its corner ("corner" = both). */
export interface EdgeHandle { id: string; kind: "banner" | "pad" | "size"; side: Side | "corner"; x: number; y: number }

const SIDES: readonly Side[] = ["left", "right", "top", "bottom"];
const OPPOSITE: Record<Side, Side> = { left: "right", right: "left", top: "bottom", bottom: "top" };

/** The midpoint of a rect's side. */
function midOf(r: Rect, side: Side): { x: number; y: number } {
  if (side === "left") return { x: r.x, y: r.y + r.height / 2 };
  if (side === "right") return { x: r.x + r.width, y: r.y + r.height / 2 };
  if (side === "top") return { x: r.x + r.width / 2, y: r.y };
  return { x: r.x + r.width / 2, y: r.y + r.height };
}

/** The banner's inner edge, then the padding edges of the icon area (not the side touching the banner). */
export function edgeHandles(config: SheetConfig, layout: { banner: Rect | null; content: Rect }): EdgeHandle[] {
  const pos = config.banner.position;
  const out: EdgeHandle[] = [];
  if (layout.banner !== null && pos !== "none") out.push({ id: "banner", kind: "banner", side: OPPOSITE[pos], ...midOf(layout.banner, OPPOSITE[pos]) });
  for (const side of SIDES) if (side !== pos) out.push({ id: `pad-${side}`, kind: "pad", side, ...midOf(layout.content, side) });
  const { width, height } = config.artboard;
  const board: Rect = { x: 0, y: 0, width, height };
  out.push({ id: "size-right", kind: "size", side: "right", ...midOf(board, "right") },
    { id: "size-bottom", kind: "size", side: "bottom", ...midOf(board, "bottom") },
    { id: "size-corner", kind: "size", side: "corner", x: width, y: height });
  return out;
}

/** How far a drag moves the edge inward/outward along its own axis (positive = towards the right/bottom). */
const along = (side: Side, dx: number, dy: number) => (side === "left" || side === "right" ? dx : dy);

/** The banner size after dragging its inner edge: it grows towards the icons. */
export function bannerSizeAfter(config: SheetConfig, start: number, d: { dx: number; dy: number }): number {
  const pos = config.banner.position;
  if (pos === "none") return start;
  const grow = pos === "left" || pos === "top" ? 1 : -1;
  return Math.round(clampTo(bannerRange(pos), start + grow * along(OPPOSITE[pos], d.dx, d.dy)));
}

/** The padding after dragging one padding edge: moving it inward adds padding. */
export function paddingAfter(side: Side, start: number, d: { dx: number; dy: number }): number {
  const inward = side === "left" || side === "top" ? 1 : -1;
  return Math.round(clampTo(RANGES.padding, start + inward * along(side, d.dx, d.dy)));
}

/** The artboard after dragging its right edge (width), bottom edge (height) or corner (both); clamped. */
export function artboardSizeAfter(start: { width: number; height: number }, side: Side | "corner", d: { dx: number; dy: number }): { width: number; height: number } {
  const w = side === "right" || side === "corner" ? d.dx : 0;
  const h = side === "bottom" || side === "corner" ? d.dy : 0;
  return { width: Math.round(clampTo(RANGES.width, start.width + w)), height: Math.round(clampTo(RANGES.height, start.height + h)) };
}
