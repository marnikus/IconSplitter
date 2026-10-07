// clean.ts — the "clean export SVG" POLICY of the "SVG to upload" tab
// (2026-10-08, RULE 3): what the shipped file may contain, as one list of
// rules, plus the link to the pass that makes a document satisfy them.
//
// Why a separate module: the same rules are needed three times — at prepare
// (build the export copy), after the optimizer (SVGO must not smuggle anything
// back in), and as the final check before commit (the file is verified, not
// assumed). One list, one implementation, so the check and the fix can never
// disagree: `cleandom.ts` rebuilds against THIS file, and `enforceExportSvg`
// re-runs the check to prove the rebuild worked.
//
// The rules are the user's, verbatim: SVG 1.1 on the root, a real `viewBox`,
// zero raster elements anywhere (including inside `<defs>`), no `<style>`
// blocks, no editor bloat (foreign namespaces, comments), and no naming at all
// — no `id`, `class`, `data-*` or `aria-*`. The ONE exception is an id the
// artwork really references (`fill="url(#…)"`): dropping it would change the
// picture, so it survives under a minimal generated name (`a`, `b`, …) and the
// references are rewritten to match.
//
// `<metadata>` (the Dublin Core block lib/upload/embed writes) is deliberate
// content: the namespace and placement rules exempt its subtree.

import {
  allElements, attributeNames, comments, insideMetadata, isSvgElement,
  localName, referencedIds, SVG_NS,
} from "./svgdom";
import { BLOAT_ATTRS, cleanExportDom, EMBED_TAGS, unsupportedContent } from "./cleandom";

export { cleanExportDom, unsupportedContent };
export type { CleanOptions } from "./cleandom";

const RASTER_DATA = /data:image\//i;

export interface CleanReport {
  svg: string;
  /** True when the input violated a rule and the output is a rebuilt copy. */
  rebuilt: boolean;
  /** What still violates a rule after the rebuild — empty means the file may ship. */
  violations: string[];
}

/** The rules as a list of violations; empty means the file may ship. */
export function verifyExportSvg(svgText: string): string[] {
  const doc = parse(svgText);
  if (doc === null) return ["the document does not parse as XML"];
  const root = doc.documentElement;
  const elements = allElements(root);
  return [
    ...rootViolations(root),
    ...commentViolations(root),
    ...elementViolations(elements),
    ...rasterViolations(elements),
    ...namingViolations(elements, referencedIds(elements)),
  ];
}

/** Checks, and rebuilds if needed; the violation list is what is left after that. */
export function enforceExportSvg(svgText: string): CleanReport {
  const before = verifyExportSvg(svgText);
  if (before.length === 0) return { svg: svgText, rebuilt: false, violations: [] };
  const doc = parse(svgText);
  if (doc === null) return { svg: svgText, rebuilt: false, violations: before };
  cleanExportDom(doc.documentElement, { keepRootEmbeds: true });
  const rebuilt = new XMLSerializer().serializeToString(doc);
  const violations = verifyExportSvg(rebuilt);
  return { svg: violations.length === 0 ? rebuilt : svgText, rebuilt: true, violations };
}

/** Comments are editor bloat: they are never rendering and never metadata. */
function commentViolations(root: Element): string[] {
  return comments(root).map(() => "a comment is editor bloat");
}

/** Every `<image>` anywhere in the tree, and any raster data URI in an attribute. */
function rasterViolations(elements: Element[]): string[] {
  const out: string[] = [];
  for (const el of elements) {
    if (localName(el) === "image") out.push(`a raster element <${el.nodeName}> is not allowed`);
    for (const name of attributeNames(el)) {
      if (RASTER_DATA.test(el.getAttribute(name) ?? "")) out.push(`a raster data URI in ${name}`);
    }
  }
  return unique(out);
}

function rootViolations(root: Element): string[] {
  const out: string[] = [];
  if (root.getAttribute("version") !== "1.1") out.push("the root must declare version 1.1");
  const viewBox = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).filter((v) => v !== "");
  if (viewBox.length !== 4 || viewBox.some((v) => !Number.isFinite(Number(v)))) {
    out.push("the root must carry a valid viewBox of four numbers");
  }
  if ((root.namespaceURI ?? SVG_NS) !== SVG_NS) {
    out.push(`the root is not in the SVG namespace (${root.nodeName})`);
  }
  return out;
}

function elementViolations(elements: Element[]): string[] {
  const out: string[] = [];
  for (const el of elements) {
    if (insideMetadata(el)) continue; // the embedded Dublin Core block is ours, not bloat
    if (!isSvgElement(el)) out.push(`a foreign element <${el.nodeName}> is editor bloat`);
    if (localName(el) === "style") out.push("a <style> block is not allowed");
    for (const name of attributeNames(el)) out.push(...attributeViolations(name));
  }
  out.push(...namespaceViolations(elements));
  out.push(...embedPlacementViolations(elements));
  return unique(out);
}

/** One attribute: foreign, naming-only, or fine. `xlink:href` is real SVG. */
function attributeViolations(name: string): string[] {
  if (name.startsWith("xmlns:") || name.startsWith("xlink:")) return [];
  if (name.includes(":")) return [`the foreign attribute ${name} is editor bloat`];
  if (BLOAT_ATTRS.includes(name) || name.startsWith("data-") || name.startsWith("aria-")) {
    return [`the attribute ${name} is naming, never rendering`];
  }
  return [];
}

/** Only the root may declare namespaces, and only the ones it really uses. */
function namespaceViolations(elements: Element[]): string[] {
  const out: string[] = [];
  for (const el of elements) {
    if (insideMetadata(el)) continue; // RDF/DC declare their own vocabularies
    for (const name of attributeNames(el)) {
      if (name === "xmlns" || !name.startsWith("xmlns:")) continue;
      const prefix = name.slice("xmlns:".length);
      const uri = el.getAttribute(name) ?? "";
      if (prefix !== "xlink") out.push(`the namespace declaration ${name} (${uri}) is editor bloat`);
      else if (!elements.some((e) => attributeNames(e).some((a) => a.startsWith("xlink:")))) {
        out.push("the namespace declaration xmlns:xlink is unused");
      }
    }
  }
  return out;
}

/** `<title>`, `<desc>` and `<metadata>` belong to the root, nowhere else. */
function embedPlacementViolations(elements: Element[]): string[] {
  const out: string[] = [];
  for (const el of elements) {
    if (insideMetadata(el)) continue; // dc:title is not an SVG <title>
    if (EMBED_TAGS.includes(localName(el)) && el.parentElement?.parentElement !== null) {
      out.push(`<${localName(el)}> is only allowed as a direct child of the root`);
    }
  }
  return out;
}

/** An id is a violation unless a paint server reference needs it — and then it must be minimal. */
function namingViolations(elements: Element[], referenced: Set<string>): string[] {
  const out: string[] = [];
  for (const el of elements) {
    const id = el.getAttribute("id");
    if (id === null) continue;
    if (!referenced.has(id)) out.push(`naming: the id "${id}" is referenced nowhere — remove it`);
    else if (!/^[a-z]{1,3}$/.test(id)) out.push(`naming: the id "${id}" must be a minimal generated name`);
  }
  return out;
}

function parse(svgText: string): Document | null {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (doc.querySelector("parsererror") !== null || doc.documentElement === null) return null;
  return doc.documentElement.nodeName.toLowerCase() === "svg" ? doc : null;
}

function unique(list: string[]): string[] {
  return [...new Set(list)];
}
