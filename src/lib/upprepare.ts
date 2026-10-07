// upprepare.ts — building the export SVG copy (prompt §5/§6/§11). Owns:
// cloning the approved source (never modifying it), the padded artboard
// viewBox, the explicit background rect, the fit transform group, the pt→unit
// stroke normalization applied through the SAME cascade the geometry uses
// (with simple <style> rules baked in so the export is standalone and the
// normalized width always wins), metadata embedding (title/desc/RDF) and the
// SVG metadata readback used for verification.

import { avgScale, type Matrix } from "./upmatrix";
import { walkScene, type ResolvedProps } from "./upgeom";
import { strokeInUserUnits, type FitPlan, type RasterSize } from "./upfit";
import { escapeXml, svgMetadataXml } from "./upmetaxml";
import type { IconMetadata } from "./upmeta";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Parses SVG text; null when the document is not an SVG (RULE 4). */
export function parseSvgText(text: string): Document | null {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (root === null || root.localName !== "svg") return null;
  if (allByLocal(root, "parsererror").length > 0) return null;
  return doc;
}

export interface BuildArgs {
  source: Document;
  plan: FitPlan;
  raster: RasterSize;
  strokePt: number;
  background: string;
}

/**
 * Builds the export copy: viewBox padded artboard, background rect first, all
 * original content inside one fit transform group, strokes normalized to the
 * pt rule. The source document is never touched.
 */
export function buildExportSvg(a: BuildArgs): string | null {
  const doc = a.source.cloneNode(true) as Document;
  const root = doc.documentElement;
  if (root.localName !== "svg") return null;
  root.setAttribute("viewBox", `0 0 ${a.plan.artboard.w} ${a.plan.artboard.h}`);
  root.removeAttribute("width");
  root.removeAttribute("height");
  const scene = walkScene(
    doc,
    (el, resolved, matrix) => normalizeStroke(el, resolved, matrix, a),
    (el, resolved, parent) => materialize(el, resolved, parent),
  );
  moveContentIntoGroup(doc, root, a);
  if (!scene.unsupported.has("complex-css")) bakeOutStyles(doc);
  return new XMLSerializer().serializeToString(doc);
}

/**
 * The presentation values the export copy must carry once <style> is gone
 * (R04). A value equal to the SVG initial value is skipped — an absent
 * attribute means exactly that — so the copy stays as small as the source was.
 */
function materialize(el: Element, p: ResolvedProps, parent: ResolvedProps): void {
  for (const [name, value] of presentation(p, parent)) if (value !== null) el.setAttribute(name, value);
}

type Pair = [string, string | null];

/**
 * The resolved presentation of one element, written only where it DIFFERS from
 * what the parent already carries. That single rule covers both failure modes:
 * a class-styled value survives the stylesheet's removal, and a reset
 * (`stroke: none` under a stroked group) stays a reset — while a source
 * without a stylesheet never gets an invented attribute.
 */
function presentation(p: ResolvedProps, parent: ResolvedProps): Pair[] {
  return [
    ["fill", paintOf(p.fill, parent.fill)],
    ["stroke", paintOf(p.stroke, parent.stroke)],
    ...strokePairs(p, parent),
    ["fill-rule", valueOf(p.fillRule, parent.fillRule)],
    ["display", valueOf(p.display ?? "inline", parent.display ?? "inline")],
  ];
}

/** null paint means `none` — it must be said out loud once inherited paint exists. */
function paintOf(value: string | null, inherited: string | null): string | null {
  if (value === inherited) return null;
  return value ?? "none";
}

function valueOf(value: string, inherited: string): string | null {
  return value === inherited ? null : value;
}

function strokePairs(p: ResolvedProps, parent: ResolvedProps): Pair[] {
  if (p.stroke === null) return [];
  const dash = p.dash === null || p.dash.length === 0 ? null : p.dash.join(" ");
  const parentDash = parent.dash === null || parent.dash.length === 0 ? null : parent.dash.join(" ");
  const width = num(p.strokeWidth, parent.strokeWidth);
  return [
    ["stroke-width", width === null ? null : width],
    ["stroke-linejoin", valueOf(p.linejoin, parent.linejoin)],
    ["stroke-linecap", valueOf(p.linecap, parent.linecap)],
    ["stroke-miterlimit", num(p.miterlimit, parent.miterlimit)],
    ["stroke-dasharray", dash === parentDash ? null : dash],
  ];
}

function num(value: number, inherited: number): string | null {
  return value === inherited ? null : String(value);
}


