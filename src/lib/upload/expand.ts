// expand.ts — "Expand strokes to fills" as a DOM pass (2026-10-09, design
// D4 step 7): every visibly stroked shape gets a filled <path> of its stroke's
// outline right AFTER it (SVG paints fill then stroke, so the order holds),
// the original loses every stroke property (a `fill="none"` original goes
// entirely), and containers lose theirs too — nothing in the file strokes any
// more. Runs after the stroke restyle (the setting's px is the width) and
// before the global stroke pass (which then finds nothing to hoist). What it
// cannot expand honestly is refused by name BEFORE the tree is touched
// (RULE 4/15): a `url(#…)` stroke paint, a negative dash, a dash period
// under TOL. Pure DOM in → DOM out, counts returned (RULE 3).

import { isShape, strokeHits, type StrokeHit } from "./geom/bounds";
import { normalizeDash, type DashSpec } from "./geom/expand/dash";
import { expandOutline } from "./geom/expand/assemble";
import type { Cap, Join, Pen } from "./geom/expand/pen";
import { outlineToPathData, shapeOutline } from "./geom/outline";
import { stripStyleKeys, styleMap } from "./geom/stroke";

export const STROKE_PROPS = [
  "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
  "stroke-dasharray", "stroke-dashoffset", "stroke-opacity",
];
const SVG_NS = "http://www.w3.org/2000/svg";
const CAPS: Cap[] = ["butt", "round", "square"];
const JOINS: Join[] = ["miter", "round", "bevel"];

export interface ExpandResult {
  /** Shapes whose stroke became a fill. */
  shapes: number;
  /** The named refusal; when set, the tree is untouched. */
  refused: string | null;
}

interface Job {
  hit: StrokeHit;
  dash: DashSpec;
}

/** Expands every visible stroke under `root` into a fill, or refuses by name. */
export function expandStrokes(root: Element): ExpandResult {
  const hits = strokeHits(root);
  const jobs: Job[] = [];
  for (const hit of hits) {
    if (!isShape(hit.el) || hit.stroke.none || hit.stroke.width <= 0) continue;
    const refused = vetoOf(hit);
    if (typeof refused === "string") return { shapes: 0, refused };
    jobs.push({ hit, dash: refused });
  }
  let shapes = 0;
  for (const job of jobs) shapes += expandOne(job) ? 1 : 0;
  for (const hit of hits) clearStrokeProps(hit.el);
  return { shapes, refused: null };
}

/** The dash spec for a hit, or the refusal text. */
function vetoOf(hit: StrokeHit): DashSpec | string {
  const tag = `<${hit.el.nodeName.toLowerCase()}>`;
  if (/^url\(/i.test(hit.stroke.paint)) return `a url(#…) stroke paint under Expand strokes on ${tag}`; // the id may already be renamed by the clean pass; the element is the honest name
  const dash = normalizeDash(inherited(hit.el, "stroke-dasharray"), inherited(hit.el, "stroke-dashoffset"));
  if (!dash.ok) return `${dash.reason} under Expand strokes on ${tag}`;
  return { pattern: dash.pattern, offset: dash.offset };
}

/** One shape: the outline path inserted after it; the original stripped or removed. True when a path was written. */
function expandOne(job: Job): boolean {
  const el = job.hit.el;
  const outline = shapeOutline(el);
  if (outline === null) return false;
  const expanded = expandOutline(outline, penOf(job.hit), job.dash);
  if (expanded.ops.length > 0) {
    const path = el.ownerDocument.createElementNS(SVG_NS, "path");
    path.setAttribute("d", outlineToPathData(expanded));
    path.setAttribute("fill", job.hit.stroke.paint);
    path.setAttribute("fill-rule", "nonzero");
    const opacity = inherited(el, "stroke-opacity");
    if (opacity !== null && opacity.trim() !== "1") path.setAttribute("fill-opacity", opacity.trim());
    const own = own_(el, "opacity");
    if (own !== null) path.setAttribute("opacity", own);
    el.after(path);
  }
  if (effectiveFill(el).toLowerCase() === "none") el.remove();
  return expanded.ops.length > 0;
}

function penOf(hit: StrokeHit): Pen {
  const cap = CAPS.find((c) => c === hit.stroke.cap) ?? "butt";
  const join = JOINS.find((j) => j === hit.stroke.join) ?? "miter";
  return { width: hit.stroke.width, cap, join, miter: hit.stroke.miter };
}

/** The element's own value of a presentation property: inline style first, then the attribute. */
function own_(el: Element, key: string): string | null {
  return styleMap(el.getAttribute("style"))[key] ?? el.getAttribute(key);
}

/** The value in effect: the nearest own value up the tree, else null. */
function inherited(el: Element, key: string): string | null {
  for (let node: Element | null = el; node !== null; node = node.parentElement) {
    const value = own_(node, key);
    if (value !== null && value.trim() !== "") return value;
  }
  return null;
}

/** The fill in effect (SVG's initial fill is black). */
function effectiveFill(el: Element): string {
  return inherited(el, "fill") ?? "#000";
}

function clearStrokeProps(el: Element): void {
  stripStyleKeys(el, STROKE_PROPS);
  for (const prop of STROKE_PROPS) el.removeAttribute(prop);
}
