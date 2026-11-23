// skeleton.ts — the "this file was composed, not drawn" half of the clean pass
// (2026-11-19). After the traces, numbers and namespaces are gone, a delivered
// SVG could still read as machine output because of its SHAPE:
//   • chains of `<g>` that carry nothing and wrap another `<g>` — the composer's
//     nesting, which a person's drawing never has;
//   • attributes that merely restate SVG's own initial values (`rx="0"`,
//     `stroke-linecap="butt"`, `fill-opacity="1"`) — traces of whoever wrote
//     the element, never a decision.
// Both are removed here and nothing else: this pass only ever deletes a group
// that cannot affect the picture, or a value that IS the value already in force,
// so geometry and paints come out identical. Split out of `cleandom.ts` (RULE 18)
// so the policy file stays about what may ship, and this one about how it looks.

import { allElements, insideMetadata, localName } from "./svgdom";

/** An attribute that restates SVG's own initial value, and those values. */
export const DEFAULT_VALUES: Record<string, string[]> = {
  "fill-opacity": ["1"], "stroke-opacity": ["1"], opacity: ["1"],
  "fill-rule": ["nonzero"], "clip-rule": ["nonzero"], "stroke-linecap": ["butt"],
  "stroke-linejoin": ["miter"], "stroke-miterlimit": ["4"], "stroke-dashoffset": ["0"],
  rx: ["0"], ry: ["0"], "stroke-dasharray": ["none"],
};

/** The properties that do NOT inherit: a value on one element says nothing about its children. */
const NON_INHERITED = ["rx", "ry", "opacity"];

/**
 * Removes the composer's skeleton: bare `<g>` wrappers and default restatements.
 * Idempotent — a second run finds nothing to do.
 */
export function dropSkeleton(root: Element): void {
  collapseGroups(root);
  dropDefaultAttributes(root);
}

/**
 * A group with no attributes and no text of its own says nothing a reader needs,
 * so its children move up into its place. Runs until nothing changes: the CHAINS
 * are what look machine-made. A group carrying anything (a transform, a paint, a
 * clip) is kept — that is what makes its children look the way they do.
 */
function collapseGroups(root: Element): void {
  for (let pass = 0; pass < 64; pass++) {
    const bare = allElements(root).filter((el) => localName(el) === "g" && el.attributes.length === 0 && !hasOwnText(el));
    if (bare.length === 0) return;
    for (const group of bare) unwrap(group);
  }
}

/** A `<g>`'s own text: whitespace between child elements is layout, not drawing. */
function hasOwnText(el: Element): boolean {
  return Array.from(el.childNodes).some((node) => node.nodeType === 3 && (node.textContent ?? "").trim() !== "");
}

/** Moves a group's children into its place, then removes it. */
function unwrap(group: Element): void {
  const parent = group.parentNode;
  if (parent === null) return;
  while (group.firstChild !== null) parent.insertBefore(group.firstChild, group);
  parent.removeChild(group);
}

function dropDefaultAttributes(root: Element): void {
  for (const el of allElements(root)) {
    if (insideMetadata(el)) continue;
    for (const [name, values] of Object.entries(DEFAULT_VALUES)) {
      if (isDefault(el, name, values)) el.removeAttribute(name);
    }
  }
}

/** An explicit default is a restatement — unless it OVERRIDES something inherited. */
function isDefault(el: Element, name: string, values: string[]): boolean {
  const value = (el.getAttribute(name) ?? "").trim().toLowerCase();
  if (!values.includes(value)) return false;
  return NON_INHERITED.includes(name) || !inherited(el, name);
}

/** Whether an ancestor declares this property at all (at any value). */
function inherited(el: Element, name: string): boolean {
  for (let at = el.parentElement; at !== null; at = at.parentElement) {
    if (at.hasAttribute(name) || (at.getAttribute("style") ?? "").includes(`${name}:`)) return true;
  }
  return false;
}
