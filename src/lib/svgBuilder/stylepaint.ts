// stylepaint.ts — the paints of an icon of a registered STYLE (2026-11-23,
// `<base id>~colored_wiggle`): kept as the icon drew them. Each drawable element
// gets its EFFECTIVE fill, stroke and stroke width written on itself — resolved
// through its groups and `style` (SVG defaults otherwise), colours as #RRGGBB —
// as markers the composer fills in per sheet (`paintsOf`): the sheet's
// colored-icon stroke colour / width replace only stroke paints, its fill colour
// only fill paints; an empty setting keeps the icon's own. Pure (DOM in, text out).
import type { SheetConfig } from "./types";

export const DRAWABLE = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "use"]);
export const UNSAFE = new Set(["script", "foreignobject", "handler", "listener", "iframe", "object", "embed"]);
export const OPACITY = ["opacity", "fill-opacity", "stroke-opacity"];

const STROKE = "@@S", FILL = "@@F", WIDTH = "@@W";
const STROKE_AT = / stroke="@@S([^"]*)"/g, FILL_AT = / fill="@@F([^"]*)"/g, WIDTH_AT = / stroke-width="@@W([^"]*)"/g;

interface Paint { fill: string; stroke: string; width: string }
const SVG_DEFAULT: Paint = { fill: "#000000", stroke: "none", width: "1" };

const local = (el: Element) => el.localName.toLowerCase();
const isNone = (v: string) => v.toLowerCase() === "none" || v.toLowerCase() === "transparent";

/** An element's own value of a paint property: its `style` declaration first, then its attribute; empty / inherit = not its own. */
function ownValue(el: Element, prop: string): string | null {
  const declared = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i").exec(el.getAttribute("style") ?? "")?.[1];
  const value = (declared ?? el.getAttribute(prop) ?? "").trim();
  return value === "" || value.toLowerCase() === "inherit" ? null : value;
}

const hex2 = (n: string) => Math.min(255, Number(n)).toString(16).padStart(2, "0");

/** #abc / #aabbcc / rgb() as #RRGGBB (what every saved file keeps); anything else (url(#…), currentColor, a name) as it is. */
export function paintColor(value: string): string {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  if (short !== null) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(value);
  return rgb === null ? value : `#${hex2(rgb[1])}${hex2(rgb[2])}${hex2(rgb[3])}`.toUpperCase();
}

function writePaint(el: Element, p: Paint): void {
  el.setAttribute("fill", isNone(p.fill) ? "none" : `${FILL}${paintColor(p.fill)}`);
  if (isNone(p.stroke)) {
    el.setAttribute("stroke", "none");
    el.removeAttribute("stroke-width");
    return;
  }
  el.setAttribute("stroke", `${STROKE}${paintColor(p.stroke)}`);
  el.setAttribute("stroke-width", `${WIDTH}${p.width}`);
}

/** Every drawable element carries its own effective paints (as markers); groups carry none, so nothing is left to inherit. */
export function markPaints(el: Element, inherited: Paint = SVG_DEFAULT): void {
  const paint = { fill: ownValue(el, "fill") ?? inherited.fill, stroke: ownValue(el, "stroke") ?? inherited.stroke, width: ownValue(el, "stroke-width") ?? inherited.width };
  el.removeAttribute("style");
  for (const a of OPACITY) el.removeAttribute(a); // the artwork is never transparent (2026-11-14)
  if (DRAWABLE.has(local(el))) writePaint(el, paint);
  else for (const a of ["fill", "stroke", "stroke-width"]) el.removeAttribute(a);
  for (const child of Array.from(el.children)) if (!UNSAFE.has(local(child))) markPaints(child, paint);
}

/** The markers filled in for one sheet: stroke colour / width on strokes, fill colour on fills; an empty setting = the icon's own. */
export function paintsOf(children: string, style: SheetConfig["icons"], pen: (width: number) => string): string {
  return children
    .replace(STROKE_AT, (_m, own: string) => ` stroke="${style.coloredStroke || own}"`)
    .replace(FILL_AT, (_m, own: string) => ` fill="${style.coloredFill || own}"`)
    .replace(WIDTH_AT, (_m, own: string) => ` stroke-width="${style.coloredStrokeWidth > 0 ? pen(style.coloredStrokeWidth) : own}"`);
}
