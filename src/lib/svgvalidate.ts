// svgvalidate.ts — extraction, fail-closed SVG cleanup and renderability checks.
// Preview/save callers use only the canonical sanitized markup (RULE 15/20).

const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_SVG_CHARS = 512_000;
const ELEMENTS = new Set([
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "defs", "clipPath", "mask", "linearGradient", "radialGradient", "stop", "title", "desc", "text", "tspan",
]);
const ATTRIBUTES = new Set([
  "xmlns", "xmlns:xlink", "id", "viewBox", "width", "height", "preserveAspectRatio", "x", "y", "x1", "y1", "x2", "y2",
  "cx", "cy", "r", "rx", "ry", "d", "points", "fill", "fill-rule", "fill-opacity", "stroke", "stroke-width",
  "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity",
  "opacity", "transform", "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform", "clipPathUnits",
  "maskUnits", "maskContentUnits", "clip-path", "mask", "visibility", "display", "aria-label", "role", "vector-effect",
  "href", "xlink:href",
]);
const SHAPES = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text"]);
const TEXT_CONTENT_ELEMENTS = new Set(["title", "desc", "text", "tspan"]);

type SvgCheck =
  | { ok: true; svg: string; title: string; viewBox: string; warnings: string[] }
  | { ok: false; error: string };

export function extractSvgDocuments(text: string): string[] {
  if (text.length > MAX_SVG_CHARS * 10) return [];
  return scanSvgTags(text);
}

interface SvgScanState {
  roots: string[];
  start: number;
  depth: number;
}

function scanSvgTags(text: string): string[] {
  const state: SvgScanState = { roots: [], start: -1, depth: 0 };
  for (const match of text.matchAll(/<\/?svg\b[^>]*>/gi)) consumeSvgTag(text, match, state);
  return state.roots;
}

function consumeSvgTag(text: string, match: RegExpMatchArray, state: SvgScanState): void {
  const tag = match[0];
  if (tag.startsWith("</")) return closeSvgTag(text, match, state);
  if (/\/\s*>$/.test(tag)) return appendSelfClosing(tag, state);
  if (state.depth === 0) state.start = match.index ?? 0;
  state.depth++;
}

function closeSvgTag(text: string, match: RegExpMatchArray, state: SvgScanState): void {
  state.depth = Math.max(0, state.depth - 1);
  if (state.depth !== 0 || state.start < 0) return;
  state.roots.push(text.slice(state.start, (match.index ?? 0) + match[0].length));
  state.start = -1;
}

function appendSelfClosing(tag: string, state: SvgScanState): void {
  if (state.depth === 0) state.roots.push(tag);
}

export function sanitizeSvg(raw: string, expectedTitle: string): SvgCheck {
  if (!isSafeSvgText(raw)) return invalid("SVG is empty, too large, or contains a forbidden document type.");
  const parsed = parseXml(raw);
  if (!parsed) return invalid("SVG is not well-formed XML.");
  return sanitizeRoot(parsed.documentElement, expectedTitle);
}

function isSafeSvgText(raw: string): boolean {
  return raw.length > 0 && raw.length <= MAX_SVG_CHARS && !/<!DOCTYPE|<!ENTITY/i.test(raw);
}

function sanitizeRoot(root: Element, expectedTitle: string): SvgCheck {
  if (!isSvgRoot(root)) return invalid("Response root is not an SVG.");
  const title = rootTitle(root);
  if (title !== expectedTitle) return invalid("SVG <title> must exactly match the source filename.");
  const viewBox = validViewBox(root.getAttribute("viewBox"));
  if (!viewBox) return invalid("SVG needs a positive, four-number viewBox.");
  if (!setDimensions(root, viewBox)) return invalid("SVG width and height must be positive pixel dimensions.");
  const warnings = cleanSvgRoot(root);
  if (!hasVisibleGeometry(root)) return invalid("SVG has no visible icon geometry.");
  return { ok: true, svg: new XMLSerializer().serializeToString(root), title, viewBox, warnings };
}

function isSvgRoot(root: Element): boolean {
  return root.localName === "svg" && (!root.namespaceURI || root.namespaceURI === SVG_NS);
}

function cleanSvgRoot(root: Element): string[] {
  const warnings: string[] = [];
  if (!root.getAttribute("xmlns")) root.setAttribute("xmlns", SVG_NS);
  cleanAttributes(root, warnings);
  cleanChildren(root, warnings);
  return warnings;
}

function parseXml(raw: string): XMLDocument | null {
  try {
    const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
    return doc.querySelector("parsererror") || doc.doctype ? null : doc;
  } catch {
    return null;
  }
}

function rootTitle(root: Element): string {
  const title = Array.from(root.children).find((node) => node.localName === "title");
  return title?.textContent?.trim() ?? "";
}

function validViewBox(value: string | null): string | null {
  if (!value) return null;
  const parts = value.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite) || parts[2] <= 0 || parts[3] <= 0) return null;
  return parts.join(" ");
}

function setDimensions(root: Element, viewBox: string): boolean {
  const [, , width, height] = viewBox.split(" ").map(Number);
  const w = dimension(root.getAttribute("width"), width);
  const h = dimension(root.getAttribute("height"), height);
  if (w === null || h === null) return false;
  root.setAttribute("width", String(w));
  root.setAttribute("height", String(h));
  return true;
}