/** The one stroke rule: the configured pt, expressed in this element's units. */
function normalizeStroke(el: Element, resolved: ResolvedProps, matrix: Matrix, a: BuildArgs): void {
  if (resolved.stroke === null) return; // fills and stroke-only geometry preserved
  const width = strokeInUserUnits(a.strokePt, a.plan, a.raster, {
    fitScale: a.plan.scale, elemScale: avgScale(matrix),
  });
  el.setAttribute("stroke-width", round(width));
  el.removeAttribute("vector-effect"); // sizing is deterministic in the export
}

/** Appends the background rect, then wraps every existing child in the fit group. */
function moveContentIntoGroup(doc: Document, root: Element, a: BuildArgs): void {
  const box = (root.getAttribute("viewBox") ?? "0 0 1000 1000").split(" ");
  const rect = doc.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", "0");
  rect.setAttribute("y", "0");
  rect.setAttribute("width", box[2] ?? "1000");
  rect.setAttribute("height", box[3] ?? "1000");
  rect.setAttribute("fill", a.background);
  const group = doc.createElementNS(SVG_NS, "g");
  group.setAttribute("transform", `translate(${round(a.plan.translate.x)} ${round(a.plan.translate.y)}) scale(${round(a.plan.scale)})`);
  while (root.firstChild !== null) group.appendChild(root.firstChild);
  root.appendChild(rect);
  root.appendChild(group);
}

function round(n: number): string {
  return String(Number(n.toPrecision(7)));
}

/**
 * Simple style rules were fully resolved by the cascade, so the export copy
 * can drop the <style> element and carry resolved presentation values as
 * attributes — standalone for external websites, and the normalized
 * stroke-width can no longer be overridden by a stylesheet.
 */
function bakeOutStyles(doc: Document): void {
  for (const style of Array.from(doc.getElementsByTagName("style"))) style.remove();
}

/** Embeds the accepted metadata; null when the SVG text is not parseable. */
export function embedSvgMetadata(svgText: string, m: IconMetadata): string | null {
  const doc = parseSvgText(svgText);
  if (doc === null) return null;
  for (const name of ["title", "desc", "metadata"]) {
    for (const el of allByLocal(doc.documentElement, name)) el.remove();
  }
  // Injected as text, not DOM: XMLSerializer implementations disagree about
  // element prefixes (happy-dom flattens rdf:RDF into a dangling xmlns), and
  // the embedded RDF must stay prefix-stable in every environment.
  const head =
    `<title>${escapeXml(m.title)}</title>` +
    `<desc>${escapeXml(m.description)}</desc>` +
    `<metadata>${svgMetadataXml(m)}</metadata>`;
  return injectAfterRootOpen(new XMLSerializer().serializeToString(doc), head);
}

/** Inserts `inner` right after the root <svg> open tag (self-closing aware). */
function injectAfterRootOpen(svg: string, inner: string): string | null {
  const open = /<svg[\s>]/.exec(svg);
  if (open === null) return null;
  const gt = svg.indexOf(">", open.index);
  if (gt < 0) return null;
  if (svg[gt - 1] === "/") {
    return `${svg.slice(0, gt - 1)}>${inner}</svg>${svg.slice(gt + 1)}`;
  }
  return `${svg.slice(0, gt + 1)}${inner}${svg.slice(gt + 1)}`;
}

export interface SvgMetaReadback {
  title: string;
  description: string;
  tags: string[];
}

/** Reads embedded metadata back by localName (the verification stage). */
export function readSvgMetadata(svgText: string): SvgMetaReadback | null {
  const doc = parseSvgText(svgText);
  if (doc === null) return null;
  const root = doc.documentElement;
  const title = firstText(root, "title");
  const description = firstText(root, "desc");
  if (title === null || description === null) return null;
  const tags = bagItems(root);
  if (tags.length === 0) return null;
  return { title, description, tags };
}

/** Only rdf:Bag list items are tags — the Alt lists of title/desc are not. */
function bagItems(root: Element): string[] {
  const out: string[] = [];
  const visit = (el: Element, inBag: boolean): void => {
    if (el.localName === "li" && inBag) out.push(el.textContent ?? "");
    for (const child of Array.from(el.children)) visit(child, inBag || el.localName === "Bag");
  };
  for (const child of Array.from(root.children)) visit(child, false);
  return out;
}

/** Direct svg children only — the RDF's dc:title must not mask a lost <title>. */
function firstText(root: Element, name: string): string | null {
  const el = [...root.children].find((c) => c.localName === name) ?? null;
  return el === null ? null : el.textContent ?? "";
}

function allByLocal(root: Element, name: string): Element[] {
  const out: Element[] = [];
  if (root.localName === name) out.push(root);
  for (const child of Array.from(root.children)) out.push(...allByLocal(child, name));
  return out;
}
