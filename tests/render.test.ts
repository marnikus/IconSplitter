// RULE 8 — squareInfo / cropRect are pure geometry; run the real functions.
import { describe, expect, it } from "vitest";
import { cropRect, squareInfo, type SquareInfo } from "../src/lib/render";
import type { Box } from "../src/lib/detect";

const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h, ink: 1 });

describe("squareInfo — shared export square", () => {
  it("content is the largest icon side; total adds padding percent on both sides", () => {
    const sq = squareInfo([box(0, 0, 100, 40), box(0, 0, 60, 80)], 10);
    expect(sq.content).toBe(100);
    expect(sq.total).toBe(120); // 100 * (1 + 2*10/100)
  });

  it("zero padding leaves content untouched; content never below 1", () => {
    expect(squareInfo([box(0, 0, 50, 50)], 0).total).toBe(50);
    expect(squareInfo([], 10).content).toBe(1);
  });
});

describe("cropRect — centred square around the box", () => {
  it("centres the square on the box centre", () => {
    const sq: SquareInfo = { content: 100, total: 120 };
    const r = cropRect(box(50, 60, 20, 40), sq.total);
    expect(r.x).toBe(50 + 10 - 60); // cx - total/2
    expect(r.y).toBe(60 + 20 - 60); // cy - total/2
    expect(r.size).toBe(120);
  });
});
