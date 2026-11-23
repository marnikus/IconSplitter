// eps_rescale_target.test.ts — "Rescale artboard to MP" reaches the EPS (2026-11-23).
// An EPS page is measured in points, and Illustrator and the stock sites count
// one point as one px: a rescaled EPS page is therefore the rescale target in
// POINTS (2000×1000 @ 16 MP → 5657×2828 pt ≈ 16 MP), for both converters.
// Without a rescale the EPS keeps the document's px→pt size (0.75).
import { describe, expect, it } from "vitest";
import { epsInputSvg } from "../src/lib/upload/rescale";
import { buildSheetPackage } from "../src/svgBuilder/sheetpackage";
import { DEFAULT_UPLOAD_SETTINGS, type UploadSettings } from "../src/lib/upload/settings";
import { builtinConverter } from "../src/lib/upload/epsconv/builtin";

const SHEET = '<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1000" viewBox="0 0 2000 1000"><rect width="2000" height="1000" fill="#f4f0e7"/><rect x="100" y="100" width="300" height="200" fill="#123456"/></svg>';

async function epsBox(patch: Partial<UploadSettings>): Promise<{ w: number; h: number; given: string }> {
  let given = "";
  const out = await buildSheetPackage({ svg: SHEET, metadata: null, settings: { ...DEFAULT_UPLOAD_SETTINGS, includeEps: true, ...patch },
    folder: "f", stem: "s", pairId: "p", now: "2026-11-23T00:00:00.000Z", prompt: "", model: "" },
  { pngBlob: async () => new Blob(["x"]), eps: (input) => { given = input.svg; return builtinConverter.convert(input, { bridgeUrl: "", fetch: async () => new Response("") }); } });
  const text = new TextDecoder().decode(out.files.find((f) => f.name.endsWith(".eps"))!.bytes);
  const [, , w, h] = /%%HiResBoundingBox: ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)/.exec(text)!.slice(1).map(Number);
  return { w, h, given };
}

describe("the EPS follows Rescale artboard to MP (2026-11-23)", () => {
  it("2000×1000 rescaled to 16 MP gives an EPS page of about 16 MP in points", async () => {
    const { w, h } = await epsBox({ rescaleArtboard: true, rescaleMegapixels: 16 });
    expect(Math.round(w)).toBeGreaterThanOrEqual(5655);
    expect(Math.round(w)).toBeLessThanOrEqual(5658);
    expect(w / h).toBeCloseTo(2, 2);
    expect(w * h).toBeGreaterThan(15.9e6);
    expect(w * h).toBeLessThanOrEqual(16.01e6);
  });

  it("any target: the page area in points is the target MP", async () => {
    for (const mp of [4, 9, 25]) {
      const { w, h } = await epsBox({ rescaleArtboard: true, rescaleMegapixels: mp });
      expect(w * h / 1e6, `${mp} MP`).toBeGreaterThan(mp * 0.995);
      expect(w * h / 1e6, `${mp} MP`).toBeLessThan(mp * 1.005);
    }
  });

  it("without a rescale the EPS keeps the document's px → pt size", async () => {
    const { w, h } = await epsBox({});
    expect([w, h]).toEqual([1500, 750]);
  });

  it("hands every converter a document whose px page is the target × 4/3 (Inkscape maps px to pt by 0.75 too)", async () => {
    const { given } = await epsBox({ rescaleArtboard: true, rescaleMegapixels: 16 });
    const w = Number(/width="([\d.]+)"/.exec(given)![1]);
    expect(w * 0.75).toBeGreaterThan(5655);
    expect(given).toContain('viewBox="0 0 5656.9 2828.4"'); // rescaled directly to 1-decimal target coordinates (RULE 26)
    expect(epsInputSvg(SHEET, false)).toBe(SHEET);
  });
});
