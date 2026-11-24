// solidpaint.ts — `currentColor` resolved to the concrete ink (2026-11-19).
// The composed sheet draws every cell as `stroke="currentColor"` beside the
// cell group's `color="#RRGGBB"`, so one icon can be recoloured without
// rewriting its paths. That inheritance is honest on screen and a lie in a
// saved file: Illustrator and every plainer consumer paint `currentColor`
// black, so the ink set on the artboard (or a template) vanished on export.
// Every exported format (SVG, JPEG, EPS) is built from this pass instead.
const PAINTS = ["stroke", "fill", "stop-color", "flood-color"];

function applyInkToElement(el: Element, ink: string): void {
  for (const attribute of PAINTS) {
    if (el.getAttribute(attribute)?.trim().toLowerCase() === "currentcolor") el.setAttribute(attribute, ink);
  }
  const style = el.getAttribute("style");
  if (style !== null && /currentcolor/i.test(style)) el.setAttribute("style", style.replace(/currentcolor/gi, ink));
}

function walkSolidPaint(el: Element, inheritedInk: string | null): void {
  const ownColor = el.getAttribute("color")?.trim() ?? "";
  const ink = ownColor === "" ? inheritedInk : ownColor;
  if (ink !== null) applyInkToElement(el, ink);
  for (let child = el.firstElementChild; child !== null; child = child.nextElementSibling) {
    walkSolidPaint(child, ink);
  }
}

/** Resolves `currentColor` in place on an already-parsed `<svg>` element tree. */
export function solidPaintDom(root: Element): void {
  walkSolidPaint(root, null);
}

/** The same document with every `currentColor` replaced by its concrete ink. */
export function solidPaint(svg: string): string {
  if (!/currentcolor/i.test(svg)) return svg;
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  if (root === null || root.getElementsByTagName("parsererror").length > 0) return svg;
  solidPaintDom(root);
  return new XMLSerializer().serializeToString(root);
}
