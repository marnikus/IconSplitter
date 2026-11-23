// svgclean.ts — one clean copy of an SVG, for both exporters (2026-11-19;
// shared with the upload chain 2026-11-20; RULE 26 direct 1-decimal baking).
// Strips `data-*` hooks, provenance `<metadata>` JSON, duplicate `xmlns`,
// comments/classes, absorbs remaining `transform`s into direct coordinates,
// tidies dead `color`, repeated/default presentation attributes and bare `<g>`
// wrappers, and rounds geometry/sizes/`viewBox`/`stroke-*` to ≤ 1 decimal place.
import { cleanExportDom } from "./cleandom";
import { embedMetadataInSvg } from "./embed";
import { DEFAULT_VALUES } from "./skeleton";
import { allElements, attributeNames, localName } from "./svgdom";
import { bakeDirectSvg, roundRootFrame1 } from "./svgdirect";
import { tidySvgTree } from "./svgtidy";

export interface SvgCleanReport {
  /** Naming/editor attributes the policy dropped (`data-*`, `class`, `aria-*`…). */
  attributes: number;
  /** Provenance nodes dropped: machine records, bare wrappers and comments. */
  elements: number;
  /** Attribute values rewritten by direct baking / 1-decimal rounding. */
  rounded: number;
}

export interface SvgCleanResult {
  svg: string;
  report: SvgCleanReport;
  /** Non-null when the document holds content this pass refuses to touch. */
  refused: string | null;
}

export interface SvgCleanOptions {
  /** Put the root's own `width`/`height` back after the policy drops them. */
  keepSize?: boolean;
}

const EMPTY: SvgCleanReport = { attributes: 0, elements: 0, rounded: 0 };

/** The cleaned copy; the input string is untouched. */
export function cleanSvgText(svgText: string, opts: SvgCleanOptions = {}): SvgCleanResult {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  if (root === null || root.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length > 0) {
    return { svg: svgText, report: EMPTY, refused: "the document does not parse as an SVG" };
  }
  const raster = root.getElementsByTagName("image")[0];
  if (raster !== undefined) {
    return { svg: svgText, report: EMPTY, refused: `a raster <${raster.nodeName.toLowerCase()}> element cannot be cleaned` };
  }
  const size = { width: root.getAttribute("width"), height: root.getAttribute("height") };
  const before = countAttributes(root);
  const elements = dropJunkMetadata(root) + countComments(root);
  cleanExportDom(root, { keepRootEmbeds: true });
  dropNestedNamespaces(root);
  const preBake = snapshotAttrValues(root);
  bakeDirectSvg(root);
  const tidy = tidySvgTree(root);
  if (opts.keepSize === true) {
    restoreSize(root, size);
    roundRootFrame1(root);
  }
  const rounded = diffSnapshot(preBake, root);
  return {
    svg: new XMLSerializer().serializeToString(root),
    report: { attributes: Math.max(0, before - countAttributes(root)), elements: elements + tidy.nodes, rounded },
    refused: null,
  };
}

function restoreSize(root: Element, size: { width: string | null; height: string | null }): void {
  if (size.width !== null) root.setAttribute("width", size.width);
  if (size.height !== null) root.setAttribute("height", size.height);
}

function hasTagList(el: Element): boolean {
  return Array.from(el.getElementsByTagName("*")).some((child) => (child.localName ?? "").toLowerCase() === "subject");
}

function dropJunkMetadata(root: Element): number {
  let dropped = 0;
  for (const el of Array.from(root.getElementsByTagName("metadata"))) {
    if (hasTagList(el)) continue;
    el.parentNode?.removeChild(el);
    dropped += 1;
  }
  return dropped;
}

function dropNestedNamespaces(root: Element): void {
  const declared = root.getAttribute("xmlns");
  for (const el of Array.from(root.getElementsByTagName("*"))) {
    const own = el.getAttribute("xmlns");
    if (own !== null && (declared === null || own === declared)) el.removeAttribute("xmlns");
  }
}

function countComments(root: Element): number {
  return (new XMLSerializer().serializeToString(root).match(/<!--/g) ?? []).length;
}

