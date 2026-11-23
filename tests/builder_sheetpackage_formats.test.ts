// builder_sheetpackage_formats.test.ts — the builder's stock package honours
// the shared format options exactly like the upload flow (2026-11-17): flags
// gate the files, SVGO records a real block, strokes and text expand, the
// artboard rescales — and a refused expansion ships nothing, named. The raster
// is a PNG instead of a JPEG (2026-11-23): the same switch and the same size
// rule (the artboard itself, or the MP at its ratio), never a JPEG.
import { describe, expect, it } from "vitest";
import { buildSheetPackage, type SheetPackageArgs } from "../src/svgBuilder/sheetpackage";
import { DEFAULT_UPLOAD_SETTINGS, type UploadSettings } from "../src/lib/upload/settings";
import { setTextOutliner } from "../src/lib/upload/expandtext";
import { loadBuilderFormats, saveBuilderFormats } from "../src/svgBuilder/formatstore";
import { DEFAULT_FORMAT_OPTIONS, type ExportFormatOptions } from "../src/lib/exportformats";
import { sheetSettings } from "../src/svgBuilder/actions/sheetexport";
import { builtinConverter } from "../src/lib/upload/epsconv/builtin";

const SHEET = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><!-- note --><rect x="1" y="1" width="9" height="9" fill="none" stroke="#000000" stroke-width="2"/><text x="10" y="50" fill="#123456" font-size="12">Hi</text></svg>';

const deps = (seen: { jpeg?: { width: number; height: number }; png?: { width: number; height: number } }) => ({
  pngBlob: async (_svg: string, width: number, height: number) => { seen.png = { width, height }; return new Blob(["png"]); },
  rasterize: async (_svg: string, target: { width: number; height: number }) => { seen.jpeg = target; return { ok: true as const, jpeg: new Uint8Array([1, 2, 3]) }; },
  // A verifiable EPS 10: the delivered-file gate refuses a bare magic line.
  eps: async () => ({ ok: true as const, eps: MINIMAL_EPS, writer: "builtin@test", fixes: [] }),
});

/** What a real converter writes: the DSC envelope plus a program and a trailer. */
const MINIMAL_EPS = [
  "%!PS-Adobe-3.0 EPSF-3.0", "%%BoundingBox: 0 0 200 100", "%%HiResBoundingBox: 0 0 200 100",
  "%%DocumentData: Clean7Bit", "%%LanguageLevel: 3", "%%EndComments",
  "%%BeginProlog", "%%EndProlog", "%%BeginSetup", "%%EndSetup",
  "0 0 m 10 10 l S", "%%PageTrailer", "%%Trailer", "%%EOF",
].join("\n");

function args(patch: Partial<UploadSettings>): SheetPackageArgs {
  return {
    svg: SHEET, metadata: null, settings: { ...DEFAULT_UPLOAD_SETTINGS, ...patch },
    folder: "_artboard_sheets/t/a", stem: "sheet", pairId: "a1", now: "2026-11-17T00:00:00.000Z", prompt: "", model: "",
  };
}

