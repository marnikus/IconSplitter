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
import { outlineToPathData, shapeOutline, type Outline } from "./geom/outline";
import { inheritedPresentation, ownPresentation, stripStyleKeys } from "./geom/stroke";

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
  strokeOpacity: string;
}

export interface ExpandOptions {
  decimals?: 1 | 3;
  scale?: number;
  scaledElements?: Set<Element>;
}

const SOLID_DASH: DashSpec = { pattern: null, offset: 0 };

function treeHasDashOrStrokeOpacity(root: Element, hits: readonly StrokeHit[]): boolean {
  if (root.parentElement !== null) return true;
  return hits.some(({ el }) =>
    el.hasAttribute("stroke-dasharray") || el.hasAttribute("stroke-dashoffset")
    || el.hasAttribute("stroke-opacity") || (el.getAttribute("style")?.includes("stroke-") ?? false));
}

function collectExpandJobs(hits: readonly StrokeHit[], checkInherited: boolean): Job[] | string {
  const jobs: Job[] = [];
  for (const hit of hits) {
    if (!isShape(hit.el) || hit.stroke.none || hit.stroke.width <= 0) continue;
    const refused = vetoOf(hit, checkInherited);
    if (typeof refused === "string") return refused;
    const strokeOpacity = checkInherited ? (inheritedPresentation(hit.el, "stroke-opacity")?.trim() ?? "1") : "1";
    jobs.push({ hit, dash: refused, strokeOpacity });
  }
  return jobs;
}

/** Expands every visible stroke under `root` into a fill, or refuses by name. */
export function expandStrokes(root: Element, opts?: ExpandOptions): ExpandResult {
  const hits = strokeHits(root);
  const jobs = collectExpandJobs(hits, treeHasDashOrStrokeOpacity(root, hits));
  if (typeof jobs === "string") return { shapes: 0, refused: jobs };
  let shapes = 0;
  for (const job of jobs) shapes += expandOne(job, opts) ? 1 : 0;
  for (const hit of hits) {
    if (hit.el === root || hit.el.parentNode !== null) clearStrokeProps(hit.el);
  }
  return { shapes, refused: null };
}

/** The dash spec for a hit, or the refusal text. */
function vetoOf(hit: StrokeHit, checkInherited: boolean): DashSpec | string {
  const tag = `<${hit.el.nodeName.toLowerCase()}>`;
  if (/^url\(/i.test(hit.stroke.paint)) return `a url(#…) stroke paint under Expand strokes on ${tag}`; // the id may already be renamed by the clean pass; the element is the honest name
  if (!checkInherited) return SOLID_DASH;
  const dash = normalizeDash(inheritedPresentation(hit.el, "stroke-dasharray"), inheritedPresentation(hit.el, "stroke-dashoffset"));
  if (!dash.ok) return `${dash.reason} under Expand strokes on ${tag}`;
  return { pattern: dash.pattern, offset: dash.offset };
}

function hasAncestorTransform(el: Element): boolean {
  for (let cur: Element | null = el; cur !== null; cur = cur.parentElement) {
    if (cur.hasAttribute("transform")) return true;
  }
  return false;
}

function copyOwnVisibilityAttrs(from: Element, to: Element): void {
  if (!from.hasAttribute("style") && !from.hasAttribute("opacity") && !from.hasAttribute("display") && !from.hasAttribute("visibility")) return;
  for (const prop of ["opacity", "display", "visibility"]) {
    const value = ownPresentation(from, prop);
    if (value !== null) to.setAttribute(prop, value);
  }
}

function resolveExpandScale(el: Element, opts: ExpandOptions | undefined): { scale: number; decimals: 1 | 3 } {
  const wantScale = opts?.scale ?? 1;
  const scale = wantScale !== 1 && !hasAncestorTransform(el) ? wantScale : 1;
  return { scale, decimals: scale !== 1 ? 1 : (opts?.decimals ?? 3) };
}

function insertExpandedPath(el: Element, expanded: Outline, job: Job, opts: ExpandOptions | undefined): void {
  const path = el.ownerDocument.createElementNS(SVG_NS, "path");
  const { scale, decimals } = resolveExpandScale(el, opts);
  path.setAttribute("d", outlineToPathData(expanded, decimals, scale));
  if (scale !== 1) opts?.scaledElements?.add(path);
  path.setAttribute("fill", job.hit.stroke.paint);
  path.setAttribute("fill-rule", "nonzero");
  path.setAttribute("fill-opacity", job.strokeOpacity);
  copyOwnVisibilityAttrs(el, path);
  el.after(path);
}

/** One shape: the outline path inserted after it; the original stripped or removed. True when a path was written. */
function expandOne(job: Job, opts: ExpandOptions | undefined): boolean {
  const el = job.hit.el;
  const outline = shapeOutline(el);
  if (outline === null) return false;
  const expanded = expandOutline(outline, penOf(job.hit), job.dash);
  if (expanded.ops.length > 0) insertExpandedPath(el, expanded, job, opts);
  if (job.hit.stroke.fillNone) el.remove();
  return expanded.ops.length > 0;
}

function penOf(hit: StrokeHit): Pen {
  const cap = CAPS.find((c) => c === hit.stroke.cap) ?? "butt";
  const join = JOINS.find((j) => j === hit.stroke.join) ?? "miter";
  return { width: hit.stroke.width, cap, join, miter: hit.stroke.miter };
}

function clearStrokeProps(el: Element): void {
  if (el.hasAttribute("style")) stripStyleKeys(el, STROKE_PROPS);
  for (const prop of STROKE_PROPS) {
    if (el.hasAttribute(prop)) el.removeAttribute(prop);
  }
}
