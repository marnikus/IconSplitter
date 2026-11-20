// cleantree.ts — the tidy-up passes that sit on top of the stock clean policy
// (2026-11-19, second round). The policy removes paperwork (names, foreign
// vocabularies, comments); what survives it in a stitched sheet is still
// machine-shaped, and this pass removes THAT without touching the picture:
//
//   • dead `color="…"` left beside an explicit `stroke` (the desktop-editor
//     export quirk: it only means something to `currentColor`, and the ink pass
//     has already resolved every `currentColor`);
//   • a child repeating paint it inherits, and values that are simply the SVG
//     initial value (`stroke-linecap="butt"`, `fill-rule="nonzero"`) — compared
//     against what the element would really inherit, never guessed;
//   • the attribute-less `<g>` wrappers a cell-by-cell stitch leaves behind,
//     unwrapped so `<g><g><text>` is just `<text>`;
//   • empty containers and whitespace-only text nodes: bytes that draw nothing;
//   • `xlink:href` → the SVG 2 `href`, and the declaration that is then unused.
//
// `opacity` is deliberately not compared: it is per-element compositing, not
// inherited paint. The paint comparison also stops at every reference subtree
// (`<defs>`, `<symbol>`, `<clipPath>`…), because what those inherit is decided
// by the `<use>` that instantiates them, not by their parents here.
import { allElements, insideMetadata, localName, usedPrefixes } from "../upload/svgdom";

interface TidyReport {
  /** Attributes removed as dead or redundant. */
  attributes: number;
  /** Bare `<g>` wrappers unwrapped, plus empty containers and text nodes dropped. */
  nodes: number;
}

/** Inherited presentation properties and their SVG initial value. */
const INHERITED: Readonly<Record<string, string>> = {
  "fill": "black", "fill-opacity": "1", "fill-rule": "nonzero",
  "stroke": "none", "stroke-width": "1", "stroke-opacity": "1",
  "stroke-linecap": "butt", "stroke-linejoin": "miter", "stroke-miterlimit": "4",
  "stroke-dasharray": "none", "stroke-dashoffset": "0",
  "letter-spacing": "normal", "word-spacing": "normal", "text-anchor": "start",
  "font-style": "normal", "font-weight": "normal", "font-variant": "normal",
  "paint-order": "normal",
};
/** Subtrees whose inheritance is decided by whoever references them. */
const REFERENCE_ROOTS = ["defs", "symbol", "marker", "pattern", "clippath", "mask"];
const TEXT_CONTAINERS = ["text", "tspan", "textpath"];
const CONTAINERS = ["g", "defs"];
const TEXT_EMBEDS = ["title", "desc", "metadata"];

/** Runs every tidy pass in order; idempotent on an already tidy tree. */
export function tidySheetTree(root: Element): TidyReport {
  const attributes = dropDeadColor(root) + dropRedundantPaint(root);
  const nodes = unwrapBareGroups(root) + dropEmptyContainers(root) + dropWhitespace(root);
  toSvg2Href(root);
  return { attributes, nodes };
}

/** `color` only feeds `currentColor`; with none left it is dead weight. */
function dropDeadColor(root: Element): number {
  const elements = allElements(root);
  if (elements.some(mentionsCurrentColor)) return 0;
  let dropped = 0;
  for (const el of elements) {
    if (el.getAttribute("color") === null) continue;
    el.removeAttribute("color");
    dropped += 1;
  }
  return dropped;
}

function mentionsCurrentColor(el: Element): boolean {
  return Array.from(el.attributes).some((a) => a.value.includes("currentColor"));
}

/** A value the element would inherit anyway is not information. */
function dropRedundantPaint(root: Element): number {
  return visitPaint(root, new Map());
}

