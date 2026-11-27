// divide.ts — "Divide" in edit mode (2026-11-27), as Illustrator's Pathfinder
// Divide: the selected fills that overlap are cut along each other's outlines
// into separate pieces — one shape per area, none overlapping — and each piece
// keeps the colour that was visible there (the topmost fill's). The topmost
// shape of an area's colour is rewritten as its largest piece; every other
// piece is a new shape just above it. Fills that do not overlap are left
// alone. Pure.

import { segsToSubPath } from "./boolean";
import { ringsPaint, subToSegs } from "./curvecut";
import type { ShapeLook } from "./looks";
import { drawRank, isAreaRing, type AddedFill, type PathModel, type SubPath } from "./model";
import { cellsOf, type Cell } from "./planarface";

const fills = (s: SubPath): boolean => s.paints !== false && isAreaRing(s);

interface Piece { cell: Cell; top: number }

/** Every painted area of the selected fills, with the object seen there; null when no two of them overlap. */
function piecesOf(m: PathModel, part: PathModel, owners: readonly number[]): Piece[] | null {
  const groups = owners.map((o) => {
    const subs = part.subs.filter((s) => s.owner === o);
    return { o, rings: subs.map(subToSegs), rule: subs[0]?.fillRule ?? ("nonzero" as const) };
  });
  let overlap = false;
  const pieces = cellsOf(part).flatMap((cell) => {
    const over = groups.filter((g) => ringsPaint(g.rings, g.rule, cell.sample)).map((g) => g.o);
    if (over.length === 0) return [];
    overlap ||= over.length > 1;
    return [{ cell, top: over.reduce((a, b) => (drawRank(m, b) > drawRank(m, a) ? b : a)) }];
  });
  return overlap ? pieces : null;
}

/** One area as a filled shape of object `owner`: its outline, the areas inside it left out. */
function pieceSubs(cell: Cell, owner: number): SubPath[] {
  const style = { owner, ...(cell.islands.length > 0 ? { fillRule: "evenodd" as const } : {}) };
  return [cell.segs, ...cell.islands.map((i) => i.segs)].map((r) => segsToSubPath(r, style)).filter((s): s is SubPath => s !== null);
}

interface Built { subs: SubPath[]; paint: Record<number, string>; rules: Record<number, "evenodd" | "nonzero">; adds: AddedFill[] }

/** The pieces as shapes: per colour the largest takes the old shape's place, the rest are new ones above it. */
function build(m: PathModel, pieces: readonly Piece[], looks: readonly ShapeLook[], count: number): Built {
  const out: Built = { subs: [], paint: {}, rules: {}, adds: [] };
  let next = Math.max(count, ...m.subs.map((s) => (s.owner ?? -1) + 1));
  const placed = new Set<number>();
  for (const p of [...pieces].sort((a, b) => b.cell.area - a.cell.area)) {
    if (!placed.has(p.top)) {
      placed.add(p.top);
      out.subs.push(...pieceSubs(p.cell, p.top));
      out.rules[p.top] = p.cell.islands.length > 0 ? "evenodd" : "nonzero";
      continue;
    }
    out.subs.push(...pieceSubs(p.cell, next));
    out.paint[next] = m.paint?.[p.top] ?? looks[p.top]?.fill ?? "#000000";
    out.adds.push({ owner: next, above: p.top, own: true });
    next += 1;
  }
  return out;
}

/**
 * The model with the fills of the objects `owners` divided into pieces; null
 * when they do not overlap. `count` is the number of shapes in the file.
 */
export function divideObjects(m: PathModel, owners: readonly number[], looks: readonly ShapeLook[], count: number): PathModel | null {
  const picked = owners.filter((o) => m.subs.some((s) => s.owner === o && fills(s)));
  const cut = (s: SubPath): boolean => s.owner !== undefined && picked.includes(s.owner) && fills(s);
  const part = { subs: m.subs.filter(cut) };
  const pieces = piecesOf(m, part, picked);
  if (pieces === null) return null;
  const b = build(m, pieces, looks, count);
  return {
    ...m, subs: [...m.subs.filter((s) => !cut(s)), ...b.subs],
    paint: { ...m.paint, ...b.paint }, rules: { ...m.rules, ...b.rules }, adds: [...(m.adds ?? []), ...b.adds],
  };
}
