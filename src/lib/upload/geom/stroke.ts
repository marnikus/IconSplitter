// stroke.ts — stroke inheritance (RULE 3): the presentation-attribute +
// inline-style cascade for stroke paint/width/caps/joins/miterlimit down the
// tree. Owned here so the bounds math (lib/upload/geom/bounds) and the export stroke
// normalization (lib/upload/prepare) share ONE definition of "the stroke in
// effect at this element".

/** The stroke state in effect at an element. */
export interface Stroke {
  width: number;
  none: boolean;
  cap: string;
  join: string;
  miter: number;
}

/** The document default: no stroke (SVG's initial `stroke` is `none`). */
export function baseStroke(): Stroke {
  return { width: 1, none: true, cap: "butt", join: "miter", miter: 4 };
}

/** Stroke state inherited down the tree; an inline style beats the attribute. */
export function inheritStroke(el: Element, parent: Stroke): Stroke {
  const style = styleMap(el.getAttribute("style"));
  const attr = (key: string) => style[key] ?? el.getAttribute(key);
  const paint = (attr("stroke") ?? "").trim().toLowerCase();
  return {
    width: parseLen(attr("stroke-width")) ?? parent.width,
    none: paint === "none" || (paint === "" && parent.none),
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

/** Whole-number lexical form for a numeric SVG stroke width, preserving its unit. */
export function roundStrokeWidth(value: string): string | null {
  const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)\s*$/i.exec(value);
  if (match === null) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  const rounded = Math.round(number);
  return `${Object.is(rounded, -0) ? 0 : rounded}${match[2]}`;
}

/** Canonicalizes every explicit stroke width without disturbing other SVG numbers. */
export function roundStrokeWidthAttributes(root: Element): void {
  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    const value = el.getAttribute("stroke-width");
    const rounded = value === null ? null : roundStrokeWidth(value);
    if (rounded !== null) el.setAttribute("stroke-width", rounded);
  }
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