function visitPaint(el: Element, inherited: Map<string, string>): number {
  if (insideMetadata(el) || REFERENCE_ROOTS.includes(localName(el))) return 0;
  const own = ownPaint(el, inherited);
  let dropped = dropShadowed(el, inherited);
  for (const child of Array.from(el.children)) dropped += visitPaint(child, own);
  return dropped;
}

/** What descendants inherit: the element's own paint where it is not redundant. */
function ownPaint(el: Element, inherited: Map<string, string>): Map<string, string> {
  const own = new Map(inherited);
  for (const attribute of Array.from(el.attributes)) {
    const name = attribute.name.toLowerCase();
    if (name in INHERITED) own.set(name, attribute.value.trim());
  }
  return own;
}

function dropShadowed(el: Element, inherited: Map<string, string>): number {
  let dropped = 0;
  for (const attribute of Array.from(el.attributes)) {
    const name = attribute.name.toLowerCase();
    if (!(name in INHERITED)) continue;
    const wouldInherit = inherited.get(name) ?? INHERITED[name];
    if (!sameValue(attribute.value, wouldInherit)) continue;
    el.removeAttribute(attribute.name);
    dropped += 1;
  }
  return dropped;
}

/** `1` vs `1.0`, `Butt` vs `butt`, `#FFF` vs `#fff` — the same instruction. */
function sameValue(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();
  if (left.toLowerCase() === right.toLowerCase()) return true;
  const l = Number(left);
  const r = Number(right);
  return left !== "" && right !== "" && Number.isFinite(l) && Number.isFinite(r) && l === r;
}

/** `<g>` with no attributes at all changes nothing: lift its children out. */
function unwrapBareGroups(root: Element): number {
  let unwrapped = 0;
  for (let round = 0; round < 8; round += 1) {
    const bare = allElements(root).filter((el) => localName(el) === "g" && el.attributes.length === 0 && !insideMetadata(el));
    if (bare.length === 0) break;
    for (const group of bare) unwrap(group);
    unwrapped += bare.length;
  }
  return unwrapped;
}

function unwrap(group: Element): void {
  const parent = group.parentNode;
  if (parent === null) return;
  while (group.firstChild !== null) parent.insertBefore(group.firstChild, group);
  parent.removeChild(group);
}

/**
 * Containers that hold nothing (or only spaces) are not structure. Repeated,
 * because emptying a leaf can empty the group that held it. A group that still
 * holds an element is never "empty", however little text it has.
 */
function dropEmptyContainers(root: Element): number {
  let dropped = 0;
  for (let round = 0; round < 6; round += 1) {
    const empty = allElements(root).filter((el) => el !== root && isEmptyContainer(el));
    if (empty.length === 0) break;
    for (const el of empty) el.parentNode?.removeChild(el);
    dropped += empty.length;
  }
  return dropped;
}

function isEmptyContainer(el: Element): boolean {
  if (insideMetadata(el) && localName(el) !== "metadata") return false;
  const name = localName(el);
  if (!CONTAINERS.includes(name) && !TEXT_EMBEDS.includes(name)) return false;
  return el.children.length === 0 && (el.textContent ?? "").trim() === "";
}

/** Indentation inside a machine-written file: whitespace that paints nothing. */
function dropWhitespace(root: Element): number {
  let dropped = 0;
  for (const el of allElements(root)) {
    if (TEXT_CONTAINERS.includes(localName(el))) continue;
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType !== 3 || !/^\s+$/.test(child.nodeValue ?? "")) continue;
      el.removeChild(child);
      dropped += 1;
    }
  }
  return dropped;
}

/** `xlink:href` is the SVG 1.1 spelling; `href` is current and needs no prefix. */
function toSvg2Href(root: Element): void {
  for (const el of allElements(root)) {
    const legacy = el.getAttribute("xlink:href");
    if (legacy === null) continue;
    el.removeAttribute("xlink:href");
    el.setAttribute("href", legacy);
  }
  if (usedPrefixes(allElements(root)).has("xlink")) return;
  root.removeAttribute("xmlns:xlink");
}
