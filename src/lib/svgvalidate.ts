// svgvalidate.ts — SVG validation and security gate (prompt §10).
// Owns: XML well-formedness, one root <svg>, usable dimensions, the unsafe-
// content blocklist (scripts, event handlers, external URLs, executable
// content) and the "is there anything to draw" check. Nothing reaches a preview
// or the disk without passing here (RULE 15).
//
// DOMParser is the browser XML parser; happy-dom provides it in tests, so the
// real parser is exercised rather than a regex stand-in (RULE 8).

export interface SvgValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface ParsedSvg {
  doc: Document | null;
  errors: string[];
}

const UNSAFE_TAGS = ["script", "foreignobject", "handler", "listener"];
const DRAWABLE = ["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "use", "image"];
const URL_ATTRS = ["href", "xlink:href", "src"];

/** Parses the text as XML; a parsererror element means the payload is broken. */
export function parseSvg(code: string): ParsedSvg {
  const text = code.trim();
  if (text === "") return { doc: null, errors: ["empty response"] };
  if (!text.startsWith("<")) return { doc: null, errors: ["no SVG markup found"] };
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    return { doc: null, errors: ["not well-formed XML"] };
  }
  return { doc, errors: [] };
}

/** Full gate: parse, structure, dimensions, safety, renderability. */
export function validateSvg(code: string): SvgValidation {
  const { doc, errors } = parseSvg(code);
  if (!doc) return { ok: false, errors, warnings: [] };
  const root = doc.documentElement;
  const problems = [...errors];
  const warnings: string[] = [];
  if (root.nodeName.toLowerCase() !== "svg") problems.push("root element is not <svg>");
  if (doc.getElementsByTagName("svg").length > 1) problems.push("more than one <svg> root");
  problems.push(...unsafeFindings(doc));
  if (!hasDimensions(root)) problems.push("no viewBox and no usable width/height");
  if (!hasGeometry(doc)) problems.push("no renderable paths or shapes");
  if (hasProse(doc)) warnings.push("text outside <title>/<desc>/<text> was ignored");
  return { ok: problems.length === 0, errors: problems, warnings };
}

function unsafeFindings(doc: Document): string[] {
  const out: string[] = [];
  for (const tag of UNSAFE_TAGS) {
    if (doc.getElementsByTagName(tag).length > 0) out.push(`unsafe <${tag}> element`);
  }
  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    out.push(...attrFindings(el));
  }
  return out;
}

function attrFindings(el: Element): string[] {
  const out: string[] = [];
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    const value = attr.value.trim().toLowerCase();
    if (name.startsWith("on")) out.push(`event handler attribute "${attr.name}"`);
    else if (value.startsWith("javascript:")) out.push(`javascript: URL in "${attr.name}"`);
    else if (URL_ATTRS.includes(name) && isRemote(value)) out.push(`external URL in "${attr.name}"`);
  }
  return out;
}

/** Anything but a same-document fragment reference counts as remote. */
function isRemote(value: string): boolean {
  if (value === "") return false;
  return !value.startsWith("#") && !value.startsWith("data:image/");
}

function hasDimensions(root: Element): boolean {
  const box = root.getAttribute("viewBox");
  if (box && /-?\d+(\.\d+)?\s+[-\d.\s]+/.test(box.trim())) return true;
  return positive(root.getAttribute("width")) && positive(root.getAttribute("height"));
}

function positive(value: string | null): boolean {
  const n = Number(value);
  return value !== null && value.trim() !== "" && Number.isFinite(n) && n > 0;
}

function hasGeometry(doc: Document): boolean {
  return DRAWABLE.some((tag) => doc.getElementsByTagName(tag).length > 0);
}

/** Free text at the root level is a sign the model answered with prose. */
function hasProse(doc: Document): boolean {
  const root = doc.documentElement;
  const kids = Array.from(root.childNodes);
  return kids.some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "");
}

/** Data URL for an <img> preview — scripts inside never execute there. */
export function svgDataUrl(code: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(code)}`;
}
