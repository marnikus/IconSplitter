/// <reference types="vite/client" />
// sizeguidelabel.ts — the two supplied letter outlines of the size guide:
// `S` for the small repeat, `L` for the large one. They are vector paths (never
// text), filled black and stroke-free, scaled into each logo's own label rect
// (2026-10-20, archive/2026-10-20-upload-size-guide).
import sizeLabelS from "../../svg/templates/size-s.svg?raw";
import sizeLabelL from "../../svg/templates/size-l.svg?raw";
import { visibleBounds, type Bounds } from "./geom/bounds";
import { outlineToPathData, pathOutline, transformOutline } from "./geom/outline";
import { matrixOf } from "./sizeguidecopy";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface Labels { small: Element; large: Element }

/** The supplied labels: one filled black path each, never editable text. */
export function readLabels(): Labels | null {
  const small = readLabel(sizeLabelS);
  const large = readLabel(sizeLabelL);
  return small === null || large === null ? null : { small, large };
}

function readLabel(source: string): Element | null {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  if (doc.querySelector("parsererror") !== null) return null;
  const root = doc.documentElement;
  const paths = Array.from(root.children);
  if (root.nodeName !== "svg" || paths.length !== 1 || paths[0].nodeName !== "path") return null;
  const path = paths[0];
  return path.getAttribute("fill") === "black" && !path.hasAttribute("stroke") && pathOutline(path.getAttribute("d")) !== null ? path : null;
}

export function labelAspect(label: Element): number | null {
  const bounds = visibleBounds(label)?.bounds;
  return bounds === undefined || !(bounds.height > 0) ? null : bounds.width / bounds.height;
}

/** The label's supplied outline scaled into its rect: centred, filled black, stroke-free. */
export function labelPath(root: Element, template: Element, rect: Bounds): Element | null {
  const outline = pathOutline(template.getAttribute("d"));
  const box = visibleBounds(template)?.bounds;
  if (outline === null || box === undefined || !(box.height > 0)) return null;
  const path = root.ownerDocument.createElementNS(SVG_NS, "path");
  path.setAttribute("d", outlineToPathData(transformOutline(outline, matrixOf(rect, box))));
  path.setAttribute("fill", "#000000");
  path.setAttribute("fill-opacity", "1");
  path.setAttribute("stroke", "none");
  return path;
}

