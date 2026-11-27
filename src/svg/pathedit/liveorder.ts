// liveorder.ts — the edit artboard shows the session's layer order (2026-11-27):
// each sibling group's drawn shapes are put into the slots the model's order
// names (Ctrl+] / Ctrl+[, and their undo), so what is on top while editing is
// what Finish writes. Only shape elements move; groups and the overlay stay.

import type { PathModel } from "../../lib/pathedit/model";
import { drawOrder } from "../../lib/pathedit/layers";

/** Puts every `[data-edit-path]` element into its slot of the model's draw order. */
export function liveOrder(root: ShadowRoot, count: number, model: PathModel): void {
  const order = drawOrder(model, count);
  const rank = new Map(order.map((o, k) => [o, k]));
  const groups = new Map<Node, Element[]>();
  for (const el of Array.from(root.querySelectorAll("[data-edit-path]"))) {
    if (el.closest("[data-edit-overlay]") !== null || el.parentNode === null) continue;
    const list = groups.get(el.parentNode) ?? [];
    list.push(el);
    groups.set(el.parentNode, list);
  }
  for (const els of groups.values()) placeInSlots(els, rank);
}

const objectOf = (el: Element): number => Number(el.getAttribute("data-edit-path"));

/** The group's elements refilled into their own slots, sorted by draw rank. */
function placeInSlots(els: Element[], rank: ReadonlyMap<number, number>): void {
  const wanted = [...els].sort((a, b) => (rank.get(objectOf(a)) ?? 0) - (rank.get(objectOf(b)) ?? 0));
  if (wanted.every((el, k) => el === els[k])) return;
  const marks = els.map((el) => {
    const mark = el.ownerDocument.createComment("slot");
    el.replaceWith(mark);
    return mark;
  });
  marks.forEach((mark, k) => mark.replaceWith(wanted[k]));
}
