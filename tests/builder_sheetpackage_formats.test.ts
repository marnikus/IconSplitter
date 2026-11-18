// builder_sheetpackage_formats.test.ts — the builder's stock package honours
// the shared format options exactly like the upload flow (2026-11-17): flags
// gate the files, SVGO records a real block, strokes and text expand, the
// artboard rescales, the JPEG follows the artboard or the MP — and a refused
// expansion ships nothing, named.
import { describe, expect, it } from "vitest";
import { buildSheetPackage, type SheetPackageArgs } from "../src/svgBuilder/sheetpackage";
import { DEFAULT_UPLOAD_SETTINGS, type UploadSettings } from "../src/lib/upload/settings";
import { setTextOutliner } from "../src/lib/upload/expandtext";
import { loadBuilderFormats, saveBuilderFormats } from "../src/svgBuilder/formatstore";
import { DEFAULT_FORMAT_OPTIONS, type ExportFormatOptions } from "../src/lib/exportformats";

const SHEET = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><!-- note --><rect x="1" y="1" width="9" height="9" fill="none" stroke="#000000" stroke-width="2"/><text x="10" y="50" fill="#123456" font-size="12">Hi</text></svg>';

const deps = (seen: { jpeg?: { width: number; height: number } }) => ({
  pngBlob: async () => new Blob(["png"]),
  rasterize: async (_svg: string, target: { width: number; height: number }) => { seen.jpeg = target; return { ok: true as const, jpeg: new Uint8Array([1, 2, 3]) }; },
  eps: async () => ({ ok: true as const, eps: "%!PS-Adobe test", writer: "builtin@test", fixes: [] }),
});

function args(patch: Partial<UploadSettings>): SheetPackageArgs {
  return {
    svg: SHEET, metadata: null, settings: { ...DEFAULT_UPLOAD_SETTINGS, ...patch },
    folder: "_artboard_sheets/t/a", stem: "sheet", pairId: "a1", now: "2026-11-17T00:00:00.000Z", prompt: "", model: "",
  };
}

const file = (pkg: Awaited<ReturnType<typeof buildSheetPackage>>, ext: string) => pkg.files.find((f) => f.name.endsWith(ext));
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("the builder package follows the format options", () => {
  it("writes SVG, JPEG, EPS and PNG per the flags", async () => {
    const all = await buildSheetPackage(args({ includeEps: true }), deps({}));
    expect(all.files.map((f) => f.name).sort()).toEqual(["export.json", "sheet.eps", "sheet.jpg", "sheet.png", "sheet.svg"]);
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
    const off = await buildSheetPackage(args({ optimizeSvg: false }), deps({}));
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

  it("rescales the sheet artboard and lets the JPEG follow it or the MP", async () => {
    const seen: { jpeg?: { width: number; height: number } } = {};
    const scaled = await buildSheetPackage(args({ rescaleArtboard: true, rescaleMegapixels: 1, jpegMatchArtboard: true }), deps(seen));
    expect(text(file(scaled, ".svg")!.bytes)).toContain('width="1414"');
    expect(seen.jpeg).toMatchObject({ width: 1414, height: 707 });
    const seenMp: { jpeg?: { width: number; height: number } } = {};
    await buildSheetPackage(args({ jpegMatchArtboard: false, jpegMegapixels: 1 }), deps(seenMp));
    expect(seenMp.jpeg).toMatchObject({ width: 1414, height: 707 });
    const seenBox: { jpeg?: { width: number; height: number } } = {};
    await buildSheetPackage(args({ jpegMatchArtboard: true }), deps(seenBox));
    expect(seenBox.jpeg).toMatchObject({ width: 200, height: 100 });
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
  it("round-trips the options and falls back to the defaults on garbage", () => {
    const next: ExportFormatOptions = { ...DEFAULT_FORMAT_OPTIONS, includeEps: true, jpegQuality: 0.7, expandText: true };
    saveBuilderFormats(next);
    expect(loadBuilderFormats()).toEqual(next);
    saveBuilderFormats({ ...DEFAULT_FORMAT_OPTIONS, jpegQuality: 99 } as ExportFormatOptions);
    expect(loadBuilderFormats().jpegQuality).toBe(1);
  });
});
