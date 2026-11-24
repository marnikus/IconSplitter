// svgIconRoot.ts — extracts a validated, sanitised `<svg>` root element for
// direct SVG-builder node compilation, reusing the cached validated DOM root
// when read-only and free of mutating features (zero redundant DOMParser runs).
import { parseXml, readSvgViewBox, sanitizeIconSubtree } from "../svgpreview";
import { getCachedValidatedRoot, validateParsedSvg } from "../svgvalidate";

export type IconRootResult =
  | { ok: true; root: Element; viewBox: string; ratio: number }
  | { ok: false; error: string };

const ICON_MUTATION_RE = /\b(?:id|transform)\s*=|<(?:style|iframe|embed|object|audio|video|set|animate|animatetransform|animatemotion|mpath)\b/i;

function finalizeIconRoot(root: Element, code: string, skipSanitize: boolean): IconRootResult {
  const box = readSvgViewBox(root);
  if (box === null) return { ok: false, error: "no viewBox and no usable width/height" };
  if (!skipSanitize) sanitizeIconSubtree(root, code);
  return { ok: true, root, viewBox: box.viewBox, ratio: box.ratio };
}

/** Validates and sanitises an icon `<svg>` for direct node compilation without mutating root frame attrs. */
export function extractValidatedIconRoot(code: string, readOnly = false): IconRootResult {
  const trimmed = code.trim();
  if (trimmed === "") return { ok: false, error: "empty response" };
  if (!trimmed.startsWith("<")) return { ok: false, error: "no SVG markup found" };
  const cleanImmutable = readOnly && !ICON_MUTATION_RE.test(code);
  const cachedRoot = getCachedValidatedRoot(code);
  if (cachedRoot !== null) {
    const target = cleanImmutable ? cachedRoot : cachedRoot.cloneNode(true) as Element;
    return finalizeIconRoot(target, code, cleanImmutable);
  }
  const parsed = parseXml(trimmed);
  if (parsed.doc === null) return { ok: false, error: parsed.error ?? "no SVG to preview" };
  const check = validateParsedSvg(parsed.doc, code, cleanImmutable);
  if (!check.ok) return { ok: false, error: check.errors[0] ?? "invalid approved SVG" };
  return finalizeIconRoot(parsed.doc.documentElement, code, cleanImmutable);
}
