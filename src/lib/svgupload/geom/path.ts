// uppath.ts — the SVG path parser the export pipeline shares (prompt §5).
// Ported from arena/d658a5b8 (src/lib/uppath.ts) — the merge report's §3 reason
// for that branch: ONE shared geometry model (parsed paths, transforms and the
// visible bounds with the stroke included) that the export planner, the stroke
// measurement and the local EPS writer all read. Host conventions applied: the
// module name, the imports below, and nothing else.
// Owns: tokenizing a `d` attribute and normalizing it to absolute M/L/C/Q/Z
// commands — relative forms, H/V, implicit repetition, S/T reflection and
// arc-to-cubic conversion included — so bounds (upgeom) and EPS (upeps) use
// ONE geometry engine. Malformed data is null, never a partial guess (RULE 4).

import type { Pt } from "./matrix";
import { arcToCubic, type ArcParams } from "./arc";

export type PathCommand =
  | { cmd: "M"; p: Pt }
  | { cmd: "L"; p: Pt }
  | { cmd: "C"; c1: Pt; c2: Pt; p: Pt }
  | { cmd: "Q"; c: Pt; p: Pt }
  | { cmd: "Z" };

/** Every anchor and control point (the bezier hull contains the curve). */
export function allCommandPoints(cmds: PathCommand[]): Pt[] {
  const out: Pt[] = [];
  for (const c of cmds) {
    if (c.cmd === "M" || c.cmd === "L") out.push(c.p);
    else if (c.cmd === "C") out.push(c.c1, c.c2, c.p);
    else if (c.cmd === "Q") out.push(c.c, c.p);
  }
  return out;
}

interface PathState {
  cur: Pt;
  start: Pt;
  prevC2: Pt | null;
  prevQC: Pt | null;
}

interface Emit {
  s: PathState;
  out: PathCommand[];
  rel: boolean;
}

type Handler = (args: number[], e: Emit) => boolean;

const HANDLERS: Record<string, { arity: number; run: Handler }> = {
  M: { arity: 2, run: hMove }, m: { arity: 2, run: hMove },
  L: { arity: 2, run: hLine }, l: { arity: 2, run: hLine },
  H: { arity: 1, run: hHoriz }, h: { arity: 1, run: hHoriz },
  V: { arity: 1, run: hVert }, v: { arity: 1, run: hVert },
  C: { arity: 6, run: hCubic }, c: { arity: 6, run: hCubic },
  S: { arity: 4, run: hSmooth }, s: { arity: 4, run: hSmooth },
  Q: { arity: 4, run: hQuad }, q: { arity: 4, run: hQuad },
  T: { arity: 2, run: hSmoothQuad }, t: { arity: 2, run: hSmoothQuad },
  A: { arity: 7, run: hArc }, a: { arity: 7, run: hArc },
  Z: { arity: 0, run: hClose }, z: { arity: 0, run: hClose },
};

const RELATIVE = new Set("mlhvcsqta".split(""));

/** Parses a `d` attribute; null when the data is malformed (never partial). */
export function parsePathData(d: string): PathCommand[] | null {
  const tokens = tokenizePath(d);
  if (tokens === null) return null;
  const e: Emit = { s: { cur: { x: 0, y: 0 }, start: { x: 0, y: 0 }, prevC2: null, prevQC: null }, out: [], rel: false };
  for (const t of tokens) {
    const h = HANDLERS[t.cmd];
    if (h === undefined || arityMismatch(t.args.length, h.arity)) return null;
    e.rel = RELATIVE.has(t.cmd);
    if (!h.run(t.args, e)) return null;
  }
  return e.out;
}

interface Token {
  cmd: string;
  args: number[];
}

/** Z takes no arguments; every other command repeats its exact arity. */
function arityMismatch(count: number, arity: number): boolean {
  if (arity === 0) return count !== 0;
  return count % arity !== 0;
}

const NUM_RE = /^[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/;

function tokenizePath(d: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < d.length) {
    if (/[\s,]/.test(d[i])) {
      i += 1;
      continue;
    }
    if (/[a-zA-Z]/.test(d[i])) {
      tokens.push({ cmd: d[i], args: [] });
      i += 1;
      continue;
    }
    const last = tokens[tokens.length - 1];
    const m = NUM_RE.exec(d.slice(i));
    if (last === undefined || m === null || m[0] === "") return null;
    last.args.push(Number(m[0]));
    i += m[0].length;
  }
  return tokens;
}

