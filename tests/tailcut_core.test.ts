// tailcut_core.test.ts — the tail cutter algorithm (2026-11-06). A generated
// SVG often has a line whose END pierces another line a little: a short tail
// past the crossing. A tail is the stretch from the first crossing to an open
// end, at most `tolerance` long (the icon's own units). Cutting trims the path
// exactly at the crossing and changes nothing else; closed shapes have no ends.
import { describe, expect, it } from "vitest";
import { cutTails, findTails } from "../src/lib/tailcut";
import { withPathDs } from "../src/lib/pathedit/svgdoc";

const svg = (body: string) => `<svg viewBox="0 0 100 100">${body}</svg>`;

describe("finding tails", () => {
  it("a door line that pokes 5 units through the floor is a tail", () => {
    const src = svg('<path d="M0 50L100 50"/><path d="M40 10L40 55"/>');
    const tails = findTails(src, 10);
    expect(tails).toHaveLength(1);
    expect(tails[0]).toMatchObject({ shape: 1, end: "end" });
    expect(tails[0].cut.x).toBeCloseTo(40);
    expect(tails[0].cut.y).toBeCloseTo(50);
    expect(tails[0].length).toBeCloseTo(5);
    expect(tails[0].box).toEqual({ x: 40, y: 50, width: 0, height: 5 });
  });

  it("finds a tail at the start of a path too, and on a curve", () => {
    expect(findTails(svg('<path d="M0 50L100 50"/><path d="M40 53L40 10"/>'), 10)[0]).toMatchObject({ shape: 1, end: "start" });
    const curve = findTails(svg('<path d="M0 50L100 50"/><path d="M20 10C20 30 30 40 30 56"/>'), 10);
    expect(curve).toHaveLength(1);
    expect(curve[0].cut.y).toBeCloseTo(50, 1);
  });

  it("is not a tail: longer than the tolerance, an end exactly on the line, a closed shape, no crossing", () => {
    expect(findTails(svg('<path d="M0 50L100 50"/><path d="M40 10L40 75"/>'), 10)).toHaveLength(0);
    expect(findTails(svg('<path d="M0 50L100 50"/><path d="M40 10L40 50"/>'), 10)).toHaveLength(0);
    expect(findTails(svg('<path d="M0 50L100 50"/><circle cx="40" cy="50" r="3"/>'), 10)).toHaveLength(0);
    expect(findTails(svg('<path d="M0 50L100 50"/><path d="M40 10L40 40"/>'), 10)).toHaveLength(0);
  });

  it("the tolerance decides", () => {
    const src = svg('<path d="M0 50L100 50"/><path d="M40 10L40 58"/>');
    expect(findTails(src, 5)).toHaveLength(0);
    expect(findTails(src, 8.5)).toHaveLength(1);
  });

  it("both ends of one line, and a roof corner where a wall pokes through", () => {
    const both = findTails(svg('<path d="M0 20L100 20"/><path d="M0 80L100 80"/><path d="M50 17L50 84"/>'), 10);
    expect(both.map((t) => t.end).sort()).toEqual(["end", "start"]);
    const roof = findTails(svg('<path d="M10 40L50 10L90 40"/><path d="M20 30L20 90"/>'), 10);
    expect(roof).toHaveLength(1);
    expect(roof[0].cut.y).toBeCloseTo(32.5);
  });
});

describe("cutting tails", () => {
  it("trims the line at the crossing and leaves everything else byte for byte", () => {
    const src = svg('<path d="M0 50L100 50"/><path stroke="red" d="M40 10L40 55"/><circle cx="5" cy="5" r="2"/>');
    expect(cutTails(src, findTails(src, 10))).toBe(svg('<path d="M0 50L100 50"/><path stroke="red" d="M40 10L40 50"/><circle cx="5" cy="5" r="2"/>'));
  });

  it("cuts both ends of one line", () => {
    const src = svg('<path d="M0 20L100 20"/><path d="M0 80L100 80"/><path d="M50 17L50 84"/>');
    expect(cutTails(src, findTails(src, 10))).toContain('<path d="M50 20L50 80"/>');
  });

  it("a cut curve keeps its shape up to the crossing", () => {
    const src = svg('<path d="M0 50L100 50"/><path d="M20 10C20 30 30 40 30 56"/>');
    const out = cutTails(src, findTails(src, 10)) as string;
    const d = /<path d="(M20 10C[^"]+)"/.exec(out)?.[1] ?? "";
    expect(d).toMatch(/^M20 10C/);
    expect(Number(d.split(" ").at(-1))).toBeCloseTo(50, 1);
  });

  it("a <line> with a tail becomes the trimmed path; nothing to cut gives null", () => {
    const src = svg('<path d="M0 50L100 50"/><line x1="60" y1="20" x2="60" y2="54" stroke-width="2"/>');
    expect(cutTails(src, findTails(src, 10))).toContain('<path d="M60 20L60 50" stroke-width="2"/>');
    expect(cutTails(src, [])).toBeNull();
  });
});

describe("the one-pass write", () => {
  it("a shape with its own closing tag becomes a <path> with a closing </path>", () => {
    expect(withPathDs('<svg><line x1="0" y1="0" x2="5" y2="5" ></line></svg>', new Map([[0, "M1 1L2 2"]])))
      .toBe('<svg><path d="M1 1L2 2" ></path></svg>');
  });
});

describe("what a tail is made of (for the highlight)", () => {
  it("carries its tip (the open end) and the exact path from the tip to the crossing", () => {
    const [tail] = findTails(svg('<path d="M0 50L100 50"/><path d="M40 10L40 55"/>'), 10);
    expect(tail.tip).toEqual({ x: 40, y: 55 });
    expect(tail.path[0]).toEqual(tail.tip);
    expect(tail.path.at(-1)).toEqual(tail.cut);
    expect(tail.path).toHaveLength(2);
  });

  it("follows a curved tail point by point, from the tip to the crossing", () => {
    const [tail] = findTails(svg('<path d="M0 50L100 50"/><path d="M20 10C20 30 30 40 30 56"/>'), 10);
    expect(tail.tip).toEqual({ x: 30, y: 56 });
    expect(tail.path.length).toBeGreaterThan(2);
    expect(tail.path.at(-1)?.y).toBeCloseTo(50, 1);
    expect(tail.path.every((p) => p.y >= 50 - 1e-6 && p.y <= 56 + 1e-6)).toBe(true);
  });

  it("a tail at the start of a path has the start as its tip", () => {
    const [tail] = findTails(svg('<path d="M0 50L100 50"/><path d="M40 53L40 10"/>'), 10);
    expect(tail.tip).toEqual({ x: 40, y: 53 });
  });
});