const file = (pkg: Awaited<ReturnType<typeof buildSheetPackage>>, ext: string) => pkg.files.find((f) => f.name.endsWith(ext));
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("the builder package follows the format options", () => {
  it("writes SVG, PNG and EPS per the flags — the raster is a PNG, never a JPEG (2026-11-23)", async () => {
    // A real browser has a text outliner; this sheet carries live <text>, so the
    // built-in EPS writer needs it to write the converter's copy.
    setTextOutliner(() => ({ d: "M0 0 L40 0", width: 40 }));
    const seen: { jpeg?: { width: number; height: number } } = {};
    const all = await buildSheetPackage(args({ includeEps: true, includeJpeg: true }), deps(seen));
    setTextOutliner(null);
    expect(all.files.map((f) => f.name).sort()).toEqual(["export.json", "sheet.eps", "sheet.png", "sheet.svg"]);
    expect(seen.jpeg).toBeUndefined(); // nothing is rasterised to JPEG
    expect(all.record.outputs.jpg).toBeNull();
    expect(all.record.settings.effective.includeJpeg).toBe(false); // export.json says: no JPEG
    expect(all.record.status).toBe("processed"); // no JPEG is not a missing part
    const noPng = await buildSheetPackage(args({ includeJpeg: false }), deps({}));
    expect(file(noPng, ".png")).toBeUndefined(); // the raster switch now means the PNG
    const noSvg = await buildSheetPackage(args({ includeSvg: false }), deps({}));
    expect(file(noSvg, ".svg")).toBeUndefined();
    expect(noSvg.record.outputs.svg).toBeNull();
    const noJpeg = await buildSheetPackage(args({ includeJpeg: false }), deps({}));
    expect(file(noJpeg, ".jpg")).toBeUndefined();
    expect(noJpeg.record.outputs.jpg).toBeNull();
    const noEps = await buildSheetPackage(args({}), deps({}));
    expect(file(noEps, ".eps")).toBeUndefined();
  });

  it("optimizes the export copy only when SVGO is on, and records it", async () => {
    const on = await buildSheetPackage(args({ optimizeSvg: true }), deps({}));
    expect(text(file(on, ".svg")!.bytes)).not.toContain("<!-- note -->");
    expect(on.record.tools.svgo.enabled).toBe(true);
    // The comment is editor bloat: the CLEAN pass drops it too (2026-11-19), so
    // only turning both SVGO and the clean pass off ships it.
    const cleanOnly = await buildSheetPackage(args({ optimizeSvg: false }), deps({}));
    expect(text(file(cleanOnly, ".svg")!.bytes)).not.toContain("<!-- note -->");
    expect(cleanOnly.record.tools.svgo.enabled).toBe(false);
    const off = await buildSheetPackage(args({ optimizeSvg: false, cleanExport: false }), deps({}));
    expect(text(file(off, ".svg")!.bytes)).toContain("<!-- note -->");
    expect(off.record.tools.svgo.enabled).toBe(false);
  });

  it("expands strokes and text before packaging when asked", async () => {
    setTextOutliner(() => ({ d: "M0 0 L40 0", width: 40 }));
    const out = await buildSheetPackage(args({ expandStrokes: true, expandText: true }), deps({}));
    const svg = text(file(out, ".svg")!.bytes);
    expect(svg).not.toContain("stroke-width");
    expect(svg).not.toContain("<text");
    expect(out.problems).toEqual([]);
    setTextOutliner(null);
    const kept = await buildSheetPackage(args({}), deps({}));
    expect(text(file(kept, ".svg")!.bytes)).toContain("<text");
  });

  it("rescales the sheet artboard and lets the PNG follow it or the MP (2026-11-23: the JPEG's size rule)", async () => {
    const seen: { png?: { width: number; height: number } } = {};
    const scaled = await buildSheetPackage(args({ rescaleArtboard: true, rescaleMegapixels: 1, jpegMatchArtboard: true }), deps(seen));
    expect(text(file(scaled, ".svg")!.bytes)).toContain('width="1414"');
    expect(seen.png).toMatchObject({ width: 1414, height: 707 });
    const seenMp: { png?: { width: number; height: number } } = {};
    await buildSheetPackage(args({ jpegMatchArtboard: false, jpegMegapixels: 1 }), deps(seenMp));
    expect(seenMp.png).toMatchObject({ width: 1414, height: 707 });
    const seenBox: { png?: { width: number; height: number } } = {};
    await buildSheetPackage(args({ jpegMatchArtboard: true }), deps(seenBox));
    expect(seenBox.png).toMatchObject({ width: 200, height: 100 });
  });

  it("names the built-in EPS writer's real limit: live text is outside its subset, and the rest still ships", async () => {
    const out = await buildSheetPackage(args({ includeEps: true, expandText: false }),
      { ...deps({}), eps: (input: { svg: string; background: string; title: string }) =>
        builtinConverter.convert(input, { bridgeUrl: "", fetch: async () => new Response("") }) });
    expect(out.files.some((f) => f.name.endsWith(".eps"))).toBe(false);
    // The honest refusal: no outliner exists in this environment, and the hint
    // names both ways out (outline the copy, or pick the Inkscape converter).
    expect(out.problems.join(" ")).toMatch(/EPS: .*(outliner|<text> is outside the EPS subset)/);
    expect(out.problems.join(" ")).toMatch(/Inkscape/);
    expect(out.record.status).toBe("partial");
    expect(out.files.some((f) => f.name.endsWith(".svg"))).toBe(true); // the rest is untouched
  });

  it("the EPS follows the rescaled artboard too, not only the SVG (2026-11-23)", async () => {
    const plain = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect x="10" y="10" width="50" height="40" fill="#123456"/></svg>';
    const eps = (input: { svg: string; background: string; title: string }) => builtinConverter.convert(input, { bridgeUrl: "", fetch: async () => new Response("") });
    const box = async (patch: Partial<UploadSettings>) => {
      const out = await buildSheetPackage({ ...args({ includeEps: true, ...patch }), svg: plain }, { ...deps({}), eps });
      const doc = text(file(out, ".eps")!.bytes);
      return /%%HiResBoundingBox: ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)/.exec(doc)!.slice(3, 5).map(Number);
    };
    expect(await box({})).toEqual([150, 75]); // 200 × 100 px = 150 × 75 pt
    const [w, h] = await box({ rescaleArtboard: true, rescaleMegapixels: 1 });
    expect(w).toBeCloseTo(1414, 0); // the 1 MP target, in points (Illustrator's px): 1414 × 707
    expect(h).toBeCloseTo(707, 0);
  });

  it("ships nothing but a named problem when an expansion is refused", async () => {
    setTextOutliner(() => null);
    const out = await buildSheetPackage(args({ expandText: true }), deps({}));
    setTextOutliner(null);
    expect(out.files).toEqual([]);
    expect(out.problems.join(" ")).toMatch(/outline|outliner/i);
    expect(out.record.status).not.toBe("processed");
  });
});

describe("the builder's own persisted format store", () => {
  it("is what Export all selected reads — the upload tab's visual defaults under the builder's formats", () => {
    saveBuilderFormats({ ...DEFAULT_FORMAT_OPTIONS, includeEps: true, epsConverter: "inkscape", expandText: true });
    expect(sheetSettings()).toMatchObject({ includeEps: true, epsConverter: "inkscape", expandText: true });
    expect(sheetSettings().includeSvg).toBe(true); // untouched format fields come from the builder's defaults
  });

  it("round-trips the options and falls back to the defaults on garbage", () => {
    const next: ExportFormatOptions = { ...DEFAULT_FORMAT_OPTIONS, includeEps: true, jpegQuality: 0.7, expandText: true };
    saveBuilderFormats(next);
    expect(loadBuilderFormats()).toEqual(next);
    saveBuilderFormats({ ...DEFAULT_FORMAT_OPTIONS, jpegQuality: 99 } as ExportFormatOptions);
    expect(loadBuilderFormats().jpegQuality).toBe(1);
  });
});
