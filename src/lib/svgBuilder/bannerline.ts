// bannerline.ts — what a banner stands on (2026-11-23): a Solid / Split banner
// fills its box with the banner colour; a Line banner has no colour of its own
// (the canvas shows through) and one separator line along the edge that faces
// the grid, centred on that edge, `lineWidth` px wide in `lineColor`.
import { attr, round } from "./markup";
import type { Rect, SheetConfig } from "./types";

type Banner = SheetConfig["banner"];

/** The separator's rectangle: on the banner's inner edge (the grid side), centred on it. */
export function separatorRect(box: Rect, position: Banner["position"], width: number): Rect {
  const h = width / 2;
  if (position === "bottom") return { x: box.x, y: box.y - h, width: box.width, height: width };
  if (position === "top") return { x: box.x, y: box.y + box.height - h, width: box.width, height: width };
  if (position === "left") return { x: box.x + box.width - h, y: box.y, width, height: box.height };
  return { x: box.x - h, y: box.y, width, height: box.height };
}

/** The banner's ground: its colour block, or — Line — only the separator line. */
export function bannerGround(box: Rect, banner: Banner): string {
  if (banner.style !== "line") {
    return `<rect x="${round(box.x)}" y="${round(box.y)}" width="${round(box.width)}" height="${round(box.height)}" fill="${attr(banner.background)}"/>`;
  }
  const r = separatorRect(box, banner.position, banner.lineWidth);
  return `<rect x="${round(r.x)}" y="${round(r.y)}" width="${round(r.width)}" height="${round(r.height)}" fill="${attr(banner.lineColor)}" data-banner-line="true"/>`;
}
