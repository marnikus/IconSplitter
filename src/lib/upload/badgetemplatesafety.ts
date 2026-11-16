// User SVG is inert data until this allowlist and the shared vector pipeline approve it.
import { INLINE_PROPS } from "./cleandom";
import { foldBadgeStylesheets } from "./badgestyles";
import { styleMap } from "./geom/stroke";

export const BADGE_SVG_NS = "http://www.w3.org/2000/svg";
const TAGS = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "defs", "linearGradient", "radialGradient", "stop", "title", "desc", "style"]);
const STYLE_PROPS = new Set([...INLINE_PROPS, "stop-color", "stop-opacity"]);
const ATTRS = new Set([...STYLE_PROPS, "id", "class", "style", "viewBox", "version", "xmlns", "xmlns:xlink",
  "width", "height", "x", "y", "rx", "ry", "cx", "cy", "r", "x1", "y1", "x2", "y2", "points", "d",
  "transform", "gradientTransform", "gradientUnits", "spreadMethod", "fx", "fy", "fr", "offset", "href", "xlink:href"]);

/** Reject whole unsupported documents, rather than stripping a part of the user's design. */
export function templateSafetyError(root: Element): string | null {
  const elements = [root, ...Array.from(root.querySelectorAll("*"))];
  if (elements.length > 2000) return "The SVG exceeds the 2000-element limit.";
  const ids = new Set<string>();
  for (const el of elements) {
    if (el.id !== "" && ids.has(el.id)) return "Duplicate SVG IDs are not supported.";
    if (el.id !== "") ids.add(el.id);
    const error = elementError(el, root) ?? attributesError(el);
    if (error !== null) return error;
  }
  const error = foldBadgeStylesheets(root);
  if (error !== null) return error;
  for (const el of elements) foldInlinePaint(el);
  return null;
}

function elementError(el: Element, root: Element): string | null {
  if (!TAGS.has(el.nodeName)) return `Unsupported <${el.nodeName}>; use outlined vector shapes, not text, images or effects.`;
  if (el !== root && el.nodeName === "svg") return "Nested SVG viewports are unsupported; use groups instead.";
  if (el.namespaceURI !== BADGE_SVG_NS) return "Only the SVG namespace is supported.";
  let depth = 0;
  for (let parent = el.parentElement; parent !== null; parent = parent.parentElement) depth++;
  return depth > 32 ? "The SVG exceeds the 32-level nesting limit." : null;
}

function attributesError(el: Element): string | null {
  for (const attr of Array.from(el.attributes)) {
    if (!ATTRS.has(attr.name)) return `Unsupported or unsafe attribute: ${attr.name}.`;
    const error = referenceError(attr.name, attr.value) ?? namespaceError(attr.name, attr.value);
    if (error !== null) return error;
  }
  return inlineStyleError(el);
}

function namespaceError(name: string, value: string): string | null {
  if (name === "xmlns" && value !== BADGE_SVG_NS) return "Only the SVG namespace is supported.";
  if (name === "xmlns:xlink" && value !== "http://www.w3.org/1999/xlink") return "Invalid link namespace.";
  return null;
}

function referenceError(name: string, value: string): string | null {
  if (["href", "xlink:href"].includes(name) && !/^#[A-Za-z_][\w.-]*$/.test(value)) return "External references are not allowed.";
  if (/url\s*\(/i.test(value) && name !== "style" && !/^url\(#[A-Za-z_][\w.-]*\)$/.test(value)) {
    return "Only local url(#id) paint references are supported.";
  }
  return null;
}

/** Fold only known paint properties, including gradient stops, before any rendering. */
function inlineStyleError(el: Element): string | null {
  const raw = el.getAttribute("style");
  if (raw === null) return null;
  if (/[\\@{}]/.test(raw)) return "Unsupported inline CSS; use SVG paint attributes.";
  for (const [name, value] of Object.entries(styleMap(raw))) {
    if (!STYLE_PROPS.has(name)) return `Unsupported inline style: ${name}.`;
    const error = referenceError(name, value);
    if (error !== null) return error;
  }
  return null;
}

/** Inline declarations outrank stylesheets; folding them early would reverse that cascade. */
function foldInlinePaint(el: Element): void {
  for (const [name, value] of Object.entries(styleMap(el.getAttribute("style")))) el.setAttribute(name, value);
  el.removeAttribute("style");
}
