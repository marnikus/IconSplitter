// livepaint.ts — the edit artboard shows the session's fills (2026-11-27): a
// recoloured shape gets the colour (its own is put back when an undo takes the
// fill away), and every shape the Fill tool added is drawn as a real element
// under the root <svg>, in the place Finish will write it — just above the
// shape it sits over, or under everything. What is seen is what is saved.

import type { AddedFill, PathModel } from "../../lib/pathedit/model";

const NEW = "data-edit-new";
const KEPT = "data-edit-fill0";
const SVG_NS = "http://www.w3.org/2000/svg";
type Styled = Element & { style: CSSStyleDeclaration };

/** Each existing shape: the session's colour on it, or its own back. */
function recolour(root: ShadowRoot, model: PathModel): void {
  for (const el of Array.from(root.querySelectorAll(`[data-edit-path]:not([${NEW}])`)) as Styled[]) {
    if (el.closest("[data-edit-overlay]") !== null) continue;
    const color = model.paint?.[Number(el.getAttribute("data-edit-path"))];
    if (color !== undefined) {
      if (!el.hasAttribute(KEPT)) el.setAttribute(KEPT, el.style.getPropertyValue("fill"));
      el.style.setProperty("fill", color, "important");
    } else if (el.hasAttribute(KEPT)) {
      const own = el.getAttribute(KEPT) ?? "";
      if (own === "") el.style.removeProperty("fill"); else el.style.setProperty("fill", own);
      el.removeAttribute(KEPT);
    }
  }
}

/** The root's child that holds `el` (or is it). */
function topChild(svg: Element, el: Element | null): Element | null {
  let cur = el;
  while (cur !== null && cur.parentElement !== svg) cur = cur.parentElement;
  return cur;
}

/** Puts an added shape where it belongs: after its `above` shape's top-level element and the added ones already there, or before the first drawn shape. */
function place(svg: Element, el: Element, a: AddedFill): void {
  el.remove();
  if (a.above === null) {
    svg.insertBefore(el, topChild(svg, svg.querySelector(`[data-edit-path]:not([${NEW}])`)));
    return;
  }
  let ref = topChild(svg, svg.querySelector(`[data-edit-path="${a.above}"]`))?.nextElementSibling ?? null;
  while (ref !== null && ref.hasAttribute(NEW)) ref = ref.nextElementSibling;
  svg.insertBefore(el, ref);
}

function addedEl(svg: Element, owner: number): Element {
  const found = svg.querySelector(`[${NEW}][data-edit-path="${owner}"]`);
  if (found !== null) return found;
  const el = svg.ownerDocument.createElementNS(SVG_NS, "path");
  el.setAttribute(NEW, "");
  el.setAttribute("data-edit-path", String(owner));
  el.setAttribute("stroke", "none");
  return el;
}

/** One added shape drawn: its outline, colour and (when asked or new) its place. */
function drawAdded(svg: Element, model: PathModel, a: AddedFill, as: { d: string; placeIt: boolean }): void {
  const el = addedEl(svg, a.owner);
  el.setAttribute("d", as.d);
  el.setAttribute("fill", model.paint?.[a.owner] ?? "#000000");
  if (model.subs.some((s) => s.owner === a.owner && s.fillRule === "evenodd")) el.setAttribute("fill-rule", "evenodd");
  if (as.placeIt || el.parentNode === null) place(svg, el, a);
}

/** Removes the added shapes the model no longer has (an undo). */
function dropStale(svg: Element, adds: readonly AddedFill[]): void {
  const wanted = new Set(adds.map((a) => String(a.owner)));
  for (const el of Array.from(svg.querySelectorAll(`[${NEW}]`))) if (!wanted.has(el.getAttribute("data-edit-path") ?? "")) el.remove();
}

/**
 * Brings the drawn icon in step with the model's fills. `full` is false when
 * only anchors moved: then just the added shapes' outlines are refreshed.
 */
export function livePaint(root: ShadowRoot, model: PathModel, dOf: (owner: number) => string, full: boolean): void {
  const svg = root.querySelector("svg");
  if (svg === null) return;
  const adds = model.adds ?? [];
  if (full) { recolour(root, model); dropStale(svg, adds); }
  for (const a of adds) drawAdded(svg, model, a, { d: dOf(a.owner), placeIt: full });
}
