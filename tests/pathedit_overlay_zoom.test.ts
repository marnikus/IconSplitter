// pathedit_overlay_zoom.test.ts — the edit overlay keeps its screen size when
// zoomed (2026-11-26). The board zooms with a CSS transform on the preview
// frame; `non-scaling-stroke` cancels only the SVG's own scaling, so handle
// lines, dashes and outlines grew thick with the zoom. Every overlay line width
// and dash is divided by the frame's zoom (`--ov-z`, set on the frame).
import { describe, expect, it } from "vitest";
import { OVERLAY_STROKE_CSS, overlayCss } from "../src/svg/pathedit/overlaymarks";

describe("overlay line widths under the board zoom", () => {
  it("divides every px stroke width and dash by the frame's zoom", () => {
    const css = overlayCss("fill:none;stroke:#1a8cff;stroke-width:1.4px;stroke-dasharray:5 3");
    expect(css).toContain("stroke-width:calc(1.4px / var(--ov-z, 1)) !important");
    expect(css).toContain("stroke-dasharray:calc(5px / var(--ov-z, 1)) calc(3px / var(--ov-z, 1)) !important");
    expect(css).toContain("vector-effect:non-scaling-stroke !important");
    expect(css).toContain("fill:none !important");
  });

  it("the thin view's design outline follows the same rule", () => {
    expect(OVERLAY_STROKE_CSS("1px")).toBe("calc(1px / var(--ov-z, 1))");
  });
});
