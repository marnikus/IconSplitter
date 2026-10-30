// Valid SVG may have an anisotropic pen. Outline that pen in its LOCAL space,
// then let bake transform the filled geometry; one averaged width is not equivalent.
import { expandStrokes, STROKE_PROPS } from "./expand";
import { isShape, type StrokeHit } from "./geom/bounds";
import { isUniform } from "./geom/bakeshape";
import { multiply, type Matrix } from "./geom/matrix";
import { inheritedPresentation, nonScalingStroke, ownPresentation, stripStyleKeys } from "./geom/stroke";
import { restyleStrokes, type StrokeStyle } from "./restyle";

const SOURCE_STYLE: StrokeStyle = { widthPx: null, color: null };
const CONTEXT = [...STROKE_PROPS, "fill", "fill-opacity", "color"];
interface Replacement { source: Element; group: Element; expanded: number; colors: number }
export interface StrokeRepair { changed: boolean; expanded: number; colors: number; unsupported: string[] }

/** Plan every replacement before applying any: a refusal leaves the input untouched. */
export function repairAnisotropicStrokes(hits: StrokeHit[], artboard: Matrix, style: StrokeStyle = SOURCE_STYLE): StrokeRepair {
  const jobs: Replacement[] = [];
  for (const hit of hits) {
    if (!anisotropicPen(hit, artboard)) continue;
    if (style.widthPx !== null) {
      const dash = inheritedPresentation(hit.el, "stroke-dasharray");
      if (dash !== null && dash.trim() !== "none") return refusal("a dashed stroke under a non-uniform transform with a configured final width");
      continue; // Post-bake restyle replaces the pen with the configured final-pixel width.
    }
    const job = outlinedCopy(hit.el, style);
    if (typeof job === "string") return refusal(job);
    jobs.push(job);
  }
  for (const job of jobs) job.source.replaceWith(job.group);
  return { changed: jobs.length > 0, expanded: jobs.reduce((n, job) => n + job.expanded, 0), colors: jobs.reduce((n, job) => n + job.colors, 0), unsupported: [] };
}

/** A non-scaling pen is already defined in final pixels; only its centreline moves. */
function anisotropicPen(hit: StrokeHit, artboard: Matrix): boolean {
  return isShape(hit.el) && !hit.stroke.none && hit.stroke.width > 0
    && !nonScalingStroke(hit.el) && !isUniform(multiply(artboard, hit.ctm));
}

/** A detached group keeps the source's paint context and element opacity as ONE composite. */
function outlinedCopy(source: Element, style: StrokeStyle): Replacement | string {
  const group = source.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "g");
  for (const prop of CONTEXT) {
    const value = inheritedPresentation(source, prop);
    if (value !== null) group.setAttribute(prop, value);
  }
  const clone = source.cloneNode(true) as Element;
  moveCompositeAttrs(source, clone, group);
  group.appendChild(clone);
  const touched = restyleStrokes(group, style);
  const expanded = expandStrokes(group);
  if (expanded.refused !== null) return `non-uniform stroke repair: ${expanded.refused}`;
  group.setAttribute("stroke", "none"); // Do not inherit the source parent's stroke again.
  return { source, group, expanded: expanded.shapes, colors: touched.colors };
}

/** Transform the fill AND outlined pen together; apply shape opacity only once. */
function moveCompositeAttrs(source: Element, clone: Element, group: Element): void {
  const transform = source.getAttribute("transform");
  if (transform !== null) group.setAttribute("transform", transform);
  const opacity = ownPresentation(source, "opacity");
  if (opacity !== null) group.setAttribute("opacity", opacity);
  stripStyleKeys(clone, ["opacity"]);
  clone.removeAttribute("opacity");
  clone.removeAttribute("transform");
}

function refusal(reason: string): StrokeRepair {
  return { changed: false, expanded: 0, colors: 0, unsupported: [reason] };
}
