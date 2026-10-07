// upload_layout.test.ts — the layout contract behind "no clipped or overlapping
// controls" (RULE 14). A DOM test cannot measure pixels here (happy-dom has no
// layout engine), so this reads the stylesheet the way a reviewer would and
// pins the four properties that made the old panel overlap: nothing in these
// blocks is absolutely positioned, the Gemini card's grid tracks can shrink,
// the prompt editor is tall enough to be read, and no field is pinned to a
// fixed width that its own content can outgrow.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "src", "index.css"), "utf8");

/** Every rule body whose selector list mentions `needle`, in source order. */
function blocks(needle: string): string[] {
  const out: string[] = [];
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css.matchAll(rule)) {
    if (m[1].includes(needle)) out.push(m[2]);
  }
  return out;
}

const body = (needle: string) => blocks(needle).join("\n");
/** The numbers a `prop: value` pair carries (widths, heights, gaps). */
const px = (needle: string, prop: string) =>
  blocks(needle).flatMap((b) => [...b.matchAll(new RegExp(`${prop}:\\s*(-?\\d+)px`, "g"))].map((m) => Number(m[1])));

describe("the upload tab's panel furniture", () => {
  it("never absolutely positions a control inside the prompt panel or the provider card", () => {
    for (const needle of [".up-prompt-panel", ".up-prompt-editor", ".up-preset-row", ".svg-provider", ".up-provider-grid", ".up-provider-check"]) {
      expect(body(needle), needle).not.toContain("position: absolute");
      expect(body(needle), needle).not.toContain("position: fixed");
    }
  });

  it("gives the prompt editor room to read the whole prompt", () => {
    const min = px(".up-prompt-editor", "min-height");
    expect(min.length).toBeGreaterThan(0);
    expect(Math.max(...min)).toBeGreaterThanOrEqual(120);
    // and it can still be resized by hand, never shrunk to an unreadable strip
    expect(body(".up-prompt-editor")).toContain("resize");
  });

  it("lays the provider card out as a grid whose tracks may shrink", () => {
    expect(body(".up-provider-grid")).toContain("grid-template-columns");
    expect(body(".up-provider-grid > *")).toContain("min-width: 0");
    expect(body(".up-provider-check")).toContain("grid-template-columns");
    // the old rule pinned the first field to a fixed 118px — the wrap that made
    // the other fields squeeze. The upload card must not use that class at all,
    // and that pin must not come back for the fields it does use.
    expect(body(".up-provider-grid .svg-field:first-child")).not.toContain("0 0 118px");
  });

  it("keeps the preset rows and the settings button on grid tracks, never on floats", () => {
    expect(body(".up-preset-row")).toContain("grid-template-columns");
    expect(body(".up-preset-row")).toContain("minmax(0, 1fr)");
    expect(body(".up-preset-row.save")).toContain("minmax(0, 1fr)");
    expect(body(".up-prompt-panel")).toContain("min-width");
    expect(body(".up-field-wide")).toContain("grid-column: 1 / -1");
  });
});
