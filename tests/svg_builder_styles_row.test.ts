// svg_builder_styles_row.test.ts — STYLES in the pinned header (2026-11-23): its
// label and dropdown sit on ONE row (the shared MultiSelect stacks them elsewhere).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/svgBuilder/svgBuilder.css"), "utf8");
/** Declarations of `selector`'s rule block. */
const rule = (selector: string) => new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\>]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";

describe("STYLES on one row in the builder header (2026-11-23)", () => {
  it("lays the label and the dropdown side by side, the label without its stacked gap", () => {
    expect(rule(".bld-header-index .multi-select")).toMatch(/display:\s*inline-flex/);
    expect(rule(".bld-header-index .multi-select")).toMatch(/align-items:\s*center/);
    expect(rule(".bld-header-index .multi-select > .svg-label")).toMatch(/margin-bottom:\s*0/);
  });
});
