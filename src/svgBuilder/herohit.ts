// herohit.ts — the banner icon's hover area in the PREVIEW (2026-11-14).
// SVG only reacts on painted strokes, so the thin icon lines and 1 px rings
// were hard to hover. An invisible box over the icon + its circle (4 px
// around) makes the whole area react, like a grid icon's cell. It is added to
// the shadow-root copy only: exported SVGs never contain it.
const PAD = 4;

type Boxed = Element & { getBBox?: () => { x: number; y: number; width: number; height: number } };

/** Puts one transparent hit box first in every banner icon group under `root`. */
export function addHeroHitAreas(root: ParentNode): void {
  for (const g of root.querySelectorAll<Boxed>("[data-banner-hero]")) {
    if (typeof g.getBBox !== "function" || g.querySelector("[data-hero-hit]") !== null) continue;
    const box = g.getBBox();
    if (!(box.width > 0 && box.height > 0)) continue;
    const hit = g.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "rect");
    const attrs: Record<string, number | string> = {
      x: box.x - PAD, y: box.y - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2,
      fill: "none", "pointer-events": "all", "data-hero-hit": "true",
    };
    for (const [k, v] of Object.entries(attrs)) hit.setAttribute(k, String(v));
    g.insertBefore(hit, g.firstChild);
  }
}
