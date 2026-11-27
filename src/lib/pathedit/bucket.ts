// bucket.ts — the Fill tool of edit mode (2026-11-27). A click fills the closed
// area under it with a colour: an area closed by several lines or fills, a
// piece of a fill cut off by a line, a hole in a fill, or a closed line. When
// the area IS one whole shape, that shape is recoloured in place; otherwise a
// new filled shape of exactly that area is added just above whatever paints
// there (under everything when nothing does), so lines stay on top. Areas
// lying inside the clicked one are left out, as holes. Pure.

import { flattenCycle, polyArea, segsToSubPath } from "./boolean";
import { ringsPaint, subToSegs } from "./curvecut";
import { isAreaRing, type PathModel, type Pt, type SubPath } from "./model";
import { cellAt, type Cell } from "./planarface";
import { paintedSubAt } from "./region";

const linesCache = new WeakMap<PathModel, PathModel>();

/** The drawing without the shapes the Fill tool added: their edges repeat existing ones and must not split cells again. */
function linesOf(m: PathModel): PathModel {
  const added = new Set((m.adds ?? []).map((a) => a.owner));
  if (added.size === 0) return m;
  const hit = linesCache.get(m);
  if (hit !== undefined) return hit;
  const lines = { subs: m.subs.filter((s) => s.owner === undefined || !added.has(s.owner)) };
  linesCache.set(m, lines);
  return lines;
}

const ringsOf = (m: PathModel, owner: number): SubPath[] => m.subs.filter((s) => s.owner === owner && isAreaRing(s));

/** Does object `owner` paint at `q` (were it filled)? */
function paintsAt(m: PathModel, owner: number, q: Pt): boolean {
  const subs = ringsOf(m, owner);
  return subs.length > 0 && ringsPaint(subs.map(subToSegs), subs[0].fillRule ?? "nonzero", q);
}

/** Is the cell one whole shape of `owner` — its outline, with only the shape's own holes inside? */
function isWholeShape(m: PathModel, owner: number, cell: Cell): boolean {
  const areas = ringsOf(m, owner).map((s) => polyArea(flattenCycle(subToSegs(s))));
  const outline = Math.max(0, ...areas);
  if (Math.abs(outline - cell.area) > Math.max(1e-4, cell.area * 0.01)) return false;
  return cell.islands.every((isl) => !paintsAt(m, owner, isl.sample));
}

/** Object `owner` filled with `color` (a stroked-only shape starts to fill). */
function recolor(m: PathModel, owner: number, color: string): PathModel {
  const subs = m.subs.map((s) => {
    if (s.owner !== owner || s.paints !== false) return s;
    const rest = { ...s };
    delete rest.paints;
    return rest;
  });
  return { ...m, subs, paint: { ...m.paint, [owner]: color } };
}

/** A closed line that is a whole object of its own takes the colour itself. */
function loneLine(m: PathModel, lines: PathModel, cell: Cell): number | null {
  const owner = cell.intactSub === null ? undefined : lines.subs[cell.intactSub]?.owner;
  if (owner === undefined || cell.islands.length > 0) return null;
  return m.subs.filter((s) => s.owner === owner).length === 1 ? owner : null;
}

/** The cell as a new filled object, placed above object `above`. */
function addCell(m: PathModel, cell: Cell, as: { color: string; above: number | null; count: number }): PathModel | null {
  const { color, above } = as;
  const owner = Math.max(as.count, ...m.subs.map((s) => (s.owner ?? -1) + 1));
  const style = { owner, ...(cell.islands.length > 0 ? { fillRule: "evenodd" as const } : {}) };
  const outline = segsToSubPath(cell.segs, style);
  if (outline === null) return null;
  const holes = cell.islands.map((isl) => segsToSubPath(isl.segs, style)).filter((s): s is SubPath => s !== null);
  return { ...m, subs: [...m.subs, outline, ...holes], paint: { ...m.paint, [owner]: color }, adds: [...(m.adds ?? []), { owner, above }] };
}

/** The selected objects that have a closed shape, filled with `color`; null when none has one. */
export function paintObjects(m: PathModel, owners: readonly number[], color: string): PathModel | null {
  const closed = owners.filter((o) => ringsOf(m, o).length > 0);
  return closed.length === 0 ? null : closed.reduce((out, o) => recolor(out, o, color), m);
}

/**
 * The model with the closed area under `p` filled with `color`; null when no
 * closed area is there. `count` is the number of shapes in the file (a new
 * shape is numbered after them).
 */
export function fillAt(m: PathModel, p: Pt, color: string, count: number): PathModel | null {
  const lines = linesOf(m);
  const cell = cellAt(lines, p);
  if (cell === null) return null;
  const topSub = paintedSubAt(m, p);
  const top = topSub === null ? undefined : m.subs[topSub].owner;
  if (top === undefined) {
    const lone = loneLine(m, lines, cell);
    return lone === null ? addCell(m, cell, { color, above: null, count }) : recolor(m, lone, color);
  }
  const added = (m.adds ?? []).some((a) => a.owner === top);
  return added || isWholeShape(m, top, cell) ? recolor(m, top, color) : addCell(m, cell, { color, above: top, count });
}
