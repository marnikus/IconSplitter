// svgpreview.ts — turning a saved SVG into a safe, fitted inline preview.
// Owns the pipeline the panel used to skip: parse the saved text, repair the
// namespace a strict XML parser rejects, strip everything that can execute or
// fetch, give the document a box it can be fitted into, and hand back markup
// that is rendered inline. Nothing here writes: the saved SVG is only ever
// read, and the copy shown in the panel is the thing that is changed.
//
// Defects this file exists for (docs/archive/2026-10-01-svg-preview-rendering):
// a document without xmlns, or with an XML prolog, copied as valid code and
// painted nothing; a document with no intrinsic size painted off-centre. The
// preview never recolours the artwork: `currentColor` resolves exactly as it
// does in a standalone document (the UA default), and a dark frame is answered
// by the frame's contrast outline, never by a different ink.

export interface SvgPreview {
  ok: boolean;
  /** Sanitized, size-normalized `<svg …>…</svg>`; "" when the preview failed. */
  html: string;
  viewBox: string;
  /** width / height of the box — the frame uses it to fit without distortion. */
  ratio: number;
  error: string | null;
}

/**
 * `currentColor` in a standalone SVG document resolves to the UA default —
 * black. The preview paints it that way so the artwork keeps the colours it
 * was saved with: the app never recolours a document (prompt §"the app does
 * not change lines or any colour inside the SVG"). Visibility on a dark frame
 * is the frame's contrast outline, not a different ink.
 */
export const PREVIEW_INK = "#000000";