function dimension(value: string | null, fallback: number): number | null {
  if (value === null || value.trim() === "") return fallback;
  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)(?:px)?$/i);
  const number = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}

function cleanChildren(parent: Element, warnings: string[]): void {
  for (const node of Array.from(parent.childNodes)) cleanChild(parent, node, warnings);
}

function cleanChild(parent: Element, node: Node, warnings: string[]): void {
  if (node.nodeType !== Node.ELEMENT_NODE) return cleanNonElement(parent, node, warnings);
  const child = node as Element;
  if (isUnsupportedSvgChild(child)) return removeUnsupportedChild(parent, child, warnings);
  cleanAttributes(child, warnings);
  cleanChildren(child, warnings);
}

function cleanNonElement(parent: Element, node: Node, warnings: string[]): void {
  if (node.nodeType === Node.COMMENT_NODE || node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
    parent.removeChild(node);
    return;
  }
  if (!isExplanatoryText(node, parent)) return;
  parent.removeChild(node);
  warnings.push("Explanatory text inside the SVG was removed.");
}

function isUnsupportedSvgChild(child: Element): boolean {
  return !ELEMENTS.has(child.localName) || child.localName === "svg";
}

function removeUnsupportedChild(parent: Element, child: Element, warnings: string[]): void {
  parent.removeChild(child);
  warnings.push("Unsupported or nested SVG content was removed.");
}

function isExplanatoryText(node: Node, parent: Element): boolean {
  return node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim())
    && !TEXT_CONTENT_ELEMENTS.has(parent.localName);
}

function cleanAttributes(element: Element, warnings: string[]): void {
  for (const attr of Array.from(element.attributes)) {
    const name = attr.name;
    if (!safeAttribute(name, attr.value)) {
      element.removeAttributeNode(attr);
      warnings.push("Unsafe or unsupported attributes were removed.");
    }
  }
}

function safeAttribute(name: string, value: string): boolean {
  if (name === "xmlns") return value === SVG_NS;
  if (name === "xmlns:xlink") return value === "http://www.w3.org/1999/xlink";
  if (name.toLowerCase().startsWith("on") || !ATTRIBUTES.has(name)) return false;
  if ((name === "href" || name === "xlink:href") && !/^#[\w.-]+$/.test(value)) return false;
  if (/url\s*\(/i.test(value) && !/^url\(\s*#[\w.-]+\s*\)$/i.test(value.trim())) return false;
  return !/(?:javascript:|data:text\/html|https?:\/\/|\/\/)/i.test(value);
}

function hasVisibleGeometry(root: Element): boolean {
  return visibleWithin(root, { opacity: 1, fill: "black", stroke: "none", hidden: false }, false);
}

interface PaintState {
  opacity: number;
  fill: string;
  stroke: string;
  hidden: boolean;
}

function visibleWithin(element: Element, inherited: PaintState, inDefs: boolean): boolean {
  const current = paintState(element, inherited);
  const defs = inDefs || element.localName === "defs";
  if (!defs && SHAPES.has(element.localName) && shapePainted(element, current)) return true;
  return Array.from(element.children).some((child) => visibleWithin(child, current, defs));
}

function paintState(element: Element, parent: PaintState): PaintState {
  const opacity = parent.opacity * numberAttr(element, "opacity", 1) * numberAttr(element, "fill-opacity", 1);
  return {
    opacity, fill: element.getAttribute("fill") ?? parent.fill,
    stroke: element.getAttribute("stroke") ?? parent.stroke,
    hidden: parent.hidden || element.getAttribute("display") === "none" || element.getAttribute("visibility") === "hidden",
  };
}

function shapePainted(element: Element, paint: PaintState): boolean {
  if (paint.hidden || paint.opacity <= 0) return false;
  const fillable = !["line", "polyline"].includes(element.localName);
  const hasFill = fillable && paint.fill !== "none" && paint.fill !== "transparent";
  const hasStroke = paint.stroke !== "none" && numberAttr(element, "stroke-width", 1) > 0
    && numberAttr(element, "stroke-opacity", 1) > 0;
  return hasFill || hasStroke;
}

function numberAttr(element: Element, name: string, fallback: number): number {
  const raw = element.getAttribute(name);
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export async function renderedSvgHasInk(svg: string): Promise<boolean> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = await loadSvgImage(url);
    return samplePixels(image);
  } catch {
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadSvgImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("SVG image decode failed"));
    image.src = url;
    if (typeof image.decode === "function") image.decode().then(() => resolve(image)).catch(reject);
  });
}

function samplePixels(image: HTMLImageElement): boolean {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) return true;
  return false;
}

export function distinctIconWarning(expected: number, svgs: string[]): string | null {
  const distinct = new Set(svgs.map(iconGeometryKey)).size;
  return expected === distinct && svgs.length === expected
    ? null : `Could not identify ${expected} distinct valid SVG icon${expected === 1 ? "" : "s"}; found ${distinct} distinct output${distinct === 1 ? "" : "s"}.`;
}

function iconGeometryKey(svg: string): string {
  return svg.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<desc\b[^>]*>[\s\S]*?<\/desc>/gi, "").replace(/\s+/g, "").trim();
}

function invalid(error: string): SvgCheck {
  return { ok: false, error };
}
