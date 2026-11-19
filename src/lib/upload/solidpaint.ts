// solidpaint.ts — `currentColor` resolved to the concrete ink (2026-11-19).
// The composed sheet draws every cell as `stroke="currentColor"` beside the
// cell group's `color="#RRGGBB"`, so one icon can be recoloured without
// rewriting its paths. That inheritance is honest on screen and a lie in a
// saved file: Illustrator and every plainer consumer paint `currentColor`
// black, so the ink set on the artboard (or a template) vanished on export.
// Every exported format (SVG, JPEG, EPS) is built from this pass instead.
const PAINTS = ["stroke", "fill", "stop-color", "flood-color"];

/** The nearest `color` in force at an element (its own included), or null. */
function inkOf(el: Element): string | null {
  const colour = el.closest("[color]")?.getAttribute("color")?.trim() ?? "";
  return colour === "" ? null : colour;
}

function paintOf(el: Element): void {
  const ink = inkOf(el);
  if (ink === null) return;
  for (const attribute of PAINTS) {
    if (el.getAttribute(attribute)?.trim().toLowerCase() === "currentcolor") el.setAttribute(attribute, ink);
  }
  const style = el.getAttribute("style");
  if (style !== null && /currentcolor/i.test(style)) el.setAttribute("style", style.replace(/currentcolor/gi, ink));
}

/** The same document with every `currentColor` replaced by its concrete ink. */
export function solidPaint(svg: string): string {
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  if (root === null || root.getElementsByTagName("parsererror").length > 0) return svg;
  for (const el of [root, ...Array.from(root.getElementsByTagName("*"))]) paintOf(el);
  return new XMLSerializer().serializeToString(root);
}
