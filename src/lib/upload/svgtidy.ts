// svgtidy.ts — the tidy-up passes that sit on top of the stock clean policy
// (2026-11-19, second round; shared 2026-11-20). The policy removes paperwork (names, foreign
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
// Both exporters run it: the builder over the finished sheet (`cleansheet.ts`),
// the upload chain over the icon SVG (`exportstages.ts`), so one policy — not a
// sheet-only subset — decides what a saved file carries.
//
// `opacity` is deliberately not compared: it is per-element compositing, not
// inherited paint. The paint comparison also stops at every reference subtree
// (`<defs>`, `<symbol>`, `<clipPath>`…), because what those inherit is decided
// by the `<use>` that instantiates them, not by their parents here.
import { allElements, insideMetadata, localName, usedPrefixes } from "./svgdom";

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
export function tidySvgTree(root: Element): TidyReport {
  const initial = allElements(root);
  const hasMeta = initial.some((el) => localName(el) === "metadata");
  const attributes = dropDeadColor(initial) + dropRedundantPaint(root, hasMeta);
  const nodes = unwrapBareGroups(root, hasMeta) + dropEmptyContainers(root, hasMeta) + tidyWhitespaceAndHref(root);
  return { attributes, nodes };
}

/** `color` only feeds `currentColor`; with none left it is dead weight. */
function dropDeadColor(elements: readonly Element[]): number {
  if (elements.some(mentionsCurrentColor)) return 0;
  let dropped = 0;
  for (const el of elements) {
    if (!el.hasAttribute("color")) continue;
    el.removeAttribute("color");
    dropped += 1;
  }
  return dropped;
}

function mentionsCurrentColor(el: Element): boolean {
  const attrs = el.attributes;
  for (let i = 0; i < attrs.length; i += 1) {
    if (attrs[i].value.includes("currentColor")) return true;
  }
  return false;
}

/** A value the element would inherit anyway is not information. */
function dropRedundantPaint(root: Element, checkMeta: boolean): number {
  return visitPaint(root, new Map(), checkMeta);
}

function visitPaint(el: Element, inherited: Map<string, string>, checkMeta: boolean): number {
  if ((checkMeta && insideMetadata(el)) || REFERENCE_ROOTS.includes(localName(el))) return 0;
  const hasChild = el.firstElementChild !== null;
  const own = hasChild ? ownPaint(el, inherited) : inherited;
  let dropped = dropShadowed(el, inherited);
  for (let child = el.firstElementChild; child !== null; child = child.nextElementSibling) {
    dropped += visitPaint(child, own, checkMeta);
  }
  return dropped;
}

/** What descendants inherit: the element's own paint where it is not redundant. */
function ownPaint(el: Element, inherited: Map<string, string>): Map<string, string> {
  const own = new Map(inherited);
  const attrs = el.attributes;
  for (let i = 0; i < attrs.length; i += 1) {
    const attribute = attrs[i];
    const name = attribute.name.toLowerCase();
    if (name in INHERITED) own.set(name, attribute.value.trim());
  }
  return own;
}

function dropShadowed(el: Element, inherited: Map<string, string>): number {
  let dropped = 0;
  const attrs = el.attributes;
  for (let i = attrs.length - 1; i >= 0; i -= 1) {
    const attribute = attrs[i];
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

/** `<g>` with no attributes at all changes nothing: lift its children out in one bottom-up pass. */
function unwrapBareGroups(root: Element, checkMeta: boolean): number {
  const els = allElements(root);
  let unwrapped = 0;
  for (let i = els.length - 1; i >= 0; i -= 1) {
    const el = els[i];
    if (localName(el) !== "g" || el.attributes.length > 0 || (checkMeta && insideMetadata(el))) continue;
    unwrap(el);
    unwrapped += 1;
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
 * Containers that hold nothing (or only spaces) are not structure. Bottom-up
 * order ensures emptying a child makes its parent empty in the same single pass.
 */
function dropEmptyContainers(root: Element, checkMeta: boolean): number {
  const els = allElements(root);
  let dropped = 0;
  for (let i = els.length - 1; i >= 0; i -= 1) {
    const el = els[i];
    if (el === root || !isEmptyContainer(el, checkMeta)) continue;
    el.parentNode?.removeChild(el);
    dropped += 1;
  }
  return dropped;
}

function isEmptyContainer(el: Element, checkMeta: boolean): boolean {
  const name = localName(el);
  if (!CONTAINERS.includes(name) && !TEXT_EMBEDS.includes(name)) return false;
  if (checkMeta && insideMetadata(el) && name !== "metadata") return false;
  return el.firstElementChild === null && (el.textContent ?? "").trim() === "";
}

function dropElementWhitespace(el: Element): number {
  let dropped = 0;
  let child = el.firstChild;
  while (child !== null) {
    const next = child.nextSibling;
    if (child.nodeType === 3 && /^\s+$/.test(child.nodeValue ?? "")) {
      el.removeChild(child);
      dropped += 1;
    }
    child = next;
  }
  return dropped;
}

/** Strips formatting text nodes and rewrites `xlink:href` → `href` in a single pass. */
function tidyWhitespaceAndHref(root: Element): number {
  const elements = allElements(root);
  let dropped = 0;
  for (const el of elements) {
    if (el.firstChild !== null && !TEXT_CONTAINERS.includes(localName(el))) {
      dropped += dropElementWhitespace(el);
    }
    const legacy = el.getAttribute("xlink:href");
    if (legacy !== null) {
      el.removeAttribute("xlink:href");
      el.setAttribute("href", legacy);
    }
  }
  if (root.hasAttribute("xmlns:xlink") && !usedPrefixes(elements).has("xlink")) {
    root.removeAttribute("xmlns:xlink");
  }
  return dropped;
}
