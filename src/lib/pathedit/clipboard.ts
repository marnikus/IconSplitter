// clipboard.ts — copy and paste in the SVG edit mode (2026-11-06), pure. Copy
// takes the selected anchors: each unbroken run of selected points along a
// subpath is one piece (a lone point is no line and is skipped); a closed
// subpath with every anchor selected stays a closed piece. A piece's ends lose
// the handles that pointed at segments left behind. Paste adds the pieces to
// one object, moved by an offset, and returns them as the new selection.

import { cloneModel, modeOf, type Anchor, type AnchorRef, type PathModel, type Pt, type SubPath } from "./model";

/** The selected indices of one subpath in walking order (a closed one starts after an unselected point). */
function runsOf(sub: SubPath, chosen: Set<number>): number[][] {
  const n = sub.anchors.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  const firstGap = idx.find((i) => !chosen.has(i));
  const order = sub.closed && firstGap !== undefined ? [...idx.slice(firstGap + 1), ...idx.slice(0, firstGap + 1)] : idx;
  const runs: number[][] = [[]];
  for (const i of order) {
    if (chosen.has(i)) runs[runs.length - 1].push(i);
    else runs.push([]);
  }
  return runs.filter((r) => r.length >= 2);
}

/** An open piece: its ends keep only the handles that point inside it. */
function openPiece(anchors: Anchor[]): SubPath {
  const copy = anchors.map((a) => ({ ...a, in: a.in && { ...a.in }, out: a.out && { ...a.out } }));
  copy[0].in = null;
  copy[copy.length - 1].out = null;
  copy[0].mode = modeOf(copy[0]);
  copy[copy.length - 1].mode = modeOf(copy[copy.length - 1]);
  return { anchors: copy, closed: false };
}

/** The pieces the selected anchors make. */
export function copyPieces(m: PathModel, refs: readonly AnchorRef[]): SubPath[] {
  return m.subs.flatMap((sub, s) => {
    const chosen = new Set(refs.filter((r) => r.sub === s).map((r) => r.i));
    if (chosen.size === 0) return [];
    if (sub.closed && chosen.size === sub.anchors.length) return [{ anchors: cloneModel({ subs: [sub] }).subs[0].anchors, closed: true }];
    return runsOf(sub, chosen).map((run) => openPiece(run.map((i) => sub.anchors[i])));
  });
}

const shift = (p: Pt | null, d: Pt): Pt | null => (p === null ? null : { x: p.x + d.x, y: p.y + d.y });

/** The pieces added to object `owner`, moved by `offset`; the pasted anchors become the selection. */
export function pastePieces(m: PathModel, pieces: readonly SubPath[], owner: number | undefined, offset: Pt): { model: PathModel; selection: AnchorRef[] } {
  const out = cloneModel(m);
  const selection: AnchorRef[] = [];
  for (const piece of pieces) {
    const sub = out.subs.length;
    out.subs.push({
      closed: piece.closed,
      ...(owner === undefined ? {} : { owner }),
      anchors: piece.anchors.map((a) => ({ ...a, x: a.x + offset.x, y: a.y + offset.y, in: shift(a.in, offset), out: shift(a.out, offset) })),
    });
    piece.anchors.forEach((_, i) => selection.push({ sub, i }));
  }
  return { model: out, selection };
}

/** A visible nudge for a paste: 5 % of the pieces' size (at least one unit). */
export function pasteOffset(pieces: readonly SubPath[]): Pt {
  const pts = pieces.flatMap((p) => p.anchors);
  if (pts.length === 0) return { x: 0, y: 0 };
  const w = Math.max(...pts.map((a) => a.x)) - Math.min(...pts.map((a) => a.x));
  const h = Math.max(...pts.map((a) => a.y)) - Math.min(...pts.map((a) => a.y));
  const d = Math.max(1, Math.max(w, h) * 0.05);
  return { x: d, y: d };
}
