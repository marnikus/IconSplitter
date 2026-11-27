// outline.ts — "Expand stroke" in edit mode (2026-11-27): the selected shapes'
// lines become filled outlines of their pen (strokering.ts), coloured like the
// line, and the line itself goes. A shape with no fill is rewritten in place;
// a shape that also fills keeps its fill and gets the outline as a new shape
// just above it. The outline uses the width the FILE gives the line. Pure.

import { segsToSubPath } from "./boolean";
import type { ShapeLook } from "./looks";
import { isAreaRing, type PathModel, type SubPath } from "./model";
import { strokeRings } from "./strokering";

const penned = (s: SubPath): boolean => (s.halfStroke ?? 0) > 0;

/** The pen outlines of an object's lines, as filled subpaths of object `owner`. */
function outlineSubs(subs: readonly SubPath[], look: ShapeLook, owner: number): SubPath[] {
  return subs.filter(penned).flatMap((s) => strokeRings(s, s.halfStroke as number, look))
    .map((ring) => segsToSubPath(ring, { owner })).filter((s): s is SubPath => s !== null);
}

const unpenned = (s: SubPath): SubPath => { const out = { ...s }; delete out.halfStroke; return out; };

/** One object expanded: in place when it has no fill, else as a new shape above it. */
function expandOne(m: PathModel, owner: number, look: ShapeLook, next: number): PathModel | null {
  const own = m.subs.filter((s) => s.owner === owner);
  const filled = own.some((s) => s.paints !== false && isAreaRing(s));
  const rings = look.stroke === null ? [] : outlineSubs(own, look, filled ? next : owner);
  if (rings.length === 0) return null;
  const nostroke = [...(m.nostroke ?? []), owner];
  if (filled) {
    const subs = [...m.subs.map((s) => (s.owner === owner ? unpenned(s) : s)), ...rings];
    return { ...m, subs, nostroke, paint: { ...m.paint, [next]: look.stroke as string }, adds: [...(m.adds ?? []), { owner: next, above: owner, own: true }] };
  }
  const at = m.subs.findIndex((s) => s.owner === owner);
  const rest = m.subs.filter((s) => s.owner !== owner);
  const subs = [...rest.slice(0, at), ...rings, ...rest.slice(at)];
  return { ...m, subs, nostroke, paint: { ...m.paint, [owner]: look.stroke as string }, rules: { ...m.rules, [owner]: "nonzero" } };
}

/**
 * The model with the lines of the objects `owners` expanded into filled
 * outlines; null when none of them draws a line. `looks[o]` is how shape `o`
 * of the file is drawn (a shape added in this session has none and no line).
 */
export function expandStrokes(m: PathModel, owners: readonly number[], looks: readonly ShapeLook[]): PathModel | null {
  let out = m, changed = false;
  for (const owner of owners) {
    const look = looks[owner];
    const next = Math.max(looks.length, ...out.subs.map((s) => (s.owner ?? -1) + 1));
    const done = look === undefined ? null : expandOne(out, owner, look, next);
    if (done !== null) { out = done; changed = true; }
  }
  return changed ? out : null;
}
