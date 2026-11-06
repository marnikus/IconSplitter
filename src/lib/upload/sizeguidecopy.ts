// sizeguidecopy.ts — one repeat of the finished icon, rebuilt in artboard px:
// a clone of the placed icon is baked by one uniform matrix, restyled to the
// guide's own stroke, expanded when asked, and given its own stroke definition
// so the export root's hoisted paint can never re-stroke it (2026-10-20).

import { bakeGeometry } from "./bake";
import { expandStrokes } from "./expand";
import type { Bounds } from "./geom/bounds";
import { walkPaintTree } from "./geom/visibility";
import type { Matrix } from "./geom/matrix";
import { restyleStrokes } from "./restyle";
import { unifyStrokes } from "./strokeglobal";

const SVG_NS = "http://www.w3.org/2000/svg";
/** The paint state a re-rooted icon carries on its <svg>; children inherit it. */
const INHERITED = [
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap",
  "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "opacity",
];

export interface CopyWant {
  /** The shipped icon's bounds in the placed artboard. */
  bounds: Bounds;
  /** Where the repeat goes: its painted box in artboard px. */
  rect: Bounds;
  /** The repeat's own stroke width in final px (null or 0 = the icon's own, scaled by the bake). */
  strokeWidthPx: number | null;
  /** The repeat's own stroke paint (null = the artwork's own). */
  color: string | null;
  expand: boolean;
}

export type CopyResult = { ok: true; group: Element; expanded: number } | { ok: false; detail: string };

/** One repeat: clone → bake → restyle → expand → its own stroke definition. */
export function buildCopy(root: Element, icon: Element, want: CopyWant): CopyResult {
  const group = cloneIcon(root, icon);
  const baked = bakeGeometry(group, matrixOf(want.rect, want.bounds));
  if (baked.unsupported.length > 0) return { ok: false, detail: `unsupported content: ${baked.unsupported.join(", ")}` };
  const widthPx = want.strokeWidthPx !== null && want.strokeWidthPx > 0 ? want.strokeWidthPx : null;
  restyleStrokes(group, { widthPx, color: want.color });
  const expanded = want.expand ? expandStrokes(group) : { shapes: 0, refused: null };
  if (expanded.refused !== null) return { ok: false, detail: `unsupported: ${expanded.refused}` };
  return { ok: true, group, expanded: expanded.shapes };
}

/** The icon's painted children as a <g> that inherits exactly what the placed root inherited. */
function cloneIcon(root: Element, icon: Element): Element {
  const group = root.ownerDocument.createElementNS(SVG_NS, "g");
  for (const attr of INHERITED) {
    const value = icon.getAttribute(attr);
    if (value !== null) group.setAttribute(attr, value);
  }
  for (const child of Array.from(icon.children)) group.appendChild(root.ownerDocument.importNode(child, true));
  return group;
}

/** The uniform matrix that maps the icon's painted box onto the repeat's rect. */
export function matrixOf(rect: Bounds, box: Bounds): Matrix {
  const scale = rect.width / box.width;
  return { a: scale, b: 0, c: 0, d: scale, e: rect.minX - box.minX * scale, f: rect.minY - box.minY * scale };
}

/** Move an already-built, transform-free copy by (dx, dy) — geometry only, widths unchanged. */
export function translateCopy(group: Element, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  bakeGeometry(group, { a: 1, b: 0, c: 0, d: 1, e: dx, f: dy });
}

/**
 * Pin the copy's own stroke definition (the same one-per-file policy as the
 * export root): a shared stroke/width goes on the group, otherwise on each
 * stroked shape — and a copy that strokes nothing blocks inheritance.
 */
export function defineCopyStroke(group: Element): void {
  unifyStrokes(group);
  if (!strokesAnything(group)) group.setAttribute("stroke", "none");
}

function strokesAnything(group: Element): boolean {
  let stroked = false;
  walkPaintTree(group, (_el, state) => {
    if (!stroked && !state.stroke.none && state.stroke.width > 0) stroked = true;
  });
  return stroked;
}

/** Rename every id inside the copy (ids repeat across copies) and keep its references pointing at it. */
export function isolateIds(copy: Element, taken: Set<string>): void {
  for (const el of Array.from(copy.querySelectorAll("[id]"))) {
    const old = el.getAttribute("id") ?? "";
    if (old === "") continue;
    const fresh = uniqueId(old, taken);
    el.setAttribute("id", fresh);
    taken.add(fresh);
    rewriteRefs(copy, old, fresh);
  }
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base;
  for (let suffix = 2; taken.has(id); suffix++) id = `${base}-${suffix}`;
  return id;
}

/** Only paint servers and links can name another element; everything else is left alone. */
function rewriteRefs(copy: Element, old: string, fresh: string): void {
  const url = `url(#${old})`;
  const href = `#${old}`;
  for (const el of [copy, ...Array.from(copy.querySelectorAll("*"))]) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.value === href) el.setAttribute(attr.name, `#${fresh}`);
      else if (attr.value.includes(url)) el.setAttribute(attr.name, attr.value.split(url).join(`url(#${fresh})`));
    }
  }
}
