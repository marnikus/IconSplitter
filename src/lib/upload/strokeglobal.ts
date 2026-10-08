// strokeglobal.ts — ONE stroke definition in the export copy (RULE 3,
// 2026-10-08): the reviewer's file said `stroke="#111"` on the root,
// `stroke="#000" stroke-width=".8"` on a group and a width on every shape. A
// stroke property the visibly stroked shapes AGREE on is written once on the
// root and on nothing else; a shape that does not stroke says `none` only
// when the root now paints a stroke (it would inherit it otherwise). When the
// shapes disagree the property lives on each stroked shape — explicitly — and
// on nothing else. Containers never carry either. Runs after the stroke
// restyle, so the setting's own number/hex is what gets hoisted.

import { isShape, strokeHits, type StrokeHit } from "./geom/bounds";
import { fmt } from "./geom";
import { stripStyleKeys } from "./geom/stroke";

/** What the root carries after the pass; null = the shapes disagree (or nothing strokes). */
export interface GlobalStroke {
  stroke: string | null;
  strokeWidth: string | null;
}

const PROPS = ["stroke", "stroke-width"];

export function unifyStrokes(root: Element): GlobalStroke {
  const hits = strokeHits(root);
  const shapes = hits.filter((hit) => isShape(hit.el));
  const stroked = shapes.filter((hit) => !hit.stroke.none);
  for (const hit of hits) clearStroke(hit.el);
  if (stroked.length === 0) return { stroke: null, strokeWidth: null };
  const stroke = place(root, stroked, "stroke", (hit) => hit.stroke.paint);
  if (stroke !== null) {
    for (const hit of shapes) if (hit.stroke.none) hit.el.setAttribute("stroke", "none");
  }
  const strokeWidth = place(root, stroked, "stroke-width", (hit) => fmt(hit.stroke.width));
  return { stroke, strokeWidth };
}

/** Once on the root when every stroked shape agrees; else on each stroked shape. */
function place(root: Element, stroked: StrokeHit[], prop: string, valueOf: (hit: StrokeHit) => string): string | null {
  const values = stroked.map(valueOf);
  const shared = values.every((v) => v === values[0]) ? values[0] : null;
  if (shared !== null) root.setAttribute(prop, shared);
  else stroked.forEach((hit, i) => hit.el.setAttribute(prop, values[i]));
  return shared;
}

function clearStroke(el: Element): void {
  stripStyleKeys(el, PROPS);
  for (const prop of PROPS) el.removeAttribute(prop);
}
