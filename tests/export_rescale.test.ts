// export_rescale.test.ts — "rescale the full artboard keeping its ratio"
// (2026-11-17): the root px size moves to the megapixel target, the viewBox
// stays (every coordinate scales with the document), and stroke widths follow
// the factor only when the user ticks "scale strokes proportionally".
import { describe, expect, it } from "vitest";
import { rescaleSvg } from "../src/lib/upload/rescale";
import { jpegTargetSize } from "../src/lib/exportformats";

const sheet = (extra = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">${extra}</svg>`;

describe("rescaleSvg", () => {
  it("moves the root px size to the target and keeps the viewBox", () => {
    const out = rescaleSvg(sheet(), { rescaleMegapixels: 1, rescaleStrokes: true });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.svg).toContain('width="1414"');
    expect(out.svg).toContain('height="707"');
    expect(out.svg).toContain('viewBox="0 0 200 100"');
    expect(out.factor).toBeCloseTo(7.0711, 3);
  });

  it("scales stroke widths with the document when asked", () => {
    const out = rescaleSvg(sheet('<rect x="1" y="1" width="9" height="9" stroke="#000000" stroke-width="2"/>'), { rescaleMegapixels: 1, rescaleStrokes: true });
    expect(out.ok && out.svg).toContain('stroke-width="2"');
  });

  it("keeps the printed stroke px when the proportional box is unticked", () => {
    const src = sheet('<rect x="1" y="1" width="9" height="9" stroke="#000000" stroke-width="2"/>');
    const out = rescaleSvg(src, { rescaleMegapixels: 1, rescaleStrokes: false });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(Number(/stroke-width="([\d.]+)"/.exec(out.svg)?.[1])).toBeCloseTo(2 / 7.0711, 3);
  });

  it("leaves stroke-free and stroke:none shapes alone", () => {
    const src = sheet('<rect x="1" y="1" width="9" height="9" fill="#111111"/><circle cx="5" cy="5" r="2" stroke="none" stroke-width="4"/>');
    const out = rescaleSvg(src, { rescaleMegapixels: 1, rescaleStrokes: false });
    expect(out.ok && out.svg).toContain('stroke-width="4"');
  });

  it("reads the px size from the viewBox when the root carries none", () => {
    const out = rescaleSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="4" height="4"/></svg>', { rescaleMegapixels: 4, rescaleStrokes: true });
    expect(out.ok && out.svg).toContain('width="2000"');
  });

  it("refuses a document with no readable size, untouched", () => {
    const src = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>';
    const out = rescaleSvg(src, { rescaleMegapixels: 4, rescaleStrokes: true });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/size/i);
    expect(out.svg).toBe(src);
  });
});

describe("the JPEG target", () => {
  it("is the artboard itself while the match box is ticked", () => {
    expect(jpegTargetSize(5500, 3000, { jpegMatchArtboard: true, jpegMegapixels: 1 })).toEqual({ width: 5500, height: 3000 });
  });
  it("is the megapixel resolution once unticked — a small artboard never caps it", () => {
    const size = jpegTargetSize(300, 200, { jpegMatchArtboard: false, jpegMegapixels: 1 });
    expect(size.width * size.height).toBeLessThanOrEqual(1_000_000);
    expect(size.width).toBeGreaterThan(300);
  });
});
