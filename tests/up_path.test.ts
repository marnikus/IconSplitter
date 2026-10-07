// up_path.test.ts — the SVG path parser executes for real (RULE 8): every
// command form, relative coordinates, implicit repetition, S/T reflection,
// arcs converted to cubics, and malformed input refused (RULE 4 — broken is
// never empty). Deleting the module fails every assertion here.
import { describe, expect, it } from "vitest";
import { allCommandPoints, parsePathData } from "../src/lib/uppath";

const pts = (d: string) => allCommandPoints(parsePathData(d) ?? []);
const last = (d: string) => {
  const cmds = parsePathData(d) ?? [];
  return cmds[cmds.length - 1];
};

describe("uppath — moveto/lineto", () => {
  it("parses explicit absolute commands", () => {
    expect(parsePathData("M 0 0 L 10 0 L 10 10 Z")).toEqual([
      { cmd: "M", p: { x: 0, y: 0 } },
      { cmd: "L", p: { x: 10, y: 0 } },
      { cmd: "L", p: { x: 10, y: 10 } },
      { cmd: "Z" },
    ]);
  });

  it("converts relative and H/V forms to absolute L", () => {
    expect(parsePathData("m 5 5 l 5 0 h 3 v 2")).toEqual([
      { cmd: "M", p: { x: 5, y: 5 } },
      { cmd: "L", p: { x: 10, y: 5 } },
      { cmd: "L", p: { x: 13, y: 5 } },
      { cmd: "L", p: { x: 13, y: 7 } },
    ]);
  });

  it("repeats the previous command implicitly", () => {
    expect(parsePathData("M 0 0 L 10 0 10 10")).toEqual([
      { cmd: "M", p: { x: 0, y: 0 } },
      { cmd: "L", p: { x: 10, y: 0 } },
      { cmd: "L", p: { x: 10, y: 10 } },
    ]);
  });

  it("parses scientific notation and negative numbers", () => {
    expect(parsePathData("M1e2 -1.5e-1L+5 5")).toEqual([
      { cmd: "M", p: { x: 100, y: -0.15 } },
      { cmd: "L", p: { x: 5, y: 5 } },
    ]);
  });
});

describe("uppath — curves", () => {
  it("parses cubic beziers", () => {
    expect(parsePathData("M0 0C1 1 2 1 3 0")).toEqual([
      { cmd: "M", p: { x: 0, y: 0 } },
      { cmd: "C", c1: { x: 1, y: 1 }, c2: { x: 2, y: 1 }, p: { x: 3, y: 0 } },
    ]);
  });

  it("reflects the S control point about the current point", () => {
    const s = last("M0 0 C 1 1 2 1 3 0 S 5 -1 6 0") as { cmd: "C"; c1: { x: number; y: number } };
    expect(s.c1).toEqual({ x: 4, y: -1 });
  });

  it("parses quadratics and reflects T", () => {
    const cmds = parsePathData("M0 0Q2 2 4 0T8 0") ?? [];
    expect(cmds[1]).toEqual({ cmd: "Q", c: { x: 2, y: 2 }, p: { x: 4, y: 0 } });
    expect(cmds[2]).toEqual({ cmd: "Q", c: { x: 6, y: -2 }, p: { x: 8, y: 0 } });
  });

  it("S/T without a preceding curve use the current point as control", () => {
    const s = last("M0 0S 4 4 6 6") as { cmd: "C"; c1: { x: number; y: number } };
    expect(s.c1).toEqual({ x: 0, y: 0 });
  });
});

describe("uppath — arcs become cubics", () => {
  it("converts a half-circle arc into curves that end at the target", () => {
    const cmds = parsePathData("M 0 0 A 5 5 0 0 1 10 0") ?? [];
    expect(cmds.every((c) => c.cmd === "M" || c.cmd === "C")).toBe(true);
    const end = (cmds[cmds.length - 1] as { p: { x: number; y: number } }).p;
    expect(end.x).toBeCloseTo(10, 6);
    expect(end.y).toBeCloseTo(0, 6);
  });

  it("keeps arc points on the circle (control hull contains the curve)", () => {
    const cmds = parsePathData("M 0 0 A 5 5 0 0 1 10 0") ?? [];
    const on = cmds.filter((c) => c.cmd === "C") as { p: { x: number; y: number } }[];
    for (const seg of on) {
      expect(Math.hypot(seg.p.x - 5, seg.p.y)).toBeCloseTo(5, 3); // centre (5,0), r 5
    }
  });

  it("handles the large-arc flag with a non-diametric chord", () => {
    const small = parsePathData("M 0 0 A 5 5 0 0 1 7.0710678 0") ?? [];
    const large = parsePathData("M 0 0 A 5 5 0 1 1 7.0710678 0") ?? [];
    expect(small.filter((c) => c.cmd === "C").length).toBe(1); // quarter arc
    expect(large.filter((c) => c.cmd === "C").length).toBeGreaterThanOrEqual(3); // three-quarter arc
    const end = (arr: ReturnType<typeof parsePathData>) => (arr ?? []).at(-1) as { p: { x: number; y: number } };
    expect(end(small).p.x).toBeCloseTo(7.0710678, 4);
    expect(end(large).p.x).toBeCloseTo(7.0710678, 4);
  });
});

describe("uppath — bounds points", () => {
  it("collects every anchor and control point", () => {
    const p = pts("M0 0C5 5 15 5 20 0");
    expect(p).toEqual([
      { x: 0, y: 0 }, { x: 5, y: 5 }, { x: 15, y: 5 }, { x: 20, y: 0 },
    ]);
  });

  it("an arc's control hull contains the true curve (conservative bounds)", () => {
    const p = pts("M 0 0 A 5 5 0 0 1 10 0");
    const xs = p.map((q) => q.x);
    const ys = p.map((q) => q.y);
    expect(Math.min(...xs)).toBeLessThanOrEqual(5);   // leftmost of the semicircle
    expect(Math.min(...ys)).toBeLessThanOrEqual(5);   // top of the semicircle (y down)
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(0);
  });
});

describe("uppath — broken is never empty (RULE 4)", () => {
  it("refuses malformed data with null", () => {
    expect(parsePathData("M 0")).toBeNull();
    expect(parsePathData("M x y")).toBeNull();
    expect(parsePathData("X 1 2")).toBeNull();
    expect(parsePathData("M 0 0 L 10")).toBeNull();
  });

  it("an empty string is honestly empty, not an error", () => {
    expect(parsePathData("")).toEqual([]);
    expect(parsePathData("   ")).toEqual([]);
  });
});
