// layers.ts — layer order in edit mode (2026-11-27). Ctrl+] brings the selected
// shapes one step forward, Ctrl+[ sends them one step back, with Shift to the
// front / to the back. A shape trades places only with its SIBLING shapes (the
// same parent element): its transforms and inherited paint never change, and
// groups stay where they are. The order lives in the session's model
// (`PathModel.order`: slot k of the document draws object order[k]), so Undo
// restores it; Finish writes the elements into their new slots. Pure.

import type { PathModel } from "./model";
import { commit, type EditSession } from "./session";
import { blanked, cachedPathTags, type PathTag } from "./svgdoc";

export type Arrange = "forward" | "backward" | "front" | "back";

/** The objects in document slots: order[k] is drawn at slot k (identity when the model has none or a broken one). */
export function drawOrder(m: PathModel, count: number): number[] {
  const own = m.order;
  const identity = Array.from({ length: count }, (_, i) => i);
  if (own === undefined || own.length !== count) return identity;
  return [...own].sort((a, b) => a - b).every((v, i) => v === i) ? [...own] : identity;
}

/** True when the model draws its objects in another order than the file. */
export function orderChanged(m: PathModel): boolean {
  return m.order !== undefined && m.order.some((v, i) => v !== i);
}

const ANY_TAG = /<(\/?)([a-zA-Z][\w:.-]*)([^>]*)>/g;

/** Each shape's parent element (its start offset; -1 = none), so only siblings trade places. */
export function shapeParents(markup: string): number[] {
  const tags = cachedPathTags(markup);
  const text = blanked(markup);
  const open: { name: string; at: number }[] = [];
  const parents: number[] = [];
  let next = 0;
  ANY_TAG.lastIndex = 0;
  for (let m = ANY_TAG.exec(text); m !== null && next < tags.length; m = ANY_TAG.exec(text)) {
    const name = m[2].toLowerCase();
    if (m[1] === "/") { popTo(open, name); continue; }
    if (m.index === tags[next].start) { parents.push(open.at(-1)?.at ?? -1); next += 1; }
    if (!/\/\s*$/.test(m[3])) open.push({ name, at: m.index });
  }
  return parents;
}

function popTo(open: { name: string }[], name: string): void {
  const at = open.map((o) => o.name).lastIndexOf(name);
  if (at >= 0) open.length = at;
}

/** One sibling group's objects (in slot order) after the move. */
function moveInGroup(group: number[], picked: ReadonlySet<number>, how: Arrange): number[] {
  if (how === "front") return [...group.filter((o) => !picked.has(o)), ...group.filter((o) => picked.has(o))];
  if (how === "back") return [...group.filter((o) => picked.has(o)), ...group.filter((o) => !picked.has(o))];
  const out = how === "forward" ? [...group] : [...group].reverse();
  for (let k = out.length - 2; k >= 0; k--) {
    if (picked.has(out[k]) && !picked.has(out[k + 1])) [out[k], out[k + 1]] = [out[k + 1], out[k]];
  }
  return how === "forward" ? out : out.reverse();
}

/** The new draw order: every sibling group's slots refilled after its move. */
export function arranged(order: readonly number[], parents: readonly number[], picked: ReadonlySet<number>, how: Arrange): number[] {
  const out = [...order];
  for (const parent of new Set(parents)) {
    const slots = order.flatMap((_, k) => (parents[k] === parent ? [k] : []));
    const moved = moveInGroup(slots.map((k) => order[k]), picked, how);
    slots.forEach((k, j) => { out[k] = moved[j]; });
  }
  return out;
}

/** The session with its selected objects arranged; the same session when nothing moves. */
export function arrangeSession(source: string, s: EditSession, how: Arrange): EditSession {
  const parents = shapeParents(source);
  const order = drawOrder(s.model, parents.length);
  const next = arranged(order, parents, new Set(s.objects), how);
  if (next.every((v, k) => v === order[k])) return s;
  return commit(s, { ...s.model, order: next });
}

/** Where a shape's whole element ends (its closing tag, when it has one). */
function elementEnd(text: string, t: PathTag): number {
  if (t.selfClosing) return t.end;
  const close = new RegExp(`</${t.kind}\\s*>`, "ig");
  close.lastIndex = t.end;
  const m = close.exec(text);
  return m === null ? t.end : m.index + m[0].length;
}

/** The file with each slot holding the element `order` puts there (siblings only ever trade slots). */
export function withOrder(markup: string, order: readonly number[]): string {
  const tags = cachedPathTags(markup);
  if (order.length !== tags.length || order.every((v, k) => v === k)) return markup;
  const text = blanked(markup);
  const spans = tags.map((t) => ({ start: t.start, end: elementEnd(text, t) }));
  let out = markup;
  for (let k = spans.length - 1; k >= 0; k--) {
    const from = spans[order[k]];
    out = out.slice(0, spans[k].start) + markup.slice(from.start, from.end) + out.slice(spans[k].end);
  }
  return out;
}
