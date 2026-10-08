// svgclean.ts — the mandatory clean boundary for the upload SVG copy
// (design §3.2). Owns root/version/viewBox normalization, editor-noise removal,
// and fail-closed checks for raster content or ID-dependent appearance.

import { parseSvgLength } from "./geom";

const SVG_NS = "http://www.w3.org/2000/svg";
const EDITOR_PREFIXES = ["inkscape", "sodipodi", "adobe", "illustrator", "rdf", "cc", "dc"];
const SOURCE_METADATA = ["title", "desc", "description", "metadata", "namedview"];
const RASTER_DATA = /data:image\/(?:png|jpe?g|gif|webp|bmp|tiff?|avif)(?:[;,])/i;
const LOCAL_URL = /url\(\s*(['"]?)#([^'"\s)]+)\1\s*\)/gi;

export class SvgCleanError extends Error {
  constructor(message: string) {
    super(`SVG cleanup: ${message}`);
    this.name = "SvgCleanError";
  }
}

/** The export copy with SVG 1.1 root metadata and editor noise normalized. */
export function cleanExportSvg(svgText: string): string {
  const doc = parseDocument(svgText);
  const root = doc.documentElement;
  if (root.localName.toLowerCase() !== "svg") throw new SvgCleanError("the document root is not <svg>");
  rejectRasterContent(root);
  rejectLocalReferences(root);
  const viewBox = positiveViewBox(root);
  removeComments(doc);
  cleanElements(root);
  normalizeRoot(root, viewBox);
  return new XMLSerializer().serializeToString(doc);
}

function parseDocument(svgText: string): Document {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (doc.querySelector("parsererror") !== null || doc.documentElement.localName.toLowerCase() === "parsererror") {
    throw new SvgCleanError("the source is not well-formed XML");
  }
  return doc;
}

interface ViewBox { text: string; width: number; height: number }

function positiveViewBox(root: Element): ViewBox {
  const fromViewBox = parseViewBox(root.getAttribute("viewBox"));
  if (fromViewBox !== null) return fromViewBox;
  const fromDimensions = dimensionsViewBox(root);
  if (fromDimensions !== null) return fromDimensions;
  throw new SvgCleanError("a positive four-number viewBox is required");
}

function parseViewBox(raw: string | null): ViewBox | null {
  if (raw === null || raw.trim() === "") return null;
  const values = raw.trim().split(/[\s,]+/).map(Number);
  if (values.length !== 4 || values.some((n) => !Number.isFinite(n)) || values[2] <= 0 || values[3] <= 0) return null;
  return { text: values.map(viewBoxNumber).join(" "), width: values[2], height: values[3] };
}

function dimensionsViewBox(root: Element): ViewBox | null {
  const width = parseSvgLength(root.getAttribute("width"));
  const height = parseSvgLength(root.getAttribute("height"));
  if (width === null || height === null || width <= 0 || height <= 0) return null;
  return { text: `0 0 ${viewBoxNumber(width)} ${viewBoxNumber(height)}`, width, height };
}

function viewBoxNumber(n: number): string {
  return Object.is(n, -0) ? "0" : String(n);
}

function rejectRasterContent(root: Element): void {
  for (const element of allElements(root)) {
    if (["image", "img"].includes(element.localName.toLowerCase())) {
      throw new SvgCleanError("raster/image content is not supported");
    }
    if (element.localName.toLowerCase() === "style" && RASTER_DATA.test(element.textContent ?? "")) {
      throw new SvgCleanError("embedded raster image data is not supported");
    }
    for (const attr of Array.from(element.attributes)) {
      if (RASTER_DATA.test(attr.value)) throw new SvgCleanError("embedded raster image data is not supported");
    }
  }
}

function rejectLocalReferences(root: Element): void {
  const elements = allElements(root);
  const ids = new Set(elements.map((el) => el.getAttribute("id")).filter((id): id is string => id !== null && id !== ""));
  const classes = new Set(elements.flatMap((el) => (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean)));
  for (const element of elements) rejectElementReferences(element, ids, classes);
}

function rejectElementReferences(element: Element, ids: Set<string>, classes: Set<string>): void {
  for (const attr of Array.from(element.attributes)) {
    const id = referencedId(attr.name.toLowerCase(), attr.value);
    if (id !== null) throw new SvgCleanError(`local ID reference "#${id}" cannot be removed safely`);
  }
  if (element.localName.toLowerCase() !== "style") return;
  const id = selectorReference(element.textContent ?? "", ids, /#([A-Za-z_][\w:.-]*)/g);
  if (id !== null) throw new SvgCleanError(`CSS selector references local ID "#${id}"`);
  const className = selectorReference(element.textContent ?? "", classes, /\.([A-Za-z_][\w-]*)/g);
  if (className !== null) throw new SvgCleanError(`CSS selector depends on class ".${className}"`);
}

function referencedId(name: string, value: string): string | null {
  if (name === "href" || name.endsWith(":href")) {
    const href = /^\s*#([^\s]+)\s*$/.exec(value);
    if (href !== null) return href[1];
  }
  const match = LOCAL_URL.exec(value);
  LOCAL_URL.lastIndex = 0;
  return match?.[2] ?? null;
}

function selectorReference(css: string, names: Set<string>, pattern: RegExp): string | null {
  for (const match of css.matchAll(pattern)) {
    if (names.has(match[1])) return match[1];
  }
  return null;
}

function cleanElements(parent: Element): void {
  for (const child of Array.from(parent.children)) {
    if (shouldRemoveElement(child)) parent.removeChild(child);
    else {
      cleanAttributes(child);
      cleanElements(child);
    }
  }
  cleanAttributes(parent);
}

function shouldRemoveElement(element: Element): boolean {
  return SOURCE_METADATA.includes(element.localName.toLowerCase()) || isEditorElement(element);
}

function isEditorElement(element: Element): boolean {
  const prefix = element.prefix?.toLowerCase() ?? "";
  const namespace = (element.namespaceURI ?? "").toLowerCase();
  return isEditorPrefix(prefix) || EDITOR_PREFIXES.some((name) => namespace.includes(name));
}

function cleanAttributes(element: Element): void {
  for (const attr of Array.from(element.attributes)) {
    if (isNoiseAttribute(attr)) element.removeAttributeNode(attr);
  }
}

const NOISE_ATTRIBUTES = ["id", "class", "name", "label", "title", "data-name", "data-layer"];

function isNoiseAttribute(attr: Attr): boolean {
  const name = attr.name.toLowerCase();
  return NOISE_ATTRIBUTES.includes(name) || isDataOrAriaAttribute(name) || isNoiseNamespace(attr, name);
}

function isDataOrAriaAttribute(name: string): boolean {
  return name.startsWith("data-") || name.startsWith("aria-");
}

function isNoiseNamespace(attr: Attr, name: string): boolean {
  if (name.startsWith("xmlns:")) return name !== "xmlns:xlink";
  const colon = name.indexOf(":");
  const prefix = colon >= 0 ? name.slice(0, colon) : attr.prefix?.toLowerCase() ?? "";
  return isEditorPrefix(prefix) || (prefix !== "" && prefix !== "xml" && prefix !== "xlink");
}

function isEditorPrefix(prefix: string): boolean {
  return EDITOR_PREFIXES.includes(prefix);
}

function removeComments(node: Node): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.COMMENT_NODE) node.removeChild(child);
    else removeComments(child);
  }
}

function normalizeRoot(root: Element, viewBox: ViewBox): void {
  root.setAttribute("xmlns", SVG_NS);
  root.setAttribute("version", "1.1");
  root.setAttribute("viewBox", viewBox.text);
  root.setAttribute("preserveAspectRatio", "xMidYMid meet");
}

function allElements(root: Element): Element[] {
  return [root, ...Array.from(root.querySelectorAll("*"))];
}
