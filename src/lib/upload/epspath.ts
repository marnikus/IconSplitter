// epspath.ts — geometry to PostScript path construction (RULE 3): the
// documented EPS subset's shapes (rect, circle, ellipse, line, polyline,
// polygon, path) as `newpath … moveto/lineto/curveto/closepath` sequences.
// The shape itself comes from the ONE outline model (geom/outline.ts) that
// the export bake also reads, so the EPS and the SVG can never disagree about
// a shape; this file is only the PostScript writer. No paint here —
// uploadeps wraps these with the CTM and the paint state.

import { fmt } from "./geom";
import { pathOutline, shapeOutline, type Outline } from "./geom/outline";

const PURE_MLCZ_RE = /^[MLCZ0-9 .,\t\r\n+-]+$/;
const MLC_NUM_RE = /[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/iy;

function skipWsComma(d: string, pos: number): number {
  let i = pos;
  while (i < d.length) {
    const c = d.charCodeAt(i);
    if (c === 32 || c === 44 || c === 9 || c === 10 || c === 13) i += 1;
    else break;
  }
  return i;
}

function scanDigits(d: string, from: number): number {
  let i = from;
  while (i < d.length && d.charCodeAt(i) >= 48 && d.charCodeAt(i) <= 57) i += 1;
  return i;
}

function scanCanonicalInt(d: string, from: number): number {
  if (from >= d.length) return -1;
  const first = d.charCodeAt(from);
  if (first === 48) {
    const next = from + 1;
    return next < d.length && d.charCodeAt(next) >= 48 && d.charCodeAt(next) <= 57 ? -1 : next;
  }
  if (first < 49 || first > 57) return -1;
  const end = scanDigits(d, from + 1);
  return end - from <= 12 ? end : -1;
}

function scanCanonicalFrac(d: string, from: number, isNegZero: boolean): number {
  if (from >= d.length || d.charCodeAt(from) !== 46) return isNegZero ? -1 : from;
  const fracStart = from + 1;
  const end = scanDigits(d, fracStart);
  const len = end - fracStart;
  return len >= 1 && len <= 4 && d.charCodeAt(end - 1) !== 48 ? end : -1;
}

function scanCanonicalEnd(d: string, pos: number): number {
  const neg = pos < d.length && d.charCodeAt(pos) === 45;
  const intStart = neg ? pos + 1 : pos;
  const intEnd = scanCanonicalInt(d, intStart);
  if (intEnd < 0) return -1;
  const end = scanCanonicalFrac(d, intEnd, neg && d.charCodeAt(intStart) === 48);
  if (end < 0) return -1;
  return end < d.length && ((d.charCodeAt(end) | 32) === 101 || d.charCodeAt(end) === 46) ? -1 : end;
}

function scanFastSpaceTuple(d: string, start: number, count: number): number {
  let i = start;
  for (let k = 0; k < count; k += 1) {
    if (k > 0) {
      if (i >= d.length || d.charCodeAt(i) !== 32) return -1;
      i += 1;
    }
    i = scanCanonicalEnd(d, i);
    if (i < 0) return -1;
  }
  return i;
}

function readPsTuple(d: string, start: number, count: number): { text: string; next: number } | null {
  const first = skipWsComma(d, start);
  const fastEnd = scanFastSpaceTuple(d, first, count);
  if (fastEnd > first) return { text: d.slice(first, fastEnd), next: fastEnd };
  let i = first;
  const nums = new Array<string>(count);
  for (let k = 0; k < count; k += 1) {
    if (k > 0) i = skipWsComma(d, i);
    MLC_NUM_RE.lastIndex = i;
    const m = MLC_NUM_RE.exec(d);
    if (m === null) return null;
    nums[k] = fmt(Number(m[0]));
    i = MLC_NUM_RE.lastIndex;
  }
  return { text: nums.join(" "), next: i };
}

const MLC_OPS: Record<string, { arity: number; ps: string }> = {
  M: { arity: 2, ps: "moveto" },
  L: { arity: 2, ps: "lineto" },
  C: { arity: 6, ps: "curveto" },
};

function appendMlcCommand(d: string, cmd: string, pos: number, parts: string[]): { next: number; nextCmd: string } | null {
  const spec = MLC_OPS[cmd];
  if (spec === undefined) return null;
  const tuple = readPsTuple(d, pos, spec.arity);
  if (tuple === null) return null;
  parts.push(` ${tuple.text} ${spec.ps}`);
  return { next: skipWsComma(d, tuple.next), nextCmd: cmd === "M" ? "L" : cmd };
}

/** Direct M/L/C/Z scanner for already-baked paths: avoids PathCmd[] + OutlineOp[] allocations. */
function directMlcPathPs(d: string | null): string | null {
  if (d === null || !PURE_MLCZ_RE.test(d)) return null;
  const parts: string[] = ["newpath"];
  let i = skipWsComma(d, 0);
  let cmd = "";
  while (i < d.length) {
    const ch = d[i];
    if (ch === "Z") { parts.push(" closepath"); cmd = ""; i = skipWsComma(d, i + 1); continue; }
    if (ch === "M" || ch === "L" || ch === "C") { cmd = ch; i = skipWsComma(d, i + 1); }
    const res = appendMlcCommand(d, cmd, i, parts);
    if (res === null) return null;
    i = res.next;
    cmd = res.nextCmd;
  }
  return parts.length > 1 ? parts.join("") : null;
}

/** PS path construction for one shape element; null when outside the subset. */
export function shapePathPs(el: Element): string | null {
  if (el.nodeName.toLowerCase() === "path") return pathDataPs(el.getAttribute("d"));
  const outline = shapeOutline(el);
  return outline === null ? null : outlineToPs(outline);
}

/** Path data → PS path construction; null when the data has no commands. */
export function pathDataPs(d: string | null): string | null {
  const fast = directMlcPathPs(d);
  if (fast !== null) return fast;
  const outline = pathOutline(d);
  return outline === null ? null : outlineToPs(outline);
}

function outlineToPs(o: Outline): string {
  const ops = o.ops;
  const out = new Array<string>(ops.length + 1);
  out[0] = "newpath";
  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i];
    if (op.op === "Z") out[i + 1] = " closepath";
    else if (op.op === "C") out[i + 1] = ` ${fmt(op.x1)} ${fmt(op.y1)} ${fmt(op.x2)} ${fmt(op.y2)} ${fmt(op.x)} ${fmt(op.y)} curveto`;
    else out[i + 1] = ` ${fmt(op.x)} ${fmt(op.y)} ${op.op === "M" ? "moveto" : "lineto"}`;
  }
  return out.join("");
}