function point(x: number, y: number, e: Emit): Pt {
  return e.rel ? { x: e.s.cur.x + x, y: e.s.cur.y + y } : { x, y };
}

function reflect(c: Pt, about: Pt): Pt {
  return { x: 2 * about.x - c.x, y: 2 * about.y - c.y };
}

function hMove(args: number[], e: Emit): boolean {
  for (let i = 0; i < args.length; i += 2) {
    const p = point(args[i], args[i + 1], e);
    if (i === 0) e.s.start = p;
    e.out.push({ cmd: i === 0 ? "M" : "L", p });
    e.s.cur = p;
    e.s.prevC2 = null;
    e.s.prevQC = null;
  }
  return true;
}

function hLine(args: number[], e: Emit): boolean {
  for (let i = 0; i < args.length; i += 2) {
    const p = point(args[i], args[i + 1], e);
    e.out.push({ cmd: "L", p });
    e.s.cur = p;
    e.s.prevC2 = null;
    e.s.prevQC = null;
  }
  return true;
}

function hHoriz(args: number[], e: Emit): boolean {
  for (const x of args) {
    const p = { x: e.rel ? e.s.cur.x + x : x, y: e.s.cur.y };
    e.out.push({ cmd: "L", p });
    e.s.cur = p;
  }
  return true;
}

function hVert(args: number[], e: Emit): boolean {
  for (const y of args) {
    const p = { x: e.s.cur.x, y: e.rel ? e.s.cur.y + y : y };
    e.out.push({ cmd: "L", p });
    e.s.cur = p;
  }
  return true;
}

function hCubic(args: number[], e: Emit): boolean {
  for (let i = 0; i < args.length; i += 6) {
    const c1 = point(args[i], args[i + 1], e);
    const c2 = point(args[i + 2], args[i + 3], e);
    const p = point(args[i + 4], args[i + 5], e);
    e.out.push({ cmd: "C", c1, c2, p });
    e.s.cur = p;
    e.s.prevC2 = c2;
    e.s.prevQC = null;
  }
  return true;
}

function hSmooth(args: number[], e: Emit): boolean {
  for (let i = 0; i < args.length; i += 4) {
    const c1 = e.s.prevC2 === null ? e.s.cur : reflect(e.s.prevC2, e.s.cur);
    const c2 = point(args[i], args[i + 1], e);
    const p = point(args[i + 2], args[i + 3], e);
    e.out.push({ cmd: "C", c1, c2, p });
    e.s.cur = p;
    e.s.prevC2 = c2;
    e.s.prevQC = null;
  }
  return true;
}

function hQuad(args: number[], e: Emit): boolean {
  for (let i = 0; i < args.length; i += 4) {
    const c = point(args[i], args[i + 1], e);
    const p = point(args[i + 2], args[i + 3], e);
    e.out.push({ cmd: "Q", c, p });
    e.s.cur = p;
    e.s.prevQC = c;
    e.s.prevC2 = null;
  }
  return true;
}

function hSmoothQuad(args: number[], e: Emit): boolean {
  for (let i = 0; i < args.length; i += 2) {
    const c = e.s.prevQC === null ? e.s.cur : reflect(e.s.prevQC, e.s.cur);
    const p = point(args[i], args[i + 1], e);
    e.out.push({ cmd: "Q", c, p });
    e.s.cur = p;
    e.s.prevQC = c;
    e.s.prevC2 = null;
  }
  return true;
}

function hClose(_args: number[], e: Emit): boolean {
  e.out.push({ cmd: "Z" });
  e.s.cur = e.s.start;
  e.s.prevC2 = null;
  e.s.prevQC = null;
  return true;
}

function hArc(args: number[], e: Emit): boolean {
  for (let i = 0; i < args.length; i += 7) {
    const to = point(args[i + 5], args[i + 6], e);
    const arc: ArcParams = {
      rx: Math.abs(args[i]), ry: Math.abs(args[i + 1]),
      cosP: Math.cos((args[i + 2] * Math.PI) / 180), sinP: Math.sin((args[i + 2] * Math.PI) / 180),
      large: args[i + 3] !== 0, sweep: args[i + 4] !== 0,
    };
    arcToCubic(e.s.cur, arc, to, e.out);
    e.s.cur = to;
    e.s.prevC2 = null;
    e.s.prevQC = null;
  }
  return true;
}

