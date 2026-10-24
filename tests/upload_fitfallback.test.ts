import { describe, expect, it } from "vitest";
import { recoverPinnedFit } from "../src/lib/upload/placefallback";
import { placeArtwork } from "../src/lib/upload/place";
import { fitArtboard } from "../src/lib/upload/geom";
import type { PlaceWant } from "../src/lib/upload/place";
const source = () => new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 1h10v10" fill="none" stroke="#000" stroke-width="1" stroke-linecap="round"/></svg>', 'image/svg+xml').documentElement;
const bounds = { minX: 0, minY: 0, width: 12, height: 12 };
const base: PlaceWant = { paddingPct: 0, target: null, style: { widthPx: 2, color: null }, expand: false };
describe("verified pinned-artboard recovery", () => {
  it("does not pretend the pinned solver applies to content or MP layouts", () => {
    for (const target of [null, { megapixels: 5 }]) {
      const want = { ...base, target };
      expect(recoverPinnedFit(want, fitArtboard(bounds, 0, target), () => placeArtwork(source(), want))).toBeNull();
    }
  });
  it("refuses an impossible stroke/artboard instead of changing the requested stroke or cropping", () => {
    const want = { ...base, target: { width: 20, height: 20 }, style: { widthPx: 50, color: null } };
    const result = placeArtwork(source(), want);
    expect(result.ok).toBe(false);
    if (result && !result.ok) expect(result.detail).toMatch(/no room|cannot fit|visible geometry/);
  });
  it("propagates unsupported real source geometry without a silent raster fallback", () => {
    const r = source(); r.innerHTML = '<text>unsupported</text>';
    const want = { ...base, target: { width: 20, height: 20 } };
    const result = placeArtwork(r, want);
    expect(result?.ok).toBe(false);
  });
});
