// dash.ts — stroke-dasharray / stroke-dashoffset for the expander
// (2026-10-09, design D4 "Dashes (v1)"). The pattern is normalised like SVG
// (odd arrays repeat, all-zero or `none` = solid, a negative value is refused
// by name, a period under TOL would explode into thousands of pieces and is
// refused too). A subpath is cut by arc length into open dash pieces, each of
// which the expander caps like the browser caps a dash. A closed subpath
// opens at its phase; the dash that wraps past the start is ONE piece.

import { segLength, splitAtLength } from "./arclen";
import { isDegenerate, same, segEnd, segStart, TOL, type Seg, type Subpath } from "./pen";

export interface DashSpec {
  /** Even-length, non-negative, period > 0 — or null for a solid stroke. */
  pattern: number[] | null;
  offset: number;
}

export type DashParse = ({ ok: true } & DashSpec) | { ok: false; reason: string };

/** The attribute values → a spec, or a named refusal. */
export function normalizeDash(dasharray: string | null, dashoffset: string | null): DashParse {
  const raw = (dasharray ?? "").trim();
  const offset = Number((dashoffset ?? "0").trim().replace(/px$/i, "")) || 0;
  const values = dashValues(raw);
  if (values === null) return { ok: true, pattern: null, offset };
  if (values.some((v) => v < 0)) return { ok: false, reason: `a negative stroke-dasharray value (${raw})` };
  const pattern = values.length % 2 === 1 ? [...values, ...values] : values;
  const period = pattern.reduce((s, v) => s + v, 0);
  if (period === 0) return { ok: true, pattern: null, offset };
  if (period < TOL) return { ok: false, reason: `a stroke-dasharray period under ${TOL} px (${raw})` };
  return { ok: true, pattern, offset };
}

/** The numbers of a dasharray; null when it means solid (empty, `none`, or unreadable — ignored as browsers do). */
function dashValues(raw: string): number[] | null {
  if (raw === "" || raw.toLowerCase() === "none") return null;
  const values = raw.split(/[\s,]+/).filter((v) => v !== "").map((v) => Number(v.replace(/px$/i, "")));
  return values.some((v) => !Number.isFinite(v)) ? null : values;
}

interface Cursor {
  index: number;
  remaining: number;
  on: boolean;
}

/** Where the pattern stands after `offset` units (negative offsets wrap, as in SVG). */
function phase(pattern: number[], offset: number): Cursor {
  const period = pattern.reduce((s, v) => s + v, 0);
  let pos = ((offset % period) + period) % period;
  let index = 0;
  while (pos >= pattern[index] && pos > 0) {
    pos -= pattern[index];
    index = (index + 1) % pattern.length;
  }
  return { index, remaining: pattern[index] - pos, on: index % 2 === 0 };
}

/** The subpath cut into its "on" pieces (open subpaths, in order). */
export function dashPieces(sub: Subpath, pattern: number[], offset: number): Subpath[] {
  const segs = sub.segs.filter((s) => !isDegenerate(s));
  const cursor = phase(pattern, offset);
  const pieces: Subpath[] = [];
  let piece: Seg[] | null = cursor.on ? [] : null;
  let pieceStart = sub.start;
  const close = (at: Seg | null) => {
    if (piece !== null) pieces.push({ segs: piece, closed: false, start: piece.length > 0 ? segStart(piece[0]) : pieceStart });
    piece = null;
    if (at !== null) pieceStart = segEnd(at);
  };
  for (const seg of segs) {
    let rest: Seg = seg;
    let restLen = segLength(seg);
    while (restLen > 1e-9) {
      const take = Math.min(cursor.remaining, restLen);
      let head: Seg = rest;
      if (take < restLen - 1e-9) [head, rest] = splitAtLength(rest, take);
      if (piece !== null) piece.push(head);
      restLen -= take;
      cursor.remaining -= take;
      if (cursor.remaining <= 1e-9) advance(cursor, pattern, () => close(head), () => { piece = []; pieceStart = segEnd(head); });
    }
  }
  if (piece !== null) close(null);
  return sub.closed ? mergeWrap(pieces, sub) : pieces;
}

/** Steps the cursor to the next pattern entry, ending or starting a piece. */
function advance(cursor: Cursor, pattern: number[], end: () => void, start: () => void): void {
  if (cursor.on) end();
  cursor.index = (cursor.index + 1) % pattern.length;
  cursor.remaining = pattern[cursor.index];
  cursor.on = cursor.index % 2 === 0;
  if (cursor.on) start();
}

/** A closed subpath whose first piece starts at the start and whose last piece reaches it: one piece, as the browser draws it. */
function mergeWrap(pieces: Subpath[], sub: Subpath): Subpath[] {
  if (pieces.length < 2 || sub.segs.length === 0) return pieces;
  const first = pieces[0];
  const last = pieces[pieces.length - 1];
  const firstAtStart = first.segs.length > 0 && same(segStart(first.segs[0]), segStart(sub.segs[0]));
  const lastAtEnd = last.segs.length > 0 && same(segEnd(last.segs[last.segs.length - 1]), segEnd(sub.segs[sub.segs.length - 1]));
  if (!firstAtStart || !lastAtEnd) return pieces;
  return [{ segs: [...last.segs, ...first.segs], closed: false, start: last.start }, ...pieces.slice(1, -1)];
}
