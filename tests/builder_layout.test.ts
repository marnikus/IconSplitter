// builder_layout.test.ts — RULE 8: the sheet's geometry. These are the reference
// layout's invariants, rewritten as assertions about OUR numbers: a banner takes
// its own side and leaves the content rect beside it, the grid never exceeds the
// padded content, the fit is 1 exactly when everything fits, and every cell lands
// where the grid says it should. No DOM here — geometry is arithmetic.
import { describe, expect, it } from "vitest";
import { computeLayout, wrapTitle, insidesOf, type LayoutConfig } from "../src/lib/builder/layout";

/** A sheet that fits comfortably: 1000×800, no banner, 4×3 of 120px boxes. */
function base(over: Partial<LayoutConfig> = {}): LayoutConfig {
  return {
    artboard: { width: 1000, height: 800, padding: 40, radius: 0, background: "#fff" },
    grid: { columns: 4, rows: 3, gapX: 20, gapY: 20, captions: false, captionSize: 12 },
    icons: { box: 120 },
    banner: { position: "none", size: 200 },
    ...over,
  } as LayoutConfig;
}

describe("computeLayout — the banner owns one side", () => {
  it.each([
    ["left", { left: 200, top: 0, width: 800, height: 800 }],
    ["right", { left: 0, top: 0, width: 800, height: 800 }],
    ["top", { left: 0, top: 200, width: 1000, height: 600 }],
    ["bottom", { left: 0, top: 0, width: 1000, height: 600 }],
  ])("a %s banner leaves exactly the rest as content", (position, content) => {
    const out = computeLayout(base({ banner: { position, size: 200 } as LayoutConfig["banner"] }));
    expect(out.content).toEqual(content);
    expect(out.banner).not.toBeNull();
  });

  it("no banner leaves the whole artboard as content and reports no banner rect", () => {
    const out = computeLayout(base());
    expect(out.content).toEqual({ left: 0, top: 0, width: 1000, height: 800 });
    expect(out.banner).toBeNull();
  });

  it("a banner is never larger than the axis it sits on", () => {
    const left = computeLayout(base({ banner: { position: "left", size: 4000 } as LayoutConfig["banner"] }));
    expect(left.banner!.width).toBe(1000); // clamped to the artboard's width
    expect(left.banner!.left + left.banner!.width).toBeLessThanOrEqual(1000);
    const top = computeLayout(base({ banner: { position: "top", size: 4000 } as LayoutConfig["banner"] }));
    expect(top.banner!.height).toBe(800); // the other axis has its own limit
  });
});

