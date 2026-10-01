// svgcomposite.test.ts — square contact-sheet cells and aspect-preserving fit
// (batch spec §3): equal squares, consistent padding, centered, never cropped.
import { describe, expect, it } from "vitest";
import { compositeCells, fitRect } from "../src/lib/svgcomposite";
import { gridFor } from "../src/lib/svggrid";

describe("compositeCells", () => {
  it("lays a 2x2 grid of equal squares over the canvas", () => {
    const cells = compositeCells(gridFor(4), 512);
    expect(cells).toHaveLength(4);
    expect(cells.map((c) => c.size)).toEqual([256, 256, 256, 256]);
    expect(cells[3]).toMatchObject({ index: 3, x: 256, y: 256 });
  });

  it("a 3-image batch still gets the full 2x2 sheet; the empty cell is just unused", () => {
    const cells = compositeCells(gridFor(3), 400);
    expect(cells).toHaveLength(4);
    expect(cells[0]).toMatchObject({ index: 0, x: 0, y: 0, size: 200 });
  });
});

describe("fitRect", () => {
  it("centers a wide image and preserves its aspect ratio", () => {
    const [cell] = compositeCells(gridFor(1), 400);
    const r = fitRect(cell, 200, 100, 20);
    expect(r.w).toBe(360); // 400 - 2*20 padding
    expect(r.h).toBe(180); // half of the width
    expect(r.x).toBe(20);
    expect(r.y).toBe((400 - 180) / 2);
  });

  it("a tall image is limited by the cell height, not the width", () => {
    const [cell] = compositeCells(gridFor(1), 400);
    const r = fitRect(cell, 100, 200, 20);
    expect(r.h).toBe(360);
    expect(r.w).toBe(180);
    expect(r.x).toBe((400 - 180) / 2);
    expect(r.y).toBe(20);
  });
});
