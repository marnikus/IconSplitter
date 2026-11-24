// svg_builder_stage_nav.test.ts — Figma-style stage navigation math
// (2026-11-24): Ctrl/⌘ + wheel zooms smoothly, Ctrl + Shift + wheel steps
// along round percentages, and the point under the cursor stays put.
import { describe, expect, it } from "vitest";
import {
  STAGE_ZOOM_MAX, STAGE_ZOOM_MIN, STAGE_ZOOM_STEPS, clampStageZoom, anchoredScroll, smoothZoom, snapZoom, wheelDelta,
} from "../src/lib/svgBuilder/stagezoom";

describe("stage zoom", () => {
  it("smooth: wheel up zooms in, down zooms out, by the same factor both ways", () => {
    const zin = smoothZoom(1, -100);
    const zout = smoothZoom(1, 100);
    expect(zin).toBeGreaterThan(1);
    expect(zout).toBeLessThan(1);
    expect(zin * zout).toBeCloseTo(1, 2);
  });

  it("smooth: a tiny trackpad delta still moves the zoom (no 0.01 rounding stall)", () => {
    expect(smoothZoom(0.1, -2)).toBeGreaterThan(0.1);
    expect(smoothZoom(0.5, 2)).toBeLessThan(0.5);
  });

  it("smooth: clamped to the stage range", () => {
    expect(smoothZoom(STAGE_ZOOM_MAX, -1000)).toBe(STAGE_ZOOM_MAX);
    expect(smoothZoom(STAGE_ZOOM_MIN, 1000)).toBe(STAGE_ZOOM_MIN);
  });

  it("snap: steps to the next round percentage in the wheel's direction", () => {
    expect(STAGE_ZOOM_STEPS.slice(0, 4)).toEqual([0.1, 0.25, 0.5, 0.75]);
    expect(snapZoom(1, -1)).toBe(1.5);
    expect(snapZoom(1, 1)).toBe(0.75);
    expect(snapZoom(0.37, -1)).toBe(0.5);
    expect(snapZoom(0.37, 1)).toBe(0.25);
    expect(snapZoom(1.15, 1)).toBe(1);
    expect(snapZoom(0.1, 1)).toBe(0.1);
    expect(snapZoom(STAGE_ZOOM_MAX, -1)).toBe(STAGE_ZOOM_MAX);
  });

  it("wheelDelta: Shift moves the wheel into deltaX on Windows; line mode is ×16", () => {
    expect(wheelDelta({ deltaX: 0, deltaY: 100, deltaMode: 0 })).toBe(100);
    expect(wheelDelta({ deltaX: -100, deltaY: 0, deltaMode: 0 })).toBe(-100);
    expect(wheelDelta({ deltaX: 0, deltaY: 3, deltaMode: 1 })).toBe(48);
  });

  it("clamp: range 10 %–800 %, garbage → 100 %", () => {
    expect(clampStageZoom(0.01)).toBe(STAGE_ZOOM_MIN);
    expect(clampStageZoom(50)).toBe(STAGE_ZOOM_MAX);
    expect(clampStageZoom(Number.NaN)).toBe(1);
    expect(clampStageZoom(1.23456)).toBe(1.235);
  });

  it("anchoredScroll: the artboard point under the cursor stays under it", () => {
    // artboard left edge at screen x 100, cursor at 300 → artboard x 200 at zoom 1.
    // At zoom 2 that point sits 400 px from the edge: the edge must move to −100 → scroll +200.
    expect(anchoredScroll({ scroll: 50, cursor: 300, edge: 100, point: 200, zoom: 2 })).toBe(250);
  });
});