describe("computeLayout — the grid stays inside the padded content", () => {
  it("fits at scale 1 and reports no overflow when the cells fit", () => {
    const out = computeLayout(base());
    expect(out.fitScale).toBe(1);
    expect(out.overflow).toBe(false);
    expect(out.capacity).toBe(12);
    expect(out.cells).toHaveLength(12);
  });

  it("every cell is inside the padded content when the fit is 1", () => {
    const out = computeLayout(base());
    const inner = insidesOf(base());
    for (const cell of out.cells) {
      expect(cell.left).toBeGreaterThanOrEqual(inner.left - 0.001);
      expect(cell.top).toBeGreaterThanOrEqual(inner.top - 0.001);
      expect(cell.left + cell.width).toBeLessThanOrEqual(inner.left + inner.width + 0.001);
      expect(cell.top + cell.height).toBeLessThanOrEqual(inner.top + inner.height + 0.001);
    }
  });

  it("never exceeds the padded content, even when it has to shrink (reports it)", () => {
    const tight = base({ grid: { columns: 8, rows: 6, gapX: 20, gapY: 20, captions: true, captionSize: 14 } as LayoutConfig["grid"] });
    const out = computeLayout(tight);
    expect(out.overflow).toBe(true);
    expect(out.fitScale).toBeLessThan(1);
    const inner = insidesOf(tight);
    for (const cell of out.cells) {
      expect(cell.left + cell.width).toBeLessThanOrEqual(inner.left + inner.width + 0.001);
      expect(cell.top + cell.height).toBeLessThanOrEqual(inner.top + inner.height + 0.001);
    }
    expect(out.grid).not.toBeNull();
    expect(out.grid!.width).toBeLessThanOrEqual(inner.width + 0.001);
    expect(out.grid!.height).toBeLessThanOrEqual(inner.height + 0.001);
  });

  it("capacity is columns × rows, and one of each is still one cell", () => {
    expect(computeLayout(base({ grid: { columns: 1, rows: 1, gapX: 0, gapY: 0, captions: false, captionSize: 12 } as LayoutConfig["grid"] })).capacity).toBe(1);
    expect(computeLayout(base({ grid: { columns: 3, rows: 5, gapX: 0, gapY: 0, captions: false, captionSize: 12 } as LayoutConfig["grid"] })).cells).toHaveLength(15);
  });

  it("cells are laid out row by row, with the configured gaps", () => {
    const out = computeLayout(base());
    const [first, second, , , fifth] = out.cells;
    expect(first).toMatchObject({ index: 0, column: 0, row: 0 });
    expect(second.column).toBe(1);
    expect(second.left - (first.left + first.width)).toBeCloseTo(20, 6);
    expect(fifth).toMatchObject({ index: 4, column: 0, row: 1 });
    expect(fifth.top - (first.top + first.height)).toBeCloseTo(20, 6);
  });

  it("captions add a block under every icon, and off means zero", () => {
    const off = computeLayout(base());
    const on = computeLayout(base({ grid: { columns: 4, rows: 3, gapX: 20, gapY: 20, captions: true, captionSize: 12 } as LayoutConfig["grid"] }));
    expect(off.cells[0].captionHeight).toBe(0);
    expect(on.cells[0].captionHeight).toBeGreaterThan(0);
    expect(on.cells[0].height).toBeGreaterThan(off.cells[0].height);
  });

  it("a bigger caption leaves a bigger caption block", () => {
    const small = computeLayout(base({ grid: { columns: 4, rows: 3, gapX: 20, gapY: 20, captions: true, captionSize: 8 } as LayoutConfig["grid"] }));
    const large = computeLayout(base({ grid: { columns: 4, rows: 3, gapX: 20, gapY: 20, captions: true, captionSize: 24 } as LayoutConfig["grid"] }));
    expect(large.cells[0].captionHeight).toBeGreaterThan(small.cells[0].captionHeight);
  });

  it("the grid is centred inside the padded content", () => {
    const out = computeLayout(base());
    const inner = insidesOf(base());
    const leftGap = out.grid!.left - inner.left;
    const rightGap = inner.left + inner.width - (out.grid!.left + out.grid!.width);
    expect(leftGap).toBeCloseTo(rightGap, 6);
  });

  it("a banner and padding do not cancel each other out", () => {
    const out = computeLayout(base({ banner: { position: "left", size: 300 } as LayoutConfig["banner"] }));
    const inner = insidesOf(base({ banner: { position: "left", size: 300 } as LayoutConfig["banner"] }));
    expect(inner.left).toBe(340); // 300 banner + 40 padding
    expect(out.cells[0].left).toBeGreaterThanOrEqual(inner.left);
  });
});

describe("computeLayout — refusals are honest", () => {
  it("a zero-size artboard still returns numbers a renderer can use (never NaN)", () => {
    const out = computeLayout(base({ artboard: { width: 0, height: 0, padding: 10, radius: 0, background: "#fff" } as LayoutConfig["artboard"] }));
    expect(Number.isFinite(out.fitScale)).toBe(true);
    for (const cell of out.cells) {
      expect(Number.isFinite(cell.left)).toBe(true);
      expect(Number.isFinite(cell.width)).toBe(true);
    }
  });
});

describe("wrapTitle — the banner never overflows its own width", () => {
  it("keeps a short title on one line", () => {
    expect(wrapTitle("Kitchen", 20)).toEqual(["Kitchen"]);
  });

  it("wraps on word boundaries and caps at three lines", () => {
    expect(wrapTitle("A very long banner title that keeps going past everything", 12)).toHaveLength(3);
    expect(wrapTitle("one two three", 7)).toEqual(["one two", "three"]);
  });

  it("an empty title is one empty line, not zero lines", () => {
    expect(wrapTitle("", 10)).toEqual([""]);
  });
});
