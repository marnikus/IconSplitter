// Visibility for parsed SVG geometry: fill/stroke opacity and visibility may be
// overridden by a child; zero group opacity or display:none hides the subtree.
// The same traversal still visits hidden shapes for the bake/stroke pipeline.
import { identity, multiply, parseTransform, type Matrix } from "./matrix";
import { baseStroke, inheritStroke, styleMap, type Stroke } from "./stroke";

interface Visibility { group: boolean; fill: boolean; stroke: boolean; display: boolean; visible: boolean }
export interface PaintState { ctm: Matrix; stroke: Stroke; visibility: Visibility }
type Visit = (el: Element, state: PaintState) => void;

const CONTAINERS = ["svg", "g", "a", "switch"];

/** Visit source shapes with their CTM, stroke and effective channel visibility. */
export function walkPaintTree(root: Element, visit: Visit): void {
  walkChild(root, {
    ctm: identity(), stroke: baseStroke(),
    visibility: { group: true, fill: true, stroke: true, display: true, visible: true },
  }, visit);
}

function walkChild(el: Element, parent: PaintState, visit: Visit): void {
  const here: PaintState = {
    ctm: multiply(parent.ctm, parseTransform(el.getAttribute("transform"))),
    stroke: inheritStroke(el, parent.stroke),
    visibility: inheritVisibility(el, parent.visibility),
  };
  visit(el, here);
  if (CONTAINERS.includes(el.nodeName.toLowerCase())) {
    for (const child of Array.from(el.children)) walkChild(child, here, visit);
  }
}

/** Hidden paint occupies no bounds; partial opacity still occupies full bounds. */
export function visiblePaint(stroke: Stroke, visibility: Visibility): boolean {
  return visibility.group && visibility.display && visibility.visible
    && ((!stroke.fillNone && visibility.fill)
      || (!stroke.none && stroke.width > 0 && visibility.stroke));
}

function inheritVisibility(el: Element, parent: Visibility): Visibility {
  const style = styleMap(el.getAttribute("style"));
  const own = (key: string) => style[key] ?? el.getAttribute(key);
  return {
    group: parent.group && opacityVisible(own("opacity"), true),
    fill: opacityVisible(own("fill-opacity"), parent.fill),
    stroke: opacityVisible(own("stroke-opacity"), parent.stroke),
    display: parent.display && own("display")?.trim().toLowerCase() !== "none",
    visible: visibilityVisible(own("visibility"), parent.visible),
  };
}

function visibilityVisible(value: string | null, inherited: boolean): boolean {
  const state = value?.trim().toLowerCase();
  return state === "hidden" || state === "collapse" ? false : state === "visible" ? true : inherited;
}

function opacityVisible(value: string | null, inherited: boolean): boolean {
  if (value === null || value.trim() === "") return inherited;
  const trimmed = value.trim();
  const n = Number(trimmed.endsWith("%") ? trimmed.slice(0, -1) : trimmed);
  return Number.isFinite(n) ? n !== 0 : inherited;
}
