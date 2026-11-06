/// <reference types="vite/client" />
// The Upload shadow is vector geometry copied from the shipped SVG template.
// Its user-space radial gradient is normalized to the ellipse's bounding box
// before the artboard fit, so neither transforms nor raster effects are needed.
import shadowTemplate from "../../svg/templates/shadow.svg?raw";
import { fmt } from "./geom";
import type { Bounds } from "./geom/bounds";

const SVG_NS = "http://www.w3.org/2000/svg";
const SHADOW_ID = "upload-shadow";

interface ShadowSource {
  ellipse: Element;
  gradient: Element;
  aspect: number;
}

interface ShadowGeometry {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** Add the template shadow behind the icon, sized from the *shipped* icon bounds. */
export function appendUploadShadow(root: Element, icon: Bounds, widthPct: number, gapPct: number): Element | null {
  const template = readShadowTemplate();
  const width = icon.width * widthPct / 100;
  if (template === null || !(width > 0) || !(icon.height > 0) || !Number.isFinite(gapPct)) return null;
  const height = width * template.aspect;
  if (Number(fmt(width / 2)) <= 0 || Number(fmt(height / 2)) <= 0) return null;
  const ellipse = root.ownerDocument.importNode(template.ellipse, true);
  const gradient = root.ownerDocument.importNode(template.gradient, true);
  const id = availableId(root);
  gradient.setAttribute("id", id);
  gradient.setAttribute("gradientUnits", "objectBoundingBox");
  gradient.setAttribute("cx", "0.5");
  gradient.setAttribute("cy", "0.5");
  gradient.setAttribute("r", "0.5");
  gradient.removeAttribute("gradientTransform");
  ellipse.setAttribute("cx", fmt(icon.minX + icon.width / 2));
  ellipse.setAttribute("cy", fmt(icon.minY + icon.height + icon.height * gapPct / 100 + height / 2));
  ellipse.setAttribute("rx", fmt(width / 2));
  ellipse.setAttribute("ry", fmt(height / 2));
  ellipse.setAttribute("fill", `url(#${id})`);
  ellipse.setAttribute("stroke", "none");
  defsOf(root).appendChild(gradient);
  root.insertBefore(ellipse, root.firstChild);
  return ellipse;
}

/** Extract the source ellipse/stops only if the user-space radial paint can be mapped exactly. */
function readShadowTemplate(): ShadowSource | null {
  const doc = new DOMParser().parseFromString(shadowTemplate, "image/svg+xml");
  if (doc.querySelector("parsererror") !== null) return null;
  const ellipses = doc.querySelectorAll("ellipse");
  const gradients = doc.querySelectorAll("radialGradient");
  if (ellipses.length !== 1 || gradients.length !== 1) return null;
  const ellipse = ellipses[0];
  const gradient = gradients[0];
  const geometry = ellipseGeometry(ellipse, gradient);
  if (geometry === null || !validStops(gradient) || !isUnitGradient(gradient, geometry)) return null;
  return { ellipse, gradient, aspect: geometry.ry / geometry.rx };
}

/** Paint and radii copied from the known template, never guessed from a partial SVG. */
function ellipseGeometry(ellipse: Element, gradient: Element): ShadowGeometry | null {
  const values = ["cx", "cy", "rx", "ry"].map((key) => numberAttr(ellipse, key));
  if (values.some((n) => n === null)) return null;
  const [cx, cy, rx, ry] = values as number[];
  const opacity = numberAttr(ellipse, "fill-opacity");
  if (rx <= 0 || ry <= 0 || opacity === null || opacity < 0 || opacity > 1) return null;
  if (ellipse.getAttribute("fill") !== `url(#${gradient.id})`) return null;
  return { cx, cy, rx, ry };
}

/** User-space unit circle translated/scaled exactly onto the template ellipse. */
function isUnitGradient(gradient: Element, geometry: ShadowGeometry): boolean {
  if (gradient.getAttribute("gradientUnits") !== "userSpaceOnUse") return false;
  if (!["cx", "cy", "r"].every((key, i) => numberAttr(gradient, key) === [0, 0, 1][i])) return false;
  const transform = /^translate\(([^)]*)\)\s*scale\(([^)]*)\)$/.exec(gradient.getAttribute("gradientTransform") ?? "");
  if (transform === null) return false;
  const translation = numberPair(transform[1]);
  const scaling = numberPair(transform[2]);
  return translation !== null && scaling !== null && translation[0] === geometry.cx && translation[1] === geometry.cy
    && scaling[0] === geometry.rx && scaling[1] === geometry.ry;
}

/** The three original stops are copied unchanged; reject a missing or malformed template. */
function validStops(gradient: Element): boolean {
  const stops = Array.from(gradient.children);
  if (stops.length !== 3 || stops.some((stop) => stop.nodeName !== "stop")) return false;
  const offsets = stops.map((stop) => stop.hasAttribute("offset") ? numberAttr(stop, "offset") : 0);
  return offsets.every((n) => n !== null && n >= 0 && n <= 1)
    && offsets[0] === 0 && offsets[2] === 1 && offsets[1]! > offsets[0]!
    && stops.every((stop) => !stop.hasAttribute("stop-opacity") || numberAttr(stop, "stop-opacity") !== null);
}

function numberAttr(el: Element, key: string): number | null {
  const text = el.getAttribute(key);
  if (text === null || text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function numberPair(text: string): [number, number] | null {
  const values = text.trim().split(/[\s,]+/).map(Number);
  return values.length === 2 && values.every(Number.isFinite) ? [values[0], values[1]] : null;
}

function availableId(root: Element): string {
  const ids = new Set(Array.from(root.querySelectorAll("[id]"), (el) => el.id));
  if (root.id) ids.add(root.id);
  let id = SHADOW_ID;
  for (let suffix = 1; ids.has(id); suffix++) id = `${SHADOW_ID}-${suffix}`;
  return id;
}

function defsOf(root: Element): Element {
  const existing = Array.from(root.children).find((child) => child.nodeName === "defs");
  if (existing !== undefined) return existing;
  const defs = root.ownerDocument.createElementNS(SVG_NS, "defs");
  root.appendChild(defs);
  return defs;
}