/** Scoped to the preview's shadow root, so it cannot style the app. */
export const PREVIEW_CSS = "<style>"
  + ":host{display:block}"
  + "svg{display:block;width:100%;height:100%;overflow:hidden"
  + `;color:${PREVIEW_INK}}`
  + "</style>";

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const UNSAFE_TAGS = [
  "script", "handler", "listener", "foreignobject", "iframe", "embed", "object",
  "audio", "video", "set", "animate", "animatetransform", "animatemotion", "mpath",
];
const URL_ATTRS = ["href", "xlink:href", "src"];
const LOCAL_REF = /^(#|data:image\/)/i;
const REMOTE_URL = /url\(\s*['"]?(?!#)/i;
const WIDTH_HEIGHT = /^\s*(width|height)\s*:/i;

/** The one entry point: saved SVG text in, displayable markup out. */
export function buildSvgPreview(code: string | null): SvgPreview {
  const parsed = parseDocument(code);
  if (parsed.doc === null) return failed(parsed.error ?? "no SVG to preview");
  const root = parsed.doc.documentElement;
  const box = fitBox(root);
  if (box === null) return failed("no viewBox and no usable width/height");
  sanitize(root);
  scopeIds(root, idPrefix(code ?? ""));
  return {
    ok: true,
    // The root element alone: a prolog or doctype is not markup to inline.
    html: new XMLSerializer().serializeToString(root),
    viewBox: box.viewBox,
    ratio: box.ratio,
    error: null,
  };
}

function failed(error: string): SvgPreview {
  return { ok: false, html: "", viewBox: "", ratio: 1, error };
}

interface ParsedDoc {
  doc: Document | null;
  error: string | null;
}

/** Parses the text as saved; one repair pass when a strict parser refuses it. */
function parseDocument(code: string | null): ParsedDoc {
  if (code === null || code.trim() === "") return { doc: null, error: "no SVG to preview" };
  const direct = parseXml(code);
  if (direct.doc !== null) return direct;
  const repaired = parseXml(ensureNamespaces(code));
  return repaired.doc !== null ? repaired : { doc: null, error: direct.error };
}

function parseXml(code: string): ParsedDoc {
  if (!/<svg\b/i.test(code)) return { doc: null, error: "no SVG markup found" };
  const doc = new DOMParser().parseFromString(code, "image/svg+xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return { doc: null, error: "not well-formed XML" };
  return name(doc.documentElement) === "svg"
    ? { doc, error: null }
    : { doc: null, error: "root element is not <svg>" };
}

/** Declares the namespaces an unbound-prefix document is missing. */
function ensureNamespaces(code: string): string {
  const at = code.search(/<svg\b/i);
  const end = at < 0 ? -1 : code.indexOf(">", at);
  if (end < 0) return code;
  const tag = code.slice(at, end);
  const add = `${nsAttr(tag, "xmlns", SVG_NS)}${nsAttr(tag, "xmlns:xlink", XLINK_NS)}`;
  return `${code.slice(0, end)} ${add}${code.slice(end)}`;
}

function nsAttr(tag: string, name: string, value: string): string {
  return new RegExp(`${name}\\s*=`, "i").test(tag) ? "" : `${name}="${value}" `;
}

interface Box {
  viewBox: string;
  ratio: number;
}

/**
 * Fixes the one thing that makes a preview fit: an explicit viewBox, derived
 * from the declared box or from px width/height, plus a 100% frame and
 * `xMidYMid meet` so the artwork scales uniformly (strokes keep their weight),
 * fits the frame and is centred on both axes.
 */
function fitBox(root: Element): Box | null {
  const declared = root.getAttribute("viewBox");
  const size = declared ? boxSize(declared) : sizePair(root);
  if (size === null) return null;
  const [width, height] = size;
  const viewBox = declared ? declared.trim().replace(/\s+/g, " ") : `0 0 ${width} ${height}`;
  root.setAttribute("xmlns", SVG_NS);
  if (usesXlink(root)) root.setAttribute("xmlns:xlink", XLINK_NS);
  root.setAttribute("viewBox", viewBox);
  root.setAttribute("width", "100%");
  root.setAttribute("height", "100%");
  root.setAttribute("preserveAspectRatio", "xMidYMid meet");
  root.setAttribute("style", fittedStyle(root.getAttribute("style")));
  return { viewBox, ratio: width / height };
}

function boxSize(viewBox: string): [number, number] | null {
  const parts = viewBox.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return parts[2] > 0 && parts[3] > 0 ? [parts[2], parts[3]] : null;
}

function sizePair(root: Element): [number, number] | null {
  const width = pxLength(root.getAttribute("width"));
  const height = pxLength(root.getAttribute("height"));
  return width === null || height === null ? null : [width, height];
}

/** Only a plain number or a px length is an intrinsic size — "%" is not. */
function pxLength(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value.replace(/px$/i, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function usesXlink(root: Element): boolean {
  return elementsOf(root).some((el) =>
    Array.from(el.attributes).some((attr) => attr.name.toLowerCase().startsWith("xlink:")));
}

/** Keeps the author's declarations, minus any that would fight the fit. */
function fittedStyle(style: string | null): string {
  const kept = (style ?? "").split(";").filter((decl) => decl.trim() !== "" && !WIDTH_HEIGHT.test(decl));
  // No colour is added here: whatever the document declares is what it is
  // painted with, and the default lives in the shadow root's stylesheet.
  return [...kept, "display:block"].join(";");
}

/** Removes what can execute, fetch from the network, or escape the SVG. */
function sanitize(root: Element): void {
  for (const el of elementsOf(root)) {
    if (UNSAFE_TAGS.includes(name(el))) el.remove();
    else if (name(el) === "style" && !safeCss(el.textContent ?? "")) el.remove();
    else cleanAttributes(el);
  }
}

/** A stylesheet may style the artwork, but never import or fetch (RULE 20). */
function safeCss(css: string): boolean {
  if (css.includes("@") || css.includes("<")) return false;
  return !REMOTE_URL.test(css);
}

function cleanAttributes(el: Element): void {
  for (const attr of Array.from(el.attributes)) {
    const value = attr.value.trim();
    const drop = attr.name.toLowerCase().startsWith("on")
      || value.toLowerCase().startsWith("javascript:")
      || (URL_ATTRS.includes(attr.name.toLowerCase()) && !LOCAL_REF.test(value));
    if (drop) el.removeAttribute(attr.name);
  }
}

/** Ids are per-document: two rows on screen must never share a definition. */
function scopeIds(root: Element, prefix: string): void {
  const scoped = idMap(elementsOf(root), prefix);
  if (scoped.size === 0) return;
  for (const el of elementsOf(root)) {
    const id = el.getAttribute("id");
    if (id !== null && scoped.has(id)) el.setAttribute("id", scoped.get(id) as string);
    for (const attr of Array.from(el.attributes)) el.setAttribute(attr.name, remapValue(attr.value, scoped));
    if (name(el) === "style") el.textContent = remapCss(el.textContent ?? "", scoped);
  }
}

function idPrefix(code: string): string {
  let hash = 2166136261;
  for (let i = 0; i < code.length; i += 1) hash = Math.imul(hash ^ code.charCodeAt(i), 16777619);
  return `sp${(hash >>> 0).toString(36)}-`;
}

function idMap(elements: Element[], prefix: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const el of elements) {
    const id = el.getAttribute("id");
    if (id !== null && id !== "" && !map.has(id)) map.set(id, `${prefix}${id}`);
  }
  return map;
}

function remapValue(value: string, scoped: Map<string, string>): string {
  return value
    .replace(/url\(\s*['"]?#([\w:.-]+)['"]?\s*\)/g, (all, id) => swap(all, id, scoped))
    .replace(/^#([\w:.-]+)$/, (all, id) => swap(all, id, scoped));
}

function swap(text: string, id: string, scoped: Map<string, string>): string {
  const to = scoped.get(id);
  return to === undefined ? text : text.replace(`#${id}`, `#${to}`);
}

/** Only ids actually present are rewritten, so a hex colour is never touched. */
function remapCss(css: string, scoped: Map<string, string>): string {
  let out = css;
  for (const [id, to] of scoped) out = out.replace(new RegExp(`#${escapeRe(id)}\\b`, "g"), `#${to}`);
  return out;
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function elementsOf(root: Element): Element[] {
  return Array.from(root.ownerDocument.getElementsByTagName("*"));
}

function name(el: Element): string {
  return el.nodeName.toLowerCase();
}
