// place.ts — what a cell may draw (design §5.3). The builder places artwork it did
// not generate in this tab, so the safety rule is the app's own: nothing with a
// script, an event handler or a remote reference is drawn (lib/svgvalidate's
// blocklist). Here that rule is applied to the PLACEMENT: a document that would
// have to be sanitised is still refused if anything structural is wrong, and a
// document that is merely dirty is cleaned and drawn.
//
// Pure over strings except for one DOMParser call, so this module is tests-only
// DOM: it lives in lib (shared with the serializer) but is never imported by a
// node-side timer or a worker.

export const PLACE_REFUSALS = ["empty", "not-markup", "not-xml", "not-svg", "unsafe", "unsupported"] as const;

export type PlaceRefusalKind = (typeof PLACE_REFUSALS)[number];

export interface PlacedIcon {
  ok: true;
  /** The viewBox the artwork declares ("0 0 24 24"), or "" when it had none. */
  box: string;
  /** The cleaned root markup — one <svg>, no prolog, no scripts, no remote refs. */
  markup: string;
}

export interface PlaceRefusal {
  ok: false;
  kind: PlaceRefusalKind;
  reason: string;
}

export type PlaceResult = PlacedIcon | PlaceRefusal;

const ALLOWED_ROOT = /^<svg[\s/>]/i;

/**
 * An approved SVG's text → what one cell may draw, or the reason it may not.
 * A dirty-but-well-formed document is cleaned; a broken or unexpected one is
 * refused with a kind a caller can act on (design §5.3 refusals).
 */
export function placeIcon(code: string): PlaceResult {
  const text = code.trim();
  if (text === "") return refuse("empty", "the file is empty");
  if (!text.startsWith("<")) return refuse("not-markup", "the file does not contain SVG markup");
  const parsed = new DOMParser().parseFromString(text, "image/svg+xml");
  if (parsed.getElementsByTagName("parsererror").length > 0) return refuse("not-xml", "the file is not well-formed XML");
  const root = parsed.documentElement;
  if (root.nodeName.toLowerCase() !== "svg") return refuse("not-svg", `the root element is <${root.nodeName}>, not <svg>`);
  const unsupported = unsupportedFinding(parsed);
  if (unsupported !== null) return refuse("unsupported", unsupported);
  return { ok: true, box: boxOf(root), markup: cleanMarkup(parsed, root) };
}

function refuse(kind: PlaceRefusalKind, reason: string): PlaceRefusal {
  return { ok: false, kind, reason };
}

/**
 * Structures a sheet cannot honour: a foreignObject draws HTML the serializer
 * cannot reproduce, and a nested <svg> with its own box would need measuring.
 */
function unsupportedFinding(doc: Document): string | null {
  if (doc.getElementsByTagName("foreignObject").length > 0) return "the file embeds HTML (foreignObject)";
  const nested = Array.from(doc.getElementsByTagName("svg")).filter((el) => el !== (doc.documentElement as Element));
  if (nested.length > 0) return "the file nests another <svg> inside it";
  return null;
}

/** The artwork's own box: its viewBox, else its width/height, else "" (unknown). */
function boxOf(root: Element): string {
  const box = (root.getAttribute("viewBox") ?? "").trim();
  if (box !== "") return box;
  const w = (root.getAttribute("width") ?? "").trim();
  const h = (root.getAttribute("height") ?? "").trim();
  return w !== "" && h !== "" ? `0 0 ${w} ${h}` : "";
}

/** The root's own markup with the app's blocklist stripped and attributes tidied. */
function cleanMarkup(doc: Document, root: Element): string {
  for (const tag of ["script", "handler", "listener"]) {
    for (const el of Array.from(doc.getElementsByTagName(tag))) el.remove();
  }
  for (const el of Array.from(doc.getElementsByTagName("*"))) scrubAttributes(el);
  const serializer = new XMLSerializer();
  return serializer.serializeToString(root);
}

/** Removes event handlers and remote references; those are never drawn. */
function scrubAttributes(el: Element): void {
  for (const attr of Array.from(el.attributes)) scrubAttribute(el, attr);
}

function scrubAttribute(el: Element, attr: Attr): void {
  const name = attr.name.toLowerCase();
  if (name.startsWith("on")) el.removeAttribute(attr.name);
  else if (isRemoteAttr(name, attr.value.trim().toLowerCase())) el.removeAttribute(attr.name);
}

/** An href/src that is not a same-document fragment or an inline data image. */
function isRemoteAttr(name: string, value: string): boolean {
  const link = name === "href" || name === "xlink:href" || name === "src";
  return link && value !== "" && !value.startsWith("#") && !value.startsWith("data:image/");
}

/** What the sheet paints the artwork with (design §4.1 `icons`). */
export interface Paint {
  stroke: string;
  strokeWidth: number;
}

/**
 * The cell's wrapper: the artwork scaled into a square box, never spilling out.
 *
 * With a `paint`, the wrapper declares the sheet's stroke and the artwork's own
 * stroke/fill declarations are removed — CSS `!important` in the wrapper wins over
 * a presentation attribute on a child, so the file cannot repaint itself anyway;
 * removing its own attributes as well means the export (which has no CSS) matches
 * the screen. Without a `paint` the artwork keeps its own colours.
 */
export function fittedSvg(placed: PlacedIcon, size: number, paint?: Paint): string {
  const box = placed.box === "" ? `0 0 ${size} ${size}` : placed.box;
  const style = paint === undefined ? "" : ` stroke="${escapeAttr(paint.stroke)}" stroke-width="${paint.strokeWidth}"`;
  const inner = paint === undefined ? innerOf(placed.markup) : strippedOf(innerOf(placed.markup));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${escapeAttr(box)}"${style}>${inner}</svg>`;
}

/** The artwork with its own stroke/fill presentation attributes removed. */
function strippedOf(inner: string): string {
  return inner
    .replace(/\s(?:stroke|fill)="[^"]*"/gi, "")
    .replace(/\sstyle="[^"]*"/gi, "");
}

/** The children of a one-root <svg> string — the artwork without its own wrapper. */
function innerOf(markup: string): string {
  if (!ALLOWED_ROOT.test(markup)) return "";
  const open = markup.indexOf(">");
  if (open < 0) return "";
  const selfClosing = markup.slice(0, open).trimEnd().endsWith("/");
  if (selfClosing) return "";
  const close = markup.lastIndexOf("</svg>");
  return close < 0 ? "" : markup.slice(open + 1, close);
}

/** Quotes inside an attribute value would break the wrapper. */
function escapeAttr(value: string): string {
  return value.replace(/"/g, "&quot;");
}
