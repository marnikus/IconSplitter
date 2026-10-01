// svg_layout.test.ts — the one layout rule that decides whether a row overlaps
// itself. The row is a grid and its SECOND column holds BOTH thumbnails, so that
// column has to be as wide as the zoom made them. A fixed pixel column made the
// thumbnails overflow into the file / status / review columns beside them as
// soon as the zoom passed it ("overlapping of SVG part, overlapping text as zoom
// bigger"), which no DOM assertion can see — the cascade is the contract, so the
// stylesheet is what this test reads (the same idiom as secret_hygiene.test.ts).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/index.css"), "utf8");

/** The shared grid template of the column header and every row. */
function gridTemplate(): string {
  const block = /\.svg-columns,\s*\.svg-row\s*\{([^}]*)\}/.exec(css);
  expect(block).not.toBeNull();
  const columns = block?.[1].match(/grid-template-columns:\s*([^;]+);/);
  expect(columns).not.toBeNull();
  return (columns?.[1] ?? "").trim();
}

describe("SVG row layout", () => {
  it("sizes the thumbnails column from the zoom, never from a fixed width", () => {
    // Two squares plus the 8px gap of .svg-thumbs, at whatever the zoom is.
    expect(gridTemplate()).toContain("calc(var(--svg-thumb) * 2 + 8px)");
    expect(gridTemplate()).not.toMatch(/\b220px\b/);
  });

  it("keeps the file column flexible and the fixed columns where the design put them", () => {
    const columns = gridTemplate().split(/\s+(?![^(]*\))/);
    expect(columns[0]).toBe("34px");
    expect(columns[2]).toBe("minmax(280px, 1fr)");
    expect(columns.slice(3)).toEqual(["122px", "118px", "130px", "158px", "210px"]);
  });

  it("takes the row height from the same variable, so a zoomed row is never clipped", () => {
    expect(css).toMatch(/\.svg-row\s*\{[^}]*min-height:\s*calc\(var\(--svg-thumb\)\s*\+\s*22px\)/);
  });
});
