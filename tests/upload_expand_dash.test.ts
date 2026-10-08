// upload_expand_dash.test.ts — arc length, cubic splitting and dash pieces
// for the stroke expander (2026-10-09, design D4 "Dashes (v1)"): a dash
// boundary inside a curve is a real split point of that cubic, never a chord;
// every piece is capped like the browser caps a dash.
import { describe, expect, it } from "vitest";
import { segLength, splitAtLength } from "../src/lib/upload/geom/expand/arclen";
import { dashPieces, normalizeDash } from "../src/lib/upload/geom/expand/dash";
import { expandOutline, subpathsOf, type Pen } from "../src/lib/upload/geom/expand/assemble";
import { pathOutline, type Outline } from "../src/lib/upload/geom/outline";
import type { Seg } from "../src/lib/upload/geom/expand/pen";
import { area } from "./helpers/outlinemath";

const K = 0.5522847498 * 10;
const quarter: Seg = { kind: "C", p0: [10, 0], p1: [10, K], p2: [K, 10], p3: [0, 10] };
const line: Seg = { kind: "L", a: [0, 0], b: [10, 0] };
const pen = (over: Partial<Pen> = {}): Pen => ({ width: 2, cap: "butt", join: "miter", miter: 4, ...over });
const sub = (d: string) => subpathsOf(pathOutline(d) as Outline)[0];

describe("arc length and splitting", () => {
  it("a line and a KAPPA quarter circle (πr/2 within 2e-4 relative — the cubic's own deviation from the arc)", () => {
    expect(segLength(line)).toBe(10);
    expect(Math.abs(segLength(quarter) - (Math.PI * 10) / 2) / ((Math.PI * 10) / 2)).toBeLessThan(2e-4);
  });

  it("splitAt returns two cubics that meet, whose lengths add up, split where the length says", () => {
    const [a, b] = splitAtLength(quarter, 5);
    expect(a.kind).toBe("C");
    expect(b.kind).toBe("C");
    if (a.kind !== "C" || b.kind !== "C") return;
    expect(a.p3).toEqual(b.p0);
    expect(Math.abs(segLength(a) - 5)).toBeLessThan(1e-3);
    expect(Math.abs(segLength(a) + segLength(b) - segLength(quarter))).toBeLessThan(1e-3);
    expect(Math.abs(Math.hypot(a.p3[0], a.p3[1]) - 10)).toBeLessThan(0.003); // still ON the cubic (a KAPPA quarter sits within 0.027 % of the arc)
  });
});

describe("the dash pattern", () => {
  it("normalises like SVG: odd arrays repeat, all-zero is solid, a negative value is refused by name", () => {
    expect(normalizeDash("4 2", "0")).toEqual({ ok: true, pattern: [4, 2], offset: 0 });
    expect(normalizeDash("3", null)).toEqual({ ok: true, pattern: [3, 3], offset: 0 });
    expect(normalizeDash("4, 2", "3")).toEqual({ ok: true, pattern: [4, 2], offset: 3 });
    expect(normalizeDash("0 0", null)).toEqual({ ok: true, pattern: null, offset: 0 });
    expect(normalizeDash("none", null)).toEqual({ ok: true, pattern: null, offset: 0 });
    expect(normalizeDash(null, null)).toEqual({ ok: true, pattern: null, offset: 0 });
    expect(normalizeDash("4 -2", null)).toEqual({ ok: false, reason: "a negative stroke-dasharray value (4 -2)" });
    expect(normalizeDash("0.001 0.001", null)).toEqual({ ok: false, reason: "a stroke-dasharray period under 0.01 px (0.001 0.001)" });
  });

  it("[4 2] on a 10-long line → pieces [0,4] and [6,10]; dashoffset shifts the phase", () => {
    const pieces = dashPieces(sub("M0 0L10 0"), [4, 2], 0);
    expect(pieces.map((p) => [p.segs[0].kind === "L" ? p.segs[0].a[0] : NaN, p.segs.at(-1)!.kind === "L" ? (p.segs.at(-1) as { b: number[] }).b[0] : NaN]))
      .toEqual([[0, 4], [6, 10]]);
    const shifted = dashPieces(sub("M0 0L10 0"), [4, 2], 1);
    expect(shifted.map((p) => [(p.segs[0] as { a: number[] }).a[0], (p.segs.at(-1) as { b: number[] }).b[0]])).toEqual([[0, 3], [5, 9]]);
    expect(pieces.every((p) => !p.closed)).toBe(true);
  });

  it("a closed dashed square opens at its phase; the dash that wraps the start is ONE piece", () => {
    const pieces = dashPieces(sub("M0 0L10 0L10 10L0 10Z"), [6, 4], 2);
    // phase 2 into a 6-on: on 0..4, off 4..8, on 8..14, off 14..18, on 18..24, off 24..28, on 28..34, off 34..38, on 38..40 — wraps into 0..4
    expect(pieces).toHaveLength(4);
    expect(pieces.every((p) => !p.closed)).toBe(true);
    const total = pieces.reduce((s, p) => s + p.segs.reduce((t, g) => t + segLength(g), 0), 0);
    expect(total).toBeCloseTo(4 + 6 + 6 + 6 + 2, 6);
  });
});

describe("dashes through the expander", () => {
  it("every piece is capped (round → two cubics per piece end), and the butt-capped area is Σ length × width within 0.1 %", () => {
    const o = pathOutline("M0 0L10 0") as Outline;
    const round = expandOutline(o, pen({ cap: "round" }), { pattern: [4, 2], offset: 0 });
    expect(round.ops.filter((op) => op.op === "C")).toHaveLength(8); // 2 pieces × 2 ends × 2 cubics
    const butt = expandOutline(o, pen(), { pattern: [4, 2], offset: 0 });
    expect(Math.abs(Math.abs(area(butt)) - 16) / 16).toBeLessThan(0.001);
  });

  it("a dash boundary inside a curve splits the cubic — the piece ends ON the circle", () => {
    const k = 0.5522847498 * 10;
    const circle = pathOutline(`M10 0C10 ${k} ${k} 10 0 10C${-k} 10 -10 ${k} -10 0C-10 ${-k} ${-k} -10 0 -10C${k} -10 10 ${-k} 10 0Z`) as Outline;
    const pieces = dashPieces(subpathsOf(circle)[0], [7, 3], 0);
    for (const p of pieces) {
      const last = p.segs.at(-1)!;
      const end = last.kind === "L" ? last.b : last.p3;
      expect(Math.abs(Math.hypot(end[0], end[1]) - 10)).toBeLessThan(0.003);
    }
    const circumference = subpathsOf(circle)[0].segs.reduce((s, g) => s + segLength(g), 0);
    const want = 6 * 7 + (circumference - 60); // six full [7 3] periods, then the wrapping dash that merges with the first
    const total = pieces.reduce((s, p) => s + p.segs.reduce((t, g) => t + segLength(g), 0), 0);
    expect(Math.abs(total - want)).toBeLessThan(0.01);
  });
});