function countAttributes(root: Element): number {
  return [root, ...Array.from(root.getElementsByTagName("*"))].reduce((sum, el) => sum + el.attributes.length, 0);
}

function snapshotAttrValues(root: Element): Map<Element, Map<string, string>> {
  const snap = new Map<Element, Map<string, string>>();
  for (const el of [root, ...Array.from(root.getElementsByTagName("*"))]) {
    snap.set(el, new Map(Array.from(el.attributes, (a) => [a.name, a.value])));
  }
  return snap;
}

function diffSnapshot(before: Map<Element, Map<string, string>>, root: Element): number {
  let changed = 0;
  for (const el of [root, ...Array.from(root.getElementsByTagName("*"))]) {
    const prev = before.get(el);
    if (!prev) continue;
    for (const a of Array.from(el.attributes)) {
      const old = prev.get(a.name);
      if (old !== undefined && old !== a.value) changed += 1;
    }
  }
  return changed;
}

/* ------------------------------------------------------------------------- *
 * `cleanExportSvg` — the report-carrying form of the same pass (2026-11-19).
 * `cleanSvgText` is what both exporters call; this variant answers the
 * question `export.json` asks ("what did the file lose?"), and re-embeds the
 * metadata reduced to the three fields a stock site reads. One policy, two
 * shapes.
 * ------------------------------------------------------------------------- */

/** The metadata a clean file may carry: exactly the three fields a stock site reads. */
export interface CleanMetadata { title: string; description: string; tags: readonly string[] }

export interface CleanSvgOk { ok: true; svg: string; removed: string[] }
export interface CleanSvgFailure { ok: false; svg: string; reason: string }
export type CleanSvgResult = CleanSvgOk | CleanSvgFailure;

/** Attributes that are pipeline bookkeeping and can never be rendering. */
function traceAttribute(name: string): boolean {
  return name.startsWith("data-") || name.startsWith("aria-") || name === "class" || name === "role";
}

/** One element's paperwork, named the way the report names it. */
function elementTraces(el: Element): string[] {
  const out = attributeNames(el).filter(traceAttribute).map((name) => `the attribute ${name}`);
  const tag = localName(el);
  if (tag === "metadata") out.push("a <metadata> block that is not Dublin Core");
  if (el.hasAttribute("width") || el.hasAttribute("height")) out.push("a fixed px size on an element");
  if (tag === "g" && el.attributes.length === 0) out.push("an empty group");
  for (const [name, values] of Object.entries(DEFAULT_VALUES)) {
    if (values.includes((el.getAttribute(name) ?? "").trim().toLowerCase())) out.push(`the default attribute ${name}`);
  }
  return out;
}

/** Everything the review would flag, named once each — the reason the pass ran. */
function tracesOf(root: Element): string[] {
  const found = new Set<string>();
  let declarations = 0;
  for (const el of allElements(root)) {
    declarations += attributeNames(el).filter((name) => name === "xmlns" || name.startsWith("xmlns:")).length;
    for (const trace of elementTraces(el)) found.add(trace);
  }
  if (declarations > 1) found.add("a namespace declared more than once");
  return [...found];
}

/**
 * The delivered copy: traces gone, numbers short, metadata reduced to the three
 * accepted fields. Without `meta` the file ships with no metadata at all — a
 * JSON blob is never "metadata nobody saw". Refuses (never guesses) when the
 * text is not a well-formed SVG.
 */
export function cleanExportSvg(svg: string, meta?: CleanMetadata): CleanSvgResult {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (root === null || root.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length > 0) {
    return { ok: false, svg, reason: "the document is not a well-formed SVG" };
  }
  const removed = tracesOf(root);
  const out = cleanSvgText(svg);
  if (out.refused !== null) return { ok: false, svg, reason: out.refused };
  if (meta === undefined) return { ok: true, svg: out.svg, removed };
  // The accepted fields only: the RDF block is rebuilt, so nothing else —
  // rights, a vocabulary of ours, a tool signature — can survive.
  return { ok: true, svg: embedMetadataInSvg(out.svg, { title: meta.title, description: meta.description, tags: [...meta.tags] }), removed };
}
