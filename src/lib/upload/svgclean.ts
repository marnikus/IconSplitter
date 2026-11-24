// svgclean.ts — one clean copy of an SVG, for both exporters (2026-11-19;
// shared with the upload chain 2026-11-20; RULE 26 direct 1-decimal baking).
// Strips `data-*` hooks, provenance `<metadata>` JSON, duplicate `xmlns`,
// comments/classes, absorbs remaining `transform`s into direct coordinates,
// tidies dead `color`, repeated/default presentation attributes and bare `<g>`
// wrappers, and rounds geometry/sizes/`viewBox`/`stroke-*` to ≤ 1 decimal place.
import { cleanExportDom } from "./cleandom";
import { solidPaintDom } from "./solidpaint";
import { bakeDirectSvg, roundRootFrame1 } from "./svgdirect";
import { allElements, comments } from "./svgdom";
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
  /** Resolve `currentColor` in place before cleaning so the caller avoids an extra DOM parse. */
  resolveCurrentColor?: boolean;
  /** Skip attribute/diff report bookkeeping when the caller only consumes `svg` and `refused`. */
  skipReport?: boolean;
  /** Elements whose geometry is already baked at target 1-decimal coordinates. */
  skipElements?: ReadonlySet<Element>;
  hasImage?: boolean;
  hasMetadata?: boolean;
  hasComments?: boolean;
}

const EMPTY: SvgCleanReport = { attributes: 0, elements: 0, rounded: 0 };

function findRasterRefusal(root: Element, opts: SvgCleanOptions): string | null {
  if ((opts.hasImage ?? true) === false) return null;
  const raster = root.getElementsByTagName("image")[0];
  return raster === undefined ? null : `a raster <${raster.nodeName.toLowerCase()}> element cannot be cleaned`;
}

function finalizeCleanedReport(
  root: Element, preBake: Map<Element, Map<string, string>> | null, beforeAttrs: number, droppedElements: number,
): SvgCleanReport {
  if (preBake === null) return EMPTY;
  return {
    attributes: Math.max(0, beforeAttrs - countAttributes(root)),
    elements: droppedElements,
    rounded: diffSnapshot(preBake, root),
  };
}

function stripMetaAndComments(root: Element, opts: SvgCleanOptions, track: boolean): number {
  const hasComments = opts.hasComments ?? true;
  const metaDropped = (opts.hasMetadata ?? true) ? dropJunkMetadata(root) : 0;
  const commentDropped = track && hasComments ? countComments(root) : 0;
  cleanExportDom(root, { keepRootEmbeds: true }, hasComments);
  dropNestedNamespaces(root);
  return metaDropped + commentDropped;
}

/** Cleans an already-parsed `<svg>` root element in place (single-DOM pipeline). */
export function cleanSvgDom(root: Element, opts: SvgCleanOptions = {}): { report: SvgCleanReport; refused: string | null } {
  const refused = findRasterRefusal(root, opts);
  if (refused !== null) return { report: EMPTY, refused };
  if (opts.resolveCurrentColor === true) solidPaintDom(root);
  const size = { width: root.getAttribute("width"), height: root.getAttribute("height") };
  const track = opts.skipReport !== true;
  const before = track ? countAttributes(root) : 0;
  const stripped = stripMetaAndComments(root, opts, track);
  const preBake = track ? snapshotAttrValues(root) : null;
  bakeDirectSvg(root, opts.skipElements === undefined ? undefined : { skipElements: opts.skipElements });
  const tidy = tidySvgTree(root);
  if (opts.keepSize === true) { restoreSize(root, size); roundRootFrame1(root); }
  return { report: finalizeCleanedReport(root, preBake, before, stripped + tidy.nodes), refused: null };
}

/** The cleaned copy; the input string is untouched. */
export function cleanSvgText(svgText: string, opts: SvgCleanOptions = {}): SvgCleanResult {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  if (root === null || root.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length > 0) {
    return { svg: svgText, report: EMPTY, refused: "the document does not parse as an SVG" };
  }
  const res = cleanSvgDom(root, {
    ...opts,
    hasImage: /<image\b/i.test(svgText),
    hasMetadata: /<metadata\b/i.test(svgText),
    hasComments: svgText.includes("<!--"),
  });
  if (res.refused !== null) return { svg: svgText, report: EMPTY, refused: res.refused };
  return { svg: new XMLSerializer().serializeToString(root), report: res.report, refused: null };
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
  const all = allElements(root);
  for (let i = 1; i < all.length; i += 1) {
    const el = all[i];
    const own = el.getAttribute("xmlns");
    if (own !== null && (declared === null || own === declared)) el.removeAttribute("xmlns");
  }
}

function countComments(root: Element): number {
  return comments(root).length;
}

function countAttributes(root: Element): number {
  return allElements(root).reduce((sum, el) => sum + el.attributes.length, 0);
}

function snapshotAttrValues(root: Element): Map<Element, Map<string, string>> {
  const snap = new Map<Element, Map<string, string>>();
  for (const el of allElements(root)) {
    snap.set(el, new Map(Array.from(el.attributes, (a) => [a.name, a.value])));
  }
  return snap;
}

function diffSnapshot(before: Map<Element, Map<string, string>>, root: Element): number {
  let changed = 0;
  for (const el of allElements(root)) {
    const prev = before.get(el);
    if (!prev) continue;
    for (const a of Array.from(el.attributes)) {
      const old = prev.get(a.name);
      if (old !== undefined && old !== a.value) changed += 1;
    }
  }
  return changed;
}
