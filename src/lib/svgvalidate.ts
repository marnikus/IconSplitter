// svgvalidate.ts — SVG validation and security gate (prompt §10).
// Owns: XML well-formedness, one root <svg>, usable dimensions, the unsafe-
// content blocklist (scripts, event handlers, external URLs, executable
// content) and the "is there anything to draw" check. Nothing reaches a preview
// or the disk without passing here (RULE 15).
//
// DOMParser is the browser XML parser; happy-dom provides it in tests, so the
// real parser is exercised rather than a regex stand-in (RULE 8).

import { fnv1a32 } from "./pairing";

export interface SvgValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface ParsedSvg {
  doc: Document | null;
  errors: string[];
}

interface CachedValidation {
  verdict: SvgValidation;
  source?: string;
  root?: Element;
}

const UNSAFE_SET = new Set(["script", "foreignobject", "handler", "listener"]);
const DRAWABLE_SET = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "use", "image"]);
const URL_ATTRS = ["href", "xlink:href", "src"];
const VALIDATED = new Map<string, CachedValidation>();
const VALIDATED_MAX = 4096;
let sharedParser: DOMParser | null = null;

function cloneValidation(v: SvgValidation): SvgValidation {
  return { ok: v.ok, errors: [...v.errors], warnings: [...v.warnings] };
}

function validationCacheKey(code: string): string {
  return `${code.length}\u0000${fnv1a32(code)}`;
}

function rememberValidation(key: string, entry: CachedValidation): void {
  if (VALIDATED.size >= VALIDATED_MAX) VALIDATED.delete(VALIDATED.keys().next().value as string);
  VALIDATED.set(key, entry);
}

/** Returns the cached `<svg>` root element when `code` already passed `validateSvg` verbatim, or null. */
export function getCachedValidatedRoot(code: string): Element | null {
  const hit = VALIDATED.get(validationCacheKey(code));
  return hit !== undefined && hit.verdict.ok && hit.source === code && hit.root !== undefined ? hit.root : null;
}

/** Parses the text as XML; a parsererror element means the payload is broken. */
export function parseSvg(code: string): ParsedSvg {
  const text = code.trim();
  if (text === "") return { doc: null, errors: ["empty response"] };
  if (!text.startsWith("<")) return { doc: null, errors: ["no SVG markup found"] };
  const parser = sharedParser ?? (sharedParser = new DOMParser());
  const doc = parser.parseFromString(text, "image/svg+xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    return { doc: null, errors: ["not well-formed XML"] };
  }
  return { doc, errors: [] };
}

interface WalkScan {
  svgCount: number;
  hasDrawable: boolean;
  unsafeTags: Set<string>;
  findings: string[];
}

function scanDocumentTree(root: Element): WalkScan {
  const scan: WalkScan = { svgCount: 0, hasDrawable: false, unsafeTags: new Set(), findings: [] };
  const stack: Element[] = [root];
  while (stack.length > 0) {
    const el = stack.pop()!;
    const tag = el.nodeName.toLowerCase();
    if (tag === "svg") scan.svgCount += 1;
    if (DRAWABLE_SET.has(tag)) scan.hasDrawable = true;
    if (UNSAFE_SET.has(tag)) scan.unsafeTags.add(tag);
    if (el.attributes.length > 0) attrFindingsInto(el, scan.findings);
    for (let c = el.lastElementChild; c !== null; c = c.previousElementSibling) stack.push(c);
  }
  return scan;
}

function buildSvgVerdict(root: Element): SvgValidation {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (root.nodeName.toLowerCase() !== "svg") problems.push("root element is not <svg>");
  const scan = scanDocumentTree(root);
  if (scan.svgCount > 1) problems.push("more than one <svg> root");
  for (const tag of UNSAFE_SET) if (scan.unsafeTags.has(tag)) problems.push(`unsafe <${tag}> element`);
  problems.push(...scan.findings);
  if (!hasDimensions(root)) problems.push("no viewBox and no usable width/height");
  if (!scan.hasDrawable) problems.push("no renderable paths or shapes");
  if (hasElementProse(root)) warnings.push("text outside <title>/<desc>/<text> was ignored");
  return { ok: problems.length === 0, errors: problems, warnings };
}

/** Validates a standalone `<svg>` root element in one tree walk and records it in the validation cache. */
export function validateSvgElement(root: Element, codeForCache?: string, cacheImmutableRoot = false): SvgValidation {
  const key = codeForCache === undefined ? undefined : validationCacheKey(codeForCache);
  if (key !== undefined) {
    const hit = VALIDATED.get(key);
    if (hit !== undefined && hit.source === codeForCache) return cloneValidation(hit.verdict);
  }
  const verdict = buildSvgVerdict(root);
  if (key !== undefined) {
    const storedRoot = verdict.ok ? (cacheImmutableRoot ? root : root.cloneNode(true) as Element) : undefined;
    rememberValidation(key, { verdict, source: codeForCache, root: storedRoot });
  }
  return cloneValidation(verdict);
}

/** Validates an already-parsed Document in one tree walk and records it in the validation cache. */
export function validateParsedSvg(doc: Document, codeForCache?: string, cacheImmutableRoot = false): SvgValidation {
  return validateSvgElement(doc.documentElement, codeForCache, cacheImmutableRoot);
}

/** Full gate: parse, structure, dimensions, safety, renderability. */
export function validateSvg(code: string): SvgValidation {
  const key = validationCacheKey(code);
  const cached = VALIDATED.get(key);
  if (cached !== undefined && cached.source === code) return cloneValidation(cached.verdict);
  const { doc, errors } = parseSvg(code);
  if (!doc) {
    const failed: SvgValidation = { ok: false, errors, warnings: [] };
    rememberValidation(key, { verdict: failed, source: code });
    return cloneValidation(failed);
  }
  return validateParsedSvg(doc, code, true);
}

function attrFindingsInto(el: Element, out: string[]): void {
  const attrs = el.attributes;
  for (let i = 0; i < attrs.length; i += 1) {
    const attr = attrs[i];
    const name = attr.name.toLowerCase();
    const value = attr.value.trim().toLowerCase();
    if (name.startsWith("on")) out.push(`event handler attribute "${attr.name}"`);
    else if (value.startsWith("javascript:")) out.push(`javascript: URL in "${attr.name}"`);
    else if (URL_ATTRS.includes(name) && isRemote(value)) out.push(`external URL in "${attr.name}"`);
  }
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

/** Free text at the root level is a sign the model answered with prose. */
function hasElementProse(root: Element): boolean {
  for (let n = root.firstChild; n !== null; n = n.nextSibling) {
    if (n.nodeType === 3 && (n.textContent ?? "").trim() !== "") return true;
  }
  return false;
}

/** Data URL for an <img> preview — scripts inside never execute there. */
export function svgDataUrl(code: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(code)}`;
}
