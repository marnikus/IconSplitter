// export_formats.test.ts — the shared export-format domain (2026-11-17): ONE
// interface both flows read, validated on read, overrideable per icon on the
// upload side, and present in the fingerprint. Witness written first (RED).
import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORMAT_OPTIONS, normalizeFormatOptions, rescaleSize, formatOptionsEqual,
  exportArtboardSize, jpegNote,
  type ExportFormatOptions,
} from "../src/lib/exportformats";
import {
  DEFAULT_UPLOAD_SETTINGS, normalizeSettings, parseOverrides, settingsEqual,
  type UploadSettings,
} from "../src/lib/upload/settings";
import { settingsFingerprint } from "../src/lib/upload/settingsfingerprint";

describe("the shared format options", () => {
  it("defaults match the reference sheet: SVG and JPEG on, EPS off, built-in converter", () => {
    expect(DEFAULT_FORMAT_OPTIONS).toMatchObject({
      includeSvg: true, includeJpeg: true, includeEps: false, epsConverter: "builtin",
      jpegMegapixels: 15.1, jpegQuality: 0.92, jpegMatchArtboard: true,
      optimizeSvg: true, expandStrokes: false, expandText: false,
      rescaleArtboard: false, rescaleMegapixels: 20, rescaleStrokes: true,
    });
  });

  it("validates a stored payload per field — one bad field costs one default", () => {
    const read = normalizeFormatOptions({ includeSvg: false, jpegQuality: 7, rescaleMegapixels: "x", expandText: true, rescaleStrokes: false, epsConverter: "inkscape" });
    expect(read).toMatchObject({ includeSvg: false, jpegQuality: 1, rescaleMegapixels: 20, expandText: true, rescaleStrokes: false, epsConverter: "inkscape" });
    expect(normalizeFormatOptions(null)).toEqual(DEFAULT_FORMAT_OPTIONS);
    expect(normalizeFormatOptions({ includeEps: "yes" }).includeEps).toBe(false);
  });

  it("is the shape UploadSettings extends — every upload setting IS format options", () => {
    const options: ExportFormatOptions = DEFAULT_UPLOAD_SETTINGS;
    expect(formatOptionsEqual(options, DEFAULT_FORMAT_OPTIONS)).toBe(true);
    expect(formatOptionsEqual({ ...DEFAULT_FORMAT_OPTIONS, expandText: true }, DEFAULT_FORMAT_OPTIONS)).toBe(false);
  });

  it("reads the new fields on the upload side: defaults, stored payloads, per-icon overrides", () => {
    expect(normalizeSettings({}).expandText).toBe(false);
    expect(normalizeSettings({ expandText: true, rescaleArtboard: true, rescaleMegapixels: 44, rescaleStrokes: false })).toMatchObject({
      expandText: true, rescaleArtboard: true, rescaleMegapixels: 44, rescaleStrokes: false,
    });
    const overrides = parseOverrides({ expandText: true, rescaleArtboard: true, rescaleMegapixels: 999 });
    expect(overrides).toMatchObject({ expandText: true, rescaleArtboard: true, rescaleMegapixels: 64 });
    const a: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, expandText: true };
    expect(settingsEqual(a, DEFAULT_UPLOAD_SETTINGS)).toBe(false);
    expect(settingsEqual({ ...DEFAULT_UPLOAD_SETTINGS, rescaleMegapixels: 3 }, { ...DEFAULT_UPLOAD_SETTINGS, rescaleMegapixels: 3 })).toBe(true);
  });

  it("keeps the fingerprint honest: expansion and rescale move it, dormancy does not", () => {
    const base = settingsFingerprint(DEFAULT_UPLOAD_SETTINGS);
    expect(settingsFingerprint({ ...DEFAULT_UPLOAD_SETTINGS, expandText: true })).not.toBe(base);
    expect(settingsFingerprint({ ...DEFAULT_UPLOAD_SETTINGS, rescaleArtboard: true })).not.toBe(base);
    expect(settingsFingerprint({ ...DEFAULT_UPLOAD_SETTINGS, rescaleArtboard: true, rescaleMegapixels: 8 })).not.toBe(
      settingsFingerprint({ ...DEFAULT_UPLOAD_SETTINGS, rescaleArtboard: true }),
    );
    expect(settingsFingerprint({ ...DEFAULT_UPLOAD_SETTINGS, rescaleArtboard: true, rescaleStrokes: false })).not.toBe(
      settingsFingerprint({ ...DEFAULT_UPLOAD_SETTINGS, rescaleArtboard: true }),
    );
    // dormant while the rescale box is off: the target alone changes nothing
    expect(settingsFingerprint({ ...DEFAULT_UPLOAD_SETTINGS, rescaleMegapixels: 8 })).toBe(base);
  });

  it("rescales a full artboard to the megapixel target, keeping its ratio", () => {
    expect(rescaleSize(1000, 1000, 20)).toMatchObject({ width: 4472, height: 4472 });
    const wide = rescaleSize(5500, 3000, 15.1);
    expect(wide.width * wide.height).toBeLessThanOrEqual(15.1 * 1_000_000);
    expect(Math.abs(wide.width / wide.height - 5500 / 3000)).toBeLessThan(0.01);
    expect(rescaleSize(1000, 1000, 20).factor).toBeCloseTo(4.4721, 3);
  });
});

describe("the artboard the export really has", () => {
  it("is the artboard's own px, or its rescaled px while the rescale box is on", () => {
    const box = { width: 1000, height: 1000 };
    expect(exportArtboardSize(box, { rescaleArtboard: false, rescaleMegapixels: 20 })).toEqual({ width: 1000, height: 1000 });
    expect(exportArtboardSize(box, { rescaleArtboard: true, rescaleMegapixels: 20 })).toEqual({ width: 4472, height: 4472 });
    const wide = exportArtboardSize({ width: 5500, height: 3000 }, { rescaleArtboard: false, rescaleMegapixels: 20 });
    expect(wide).toEqual({ width: 5500, height: 3000 });
  });

  it("names the JPEG's real size in its own note, and the MP rule when it does not match", () => {
    expect(jpegNote({ width: 5500, height: 3000 }, true)).toBe("the JPEG is the artboard itself: 5500×3000 px — untick for a bigger file");
    expect(jpegNote({ width: 5500, height: 3000 }, false)).toBe("rendered from the vectors at this resolution, at the artboard's aspect ratio");
    expect(jpegNote(null, true)).toBe("rendered from the vectors at this resolution (default 15.1)");
  });
});
