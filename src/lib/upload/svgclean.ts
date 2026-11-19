// svgclean.ts — the "clean export" pass a delivered file goes through
// (2026-11-19). A forensic review of a builder package listed what makes a file
// look machine-assembled rather than drawn: pipeline `data-*` attributes, a JSON
// `<metadata>` blob, `xmlns` repeated on every stitched child, and floating-point
// noise (`1.9992750000000001`). This pass removes exactly that paperwork and
// nothing else — the picture (geometry, paints, viewBox) is never touched.
//
// It is the same `cleanExportDom` policy the SVG-to-upload flow has enforced
// since 2026-10-08, plus two rules that flow never needed:
//   • every number in every attribute is written with at most three decimals;
//   • the metadata is reduced to Dublin Core title / description / subject —
//     the three fields a stock site reads, and the only ones the user wants.
// What was removed is reported, so export.json can say what the file lost.
import { cleanExportDom } from "./cleandom";
import { embedMetadataInSvg } from "./embed";
import { allElements, attributeNames } from "./svgdom";

/** The metadata a clean file may carry: exactly the three fields a stock site reads. */
export interface CleanMetadata { title: string; description: string; tags: readonly string[] }

export interface CleanSvgOk { ok: true; svg: string; removed: string[] }
export interface CleanSvgFailure { ok: false; svg: string; reason: string }
export type CleanSvgResult = CleanSvgOk | CleanSvgFailure;

const SVG_NS = "http://www.w3.org/2000/svg";
const PARSE_ERROR = "parsererror";
/** Attributes that are pipeline bookkeeping and can never be rendering. */
const TRACE_ATTR = (name: string): boolean =>
  name.startsWith("data-") || name.startsWith("aria-") || name === "class" || name === "role";
const NUM = /-?\d+(?:\.\d+)?/g;
const LONG_DECIMAL = /-?\d+\.\d{4,}/;

/** `1.9992750000000001` → `2`; everything already short stays byte-identical. */
function round3(token: string): string {
  const value = Number(token);
  return Number.isFinite(value) ? String(Number(value.toFixed(3))) : token;
}

const trimNumbers = (value: string): string => (LONG_DECIMAL.test(value) ? value.replace(NUM, round3) : value);

/** Every length/coordinate value in the tree, three decimals at most. */
function trimAllNumbers(root: Element): boolean {
  let touched = false;
  for (const el of allElements(root)) {
    for (const name of attributeNames(el)) {
      if (name === "xmlns" || name.startsWith("xmlns:")) continue;
      const value = el.getAttribute(name) ?? "";
      const trimmed = trimNumbers(value);
      if (trimmed === value) continue;
      el.setAttribute(name, trimmed);
      touched = true;
    }
  }
  return touched;
}

/** Everything the review would flag, named once each — the reason the pass ran. */
function tracesOf(root: Element): string[] {
  const found = new Set<string>();
  let declarations = 0;
  for (const el of allElements(root)) {
    for (const name of attributeNames(el)) {
      if (TRACE_ATTR(name)) found.add(`the attribute ${name}`);
      if (name === "xmlns" || name.startsWith("xmlns:")) declarations += 1;
    }
    if (el.localName.toLowerCase() === "metadata") found.add("a <metadata> block that is not Dublin Core");
    if (el.hasAttribute("width") || el.hasAttribute("height")) found.add("a fixed px size on an element");
  }
  if (declarations > 1) found.add("a namespace declared more than once");
  return [...found];
}

/** True when any attribute value needed rounding — the floating-point trace. */
function noiseOf(root: Element): boolean {
  return allElements(root).some((el) => attributeNames(el).some((name) => LONG_DECIMAL.test(el.getAttribute(name) ?? "")));
}

const isSvgRoot = (root: Element | null): root is Element =>
  root !== null && root.nodeName.toLowerCase() === "svg";

/**
 * The delivered copy: traces gone, numbers short, metadata reduced to the three
 * accepted fields. Without `meta` the file ships with no metadata at all —
 * a JSON blob is never "metadata nobody saw".
 */
export function cleanExportSvg(svg: string, meta?: CleanMetadata): CleanSvgResult {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (!isSvgRoot(root) || doc.getElementsByTagName(PARSE_ERROR).length > 0) {
    return { ok: false, svg, reason: "the document is not a well-formed SVG" };
  }
  const removed = tracesOf(root);
  if (noiseOf(root)) removed.push("floating-point noise in a number");
  trimAllNumbers(root);
  cleanExportDom(root, { keepRootEmbeds: false });
  const cleaned = new XMLSerializer().serializeToString(root);
  if (meta === undefined) return { ok: true, svg: cleaned, removed };
  // The accepted fields only: title, description, tags (the RDF block is rebuilt,
  // so nothing else — rights, vocabulary of ours — can survive).
  return { ok: true, svg: embedMetadataInSvg(cleaned, { title: meta.title, description: meta.description, tags: [...meta.tags] }), removed };
}

export { SVG_NS };
