// svgicons.ts — the four-icon output check (prompt §11).
// Owns: counting the distinct icons inside a validated SVG document and saying
// honestly when the count cannot be trusted. It never approves anything: a
// low-confidence count is a warning, manual review stays the final authority.


/** Groups that hold icons; bookkeeping elements are not icons. */
const BOOKKEEPING = new Set(["defs", "title", "desc", "metadata", "style", "lineargradient", "radialgradient", "clippath", "mask", "filter", "pattern", "symbol"]);
const DRAWABLE = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "image", "use"]);

export const EXPECTED_ICONS = 4;

export interface IconCount {
  icons: number;
  /** True only when the layout clearly separates `icons` icon groups. */
  confident: boolean;
  note: string;
}

/**
 * Counts icon groups: direct-child <g> elements that are not bookkeeping.
 * When there are none, the direct drawable children are counted instead, so a
 * flat four-path SVG still reports four icons.
 */
export function countIcons(doc: Document): IconCount {
  const groups = childTags(doc, "g").filter((g) => !isBookkeeping(g));
  if (groups.length >= 2) return verdict(groups.length, `${groups.length} icon groups`);
  const shapes = childTags(doc, ...DRAWABLE);
  if (shapes.length >= 2) return verdict(shapes.length, `${shapes.length} top-level shapes`);
  return { icons: 0, confident: false, note: "no separable icons found" };
}

function verdict(icons: number, how: string): IconCount {
  if (icons === EXPECTED_ICONS) return { icons, confident: true, note: `${EXPECTED_ICONS} icons detected` };
  return {
    icons,
    confident: false,
    note: `${how} — expected ${EXPECTED_ICONS}; review before approving`,
  };
}

function childTags(doc: Document, ...tags: string[]): Element[] {
  const root = doc.documentElement;
  const want = new Set(tags);
  return Array.from(root.children).filter((el) => want.has(el.nodeName.toLowerCase()));
}

/** A <g> is bookkeeping when it only holds gradients, defs or metadata. */
function isBookkeeping(group: Element): boolean {
  const kids = Array.from(group.children);
  return kids.length > 0 && kids.every((k) => BOOKKEEPING.has(k.nodeName.toLowerCase()));
}
