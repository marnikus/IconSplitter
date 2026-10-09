// stroke.ts — stroke inheritance (RULE 3): the presentation-attribute +
// inline-style cascade for stroke paint/width/caps/joins/miterlimit down the
// tree. Owned here so the bounds math (lib/upload/geom/bounds) and the export stroke
// normalization (lib/upload/prepare) share ONE definition of "the stroke in
// effect at this element".

/** The stroke state in effect at an element — plus whether its fill is `none`, the one fill fact the bounds need. */
export interface Stroke {
  width: number;
  /** The paint in effect, as written (`#000`, `currentColor`, `url(#a)`, `none`). */
  paint: string;
  none: boolean;
  /** True when the inherited `fill` is `none`: with `none` for the stroke too, the shape paints nothing (I-60). */
  fillNone: boolean;
  cap: string;
  join: string;
  miter: number;
}

/** The document default: no stroke (SVG's initial `stroke` is `none`). */
export function baseStroke(): Stroke {
  return { width: 1, paint: "none", none: true, fillNone: false, cap: "butt", join: "miter", miter: 4 };
}

/** Stroke state inherited down the tree; an inline style beats the attribute. */
export function inheritStroke(el: Element, parent: Stroke): Stroke {
  const style = styleMap(el.getAttribute("style"));
  const attr = (key: string) => style[key] ?? el.getAttribute(key);
  const raw = (attr("stroke") ?? "").trim();
  const paint = raw === "" ? parent.paint : raw;
  const fill = (attr("fill") ?? "").trim();
  return {
    width: parseLen(attr("stroke-width")) ?? parent.width,
    paint,
    none: paint.toLowerCase() === "none",
    fillNone: fill === "" ? parent.fillNone : fill.toLowerCase() === "none",
    cap: (attr("stroke-linecap") ?? parent.cap).trim().toLowerCase(),
    join: (attr("stroke-linejoin") ?? parent.join).trim().toLowerCase(),
    miter: numOr(attr("stroke-miterlimit"), parent.miter),
  };
}

/** The inline `style` attribute as a lowercase-keyed declaration map. */
export function styleMap(style: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of (style ?? "").split(";")) {
    const at = decl.indexOf(":");
    if (at > 0) out[decl.slice(0, at).trim().toLowerCase()] = decl.slice(at + 1).trim();
  }
  return out;
}

function parseLen(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw.trim().replace(/px$/i, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function numOr(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Removes the given declarations from an inline `style`; an emptied style goes. */
export function stripStyleKeys(el: Element, keys: string[]): void {
  const style = el.getAttribute("style");
  if (style === null) return;
  const kept = style.split(";")
    .map((decl) => decl.trim())
    .filter((decl) => decl !== "" && !keys.includes(keyOf(decl)));
  if (kept.length === 0) el.removeAttribute("style");
  else el.setAttribute("style", kept.join("; "));
}

function keyOf(decl: string): string {
  const at = decl.indexOf(":");
  return (at > 0 ? decl.slice(0, at) : decl).trim().toLowerCase();
}
