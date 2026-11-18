// upload_prepare_text_rescale.test.ts — the SVG to upload flow grows the two
// new options (2026-11-17): expand-text outlines every <text> of the finished
// export copy, rescale moves the whole artboard to the megapixel target, and
// either one ends the "ships as is" shortcut.
import { afterEach, describe, expect, it } from "vitest";
import { prepareExportSvg } from "../src/lib/upload/prepare";
import { DEFAULT_UPLOAD_SETTINGS, type UploadSettings } from "../src/lib/upload/settings";
import { setTextOutliner } from "../src/lib/upload/expandtext";

const SOURCE = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect x="10" y="10" width="40" height="40" fill="#222222"/><text x="10" y="90" fill="#123456" font-size="12">Hi</text></svg>';

afterEach(() => setTextOutliner(null));

const settings = (patch: Partial<UploadSettings>): UploadSettings => ({ ...DEFAULT_UPLOAD_SETTINGS, ...patch });

describe("expand text to fills on the upload side", () => {
  it("outlines every text run of the export copy when on", () => {
    setTextOutliner(() => ({ d: "M0 0 L40 0", width: 40 }));
    const out = prepareExportSvg(SOURCE, settings({ expandText: true }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.svg).not.toContain("<text");
    expect(out.svg).toMatch(/<path/);
  });

  it("refuses live text exactly as before when off", () => {
    const out = prepareExportSvg(SOURCE, settings({}));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.detail).toMatch(/text/);
  });

  it("fails the icon honestly when a run cannot be outlined", () => {
    setTextOutliner(() => null);
    const out = prepareExportSvg(SOURCE, settings({ expandText: true }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.detail).toMatch(/outliner|outline/i);
  });
});

const NO_TEXT = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect x="10" y="10" width="40" height="40" fill="#222222"/></svg>';

describe("rescale the full artboard on the upload side", () => {
  it("moves the export copy's px size to the target, ratio kept", () => {
    const out = prepareExportSvg(NO_TEXT, settings({ rescaleArtboard: true, rescaleMegapixels: 1 }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const width = Number(/width="([\d.]+)"/.exec(out.svg)?.[1]);
    const height = Number(/height="([\d.]+)"/.exec(out.svg)?.[1]);
    expect(width).toBeCloseTo(height, 0);
    expect(width * height).toBeLessThanOrEqual(1_000_000);
    expect(width).toBeGreaterThan(900);
  });

  it("keeps the artboard untouched when off, and ends the as-is shortcut when on", () => {
    const AS_IS = { background: "default", paddingPct: null, strokeColor: "artwork", artboard: { mode: "source", size: 0, width: 0, height: 0 } } as const;
    const asIsSource = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="1" y="1" width="8" height="8" fill="#222222"/></svg>';
    const plain = prepareExportSvg(asIsSource, settings({ ...AS_IS }));
    expect(plain.ok && plain.asIs).toBe(true);
    const scaled = prepareExportSvg(asIsSource, settings({ ...AS_IS, rescaleArtboard: true }));
    expect(scaled.ok && scaled.asIs).toBe(false);
  });
});
