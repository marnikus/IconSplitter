// zoom.test.ts — RULE 10/18: ONE zoom definition for both tabs (I-55). The
// range, the clamp and the size rule live here; Selection V2 and Generate SVG
// persist and mount them, they never define them. The rule is height-driven and
// aspect-preserving: a raster is never upscaled past its own pixels, and a
// vector is sized by its own ratio.
import { describe, expect, it } from "vitest";
import { ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, clampZoom, zoomBox, zoomBoxRatio, zoomLabel } from "../src/lib/zoom";

describe("the zoom range", () => {
  it("is 48..800 px in steps of four, opening at 84", () => {
    expect([ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, ZOOM_DEFAULT]).toEqual([48, 800, 4, 84]);
  });

  it("clamps into the range and snaps onto the step", () => {
    expect(clampZoom(10_000)).toBe(800);
    expect(clampZoom(0)).toBe(48);
    expect(clampZoom(803)).toBe(ZOOM_MAX); // snapping can never push past the cap (800 is on-step)
    expect(clampZoom(799)).toBe(800);
    expect(clampZoom(Number.NaN)).toBe(ZOOM_DEFAULT);
  });

  it("labels the value the way the slider reads it out", () => {
    expect(zoomLabel(800)).toBe("800 px");
  });
});

describe("zoomBox — one box per artwork, aspect preserved (I-55)", () => {
  it("keeps a square square", () => {
    expect(zoomBox(240, { w: 512, h: 512 })).toEqual({ width: 240, height: 240 });
  });

  it("gives a wide artwork the width its own ratio asks for", () => {
    expect(zoomBox(240, { w: 1024, h: 512 })).toEqual({ width: 480, height: 240 });
  });

  it("gives a tall artwork the same height and a narrower box", () => {
    expect(zoomBox(240, { w: 256, h: 512 })).toEqual({ width: 120, height: 240 });
  });

  it("never upscales a raster past its own pixels", () => {
    expect(zoomBox(800, { w: 100, h: 60 })).toEqual({ width: 100, height: 60 });
  });

  it("falls back to a square of the zoom value while the pixels are unknown", () => {
    expect(zoomBox(320, null)).toEqual({ width: 320, height: 320 });
    expect(zoomBox(320, { w: 0, h: 0 })).toEqual({ width: 320, height: 320 });
  });

  it("sizes a vector by its own ratio at the full zoom height", () => {
    expect(zoomBoxRatio(800, 2)).toEqual({ width: 1600, height: 800 });
    expect(zoomBoxRatio(200, 0.5)).toEqual({ width: 100, height: 200 });
  });
});
