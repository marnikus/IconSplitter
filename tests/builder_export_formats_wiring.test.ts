// builder_export_formats_wiring.test.ts — the parts that make the builder's
// Export settings behave like the SVG to upload tab's (2026-11-19): the EPS
// text-outline stage that lets a sheet with a banner and captions ship a real
// EPS, the builder's own settings (no upload decoration leaks in), the
// artboard-aware JPEG box and the one-line format summary. Written FIRST (RED).
import { describe, expect, it, afterEach } from "vitest";
import {
  DEFAULT_FORMAT_OPTIONS, formatSummary, jpegBoxFor, rescaledArtboard, type ExportFormatOptions,
} from "../src/lib/exportformats";
import { outlineForEps, needsTextFonts, EPS_TEXT_FIX } from "../src/lib/svgBuilder/epsoutline";
import { builderExportSettings } from "../src/svgBuilder/formatwiring";
import { setTextOutliner } from "../src/lib/upload/expandtext";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";

const SHEET = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">'
  + '<rect width="200" height="100" fill="#ffffff"/>'
  + '<text x="10" y="50" fill="#123456" font-size="12">Hi</text></svg>';

const opts = (patch: Partial<ExportFormatOptions> = {}): ExportFormatOptions => ({ ...DEFAULT_FORMAT_OPTIONS, ...patch });

afterEach(() => setTextOutliner(null));

describe("outlineForEps", () => {
  it("outlines live text for the built-in writer and reports it as one fix", () => {
    setTextOutliner(() => ({ d: "M0 0 L40 0", width: 40 }));
    const out = outlineForEps(SHEET, opts({ epsConverter: "builtin" }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.svg).not.toContain("<text");
    expect(out.fixes).toContain(EPS_TEXT_FIX);
  });

  it("leaves a sheet without text untouched and unfixed", () => {
    const plain = SHEET.replace(/<text[\s\S]*?<\/text>/, "");
    const out = outlineForEps(plain, opts());
    expect(out).toMatchObject({ ok: true, svg: plain, fixes: [] });
  });

  it("never touches the document Inkscape writes: its CLI already outlines text", () => {
    const out = outlineForEps(SHEET, opts({ epsConverter: "inkscape" }));
    expect(out).toMatchObject({ ok: true, svg: SHEET, fixes: [] });
  });

  it("keeps the document as it is when no outliner can run, naming the fix", () => {
    setTextOutliner(() => null); // an injected outliner that has no font for the run
    const out = outlineForEps(SHEET, opts());
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.svg).toBe(SHEET); // untouched, so nothing ships half-outlined
    expect(out.reason).toMatch(/outline/i);
    expect(out.fix).toContain("Expand text to fills");
    expect(out.fix).toContain("Inkscape");
  });
});

describe("needsTextFonts", () => {
  it("is on whenever the package will outline: Expand text, or a built-in EPS", () => {
    expect(needsTextFonts(opts({ expandText: true }))).toBe(true);
    expect(needsTextFonts(opts({ includeEps: true, epsConverter: "builtin" }))).toBe(true);
    expect(needsTextFonts(opts({ includeEps: true, epsConverter: "inkscape" }))).toBe(false);
    expect(needsTextFonts(opts())).toBe(false);
  });
});

describe("the builder's own export settings", () => {
  it("are the stored formats over the neutral upload defaults, never the upload tab's decoration", () => {
    const settings = builderExportSettings(opts({ includeEps: true, jpegQuality: 0.7 }));
    expect(settings.includeEps).toBe(true);
    expect(settings.jpegQuality).toBe(0.7);
    expect(settings.background).toBe(DEFAULT_UPLOAD_SETTINGS.background);
    expect(settings.artboard).toEqual(DEFAULT_UPLOAD_SETTINGS.artboard);
    expect(settings.shadowEnabled).toBe(DEFAULT_UPLOAD_SETTINGS.shadowEnabled);
    expect(settings.paddingPct).toEqual(DEFAULT_UPLOAD_SETTINGS.paddingPct);
  });
});

describe("the artboard-aware JPEG box", () => {
  it("is the artboard itself while the match box is ticked", () => {
    expect(jpegBoxFor(opts({ jpegMatchArtboard: true }), 1080, 660)).toEqual({ width: 1080, height: 660 });
  });

  it("follows the rescale that decides those px", () => {
    const scaled = opts({ rescaleArtboard: true, rescaleMegapixels: 20, jpegMatchArtboard: true });
    expect(jpegBoxFor(scaled, 1000, 1000)).toEqual({ width: 4472, height: 4472 });
  });

  it("uses the megapixels when the match box is unticked, at the artboard's ratio", () => {
    const box = jpegBoxFor(opts({ jpegMatchArtboard: false, jpegMegapixels: 1 }), 200, 100);
    expect(box).toEqual({ width: 1414, height: 707 });
  });
});

describe("rescaledArtboard", () => {
  it("keeps the ratio and reaches the target area (the user's 1000² @ 20 MP example)", () => {
    const box = rescaledArtboard(1000, 1000, opts({ rescaleArtboard: true, rescaleMegapixels: 20 }));
    expect(box).toEqual({ width: 4472, height: 4472, factor: expect.closeTo(4.4721, 3) });
  });

  it("is the identity when the rescale is off", () => {
    expect(rescaledArtboard(1080, 660, opts())).toEqual({ width: 1080, height: 660, factor: 1 });
  });
});

describe("formatSummary", () => {
  it("names exactly the formats a run will ship, in the reference order", () => {
    expect(formatSummary(opts())).toBe("SVG + JPEG");
    expect(formatSummary(opts({ includeEps: true }))).toBe("SVG + JPEG + EPS");
    expect(formatSummary(opts({ includeSvg: false, includeEps: true }))).toBe("JPEG + EPS");
    expect(formatSummary(opts({ includeSvg: false, includeJpeg: false }))).toBe("no formats");
  });
});
