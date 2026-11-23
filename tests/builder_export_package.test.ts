// builder_export_package.test.ts — a sheet with a banner and captions CAN ship
// an EPS (2026-11-19). The failure that made EPS never appear: the built-in
// writer's subset ends at shapes, every sheet carries live <text>, so the stage
// answered "<text> is outside the EPS subset" and the package went partial with
// no .eps. Now the EPS stage outlines a copy for the built-in writer, reports
// the adjustment, and the record names the converter that really wrote the
// file — while the SVG keeps its live text unless Expand text to fills is on.
import { describe, expect, it, afterEach } from "vitest";
import { buildSheetPackage, type SheetPackageArgs } from "../src/svgBuilder/sheetpackage";
import { DEFAULT_UPLOAD_SETTINGS, type UploadSettings } from "../src/lib/upload/settings";
import { setTextOutliner } from "../src/lib/upload/expandtext";
import { EPS_TEXT_FIX, EPS_TEXT_HINT } from "../src/lib/svgBuilder/epsoutline";
import { NO_OUTPUT_FORMATS } from "../src/lib/upload/formats";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { DEFAULT_CONFIG } from "../src/lib/svgBuilder/config";

const SHEET = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">'
  + '<rect width="200" height="100" fill="#ffffff"/>'
  + '<text x="10" y="50" fill="#123456" font-size="12">ICON SHEET</text></svg>';

const decoder = new TextDecoder();
const outliner = () => ({ d: "M0 0 L40 0", width: 40 });

interface Seen { jpeg?: { width: number; height: number }; eps?: string }

function deps(seen: Seen, patch: Partial<Parameters<typeof buildSheetPackage>[1]> = {}) {
  return {
    pngBlob: async () => new Blob(["png"]),
    rasterize: async (_svg: string, target: { width: number; height: number }) => { seen.jpeg = target; return { ok: true as const, jpeg: new Uint8Array([1, 2, 3]) }; },
    eps: async (input: { svg: string }) => { seen.eps = input.svg; return { ok: true as const, eps: "%!PS-Adobe-3.0 EPSF-3.0\n%%EOF\n", writer: "inkscape-cli@1.3.2", fixes: [] }; },
    ...patch,
  };
}

function args(patch: Partial<UploadSettings>): SheetPackageArgs {
  return {
    svg: SHEET, metadata: null, settings: { ...DEFAULT_UPLOAD_SETTINGS, ...patch },
    folder: "_artboard_sheets/t/a", stem: "sheet", pairId: "a1", now: "2026-11-19T00:00:00.000Z", prompt: "", model: "",
  };
}

const file = (pkg: Awaited<ReturnType<typeof buildSheetPackage>>, ext: string) => pkg.files.find((f) => f.name.endsWith(ext));

afterEach(() => setTextOutliner(null));

describe("a sheet's EPS", () => {
  it("ships for the built-in converter by outlining the converter's copy, and says so", async () => {
    setTextOutliner(outliner);
    const seen: Seen = {};
    const pkg = await buildSheetPackage(args({ includeEps: true, epsConverter: "builtin" }), deps(seen));
    expect(pkg.problems).toEqual([]);
    expect(file(pkg, ".eps")).toBeDefined();
    expect(seen.eps).not.toContain("<text");
    expect(pkg.record.tools.eps.fixes).toContain(EPS_TEXT_FIX);
    // the SHIPPED svg keeps its live text: only the EPS copy was outlined
    expect(decoder.decode(file(pkg, ".svg")!.bytes)).toContain("<text");
  });

  it("hands Inkscape the untouched sheet: its CLI outlines text itself", async () => {
    setTextOutliner(outliner);
    const seen: Seen = {};
    const pkg = await buildSheetPackage(args({ includeEps: true, epsConverter: "inkscape" }), deps(seen));
    expect(seen.eps).toContain("<text");
    expect(pkg.record.tools.eps.fixes).toEqual([]);
  });

  it("fails the stage honestly when no outliner can run, naming both ways out", async () => {
    setTextOutliner(() => null);
    const pkg = await buildSheetPackage(args({ includeEps: true, epsConverter: "builtin" }), deps({}));
    expect(file(pkg, ".eps")).toBeUndefined();
    expect(file(pkg, ".svg")).toBeDefined();
    expect(file(pkg, ".jpg")).toBeDefined();
    expect(pkg.problems.join(" ")).toContain(EPS_TEXT_HINT);
    expect(pkg.record.status).toBe("partial");
  });
});

describe("the record", () => {
  it("names the converter that really wrote the EPS, not a fixed built-in label (RULE 22)", async () => {
    setTextOutliner(outliner);
    const pkg = await buildSheetPackage(args({ includeEps: true, epsConverter: "inkscape" }), deps({}));
    expect(pkg.record.tools.eps.writer).toBe("inkscape-cli@1.3.2");
    expect(pkg.record.tools.eps.converter).toBe("inkscape");
  });

  it("records the text expansion and the rescale it applied", async () => {
    setTextOutliner(outliner);
    const pkg = await buildSheetPackage(args({ expandText: true, rescaleArtboard: true, rescaleMegapixels: 1, jpegMatchArtboard: true }), deps({}));
    expect(pkg.record.tools.text).toEqual({ enabled: true, runs: 1 });
    expect(pkg.record.tools.rescale).toMatchObject({ enabled: true, megapixels: 1, strokes: true, width: 1414, height: 707 });
  });
});

describe("all formats off", () => {
  it("writes nothing and says what to tick, before any file work", async () => {
    const pkg = await buildSheetPackage(args({ includeSvg: false, includeJpeg: false, includeEps: false }), deps({}));
    expect(pkg.files).toEqual([]);
    expect(pkg.problems[0]).toContain(NO_OUTPUT_FORMATS);
    expect(pkg.record.status).toBe("failed");
  });
});

describe("a composed sheet (the real default)", () => {
  it("really contains text, and its EPS still ships once the outliner is available", async () => {
    const config = DEFAULT_CONFIG;
    const doc = composeSheet({ config, layout: computeLayout(config), assets: [], placedIds: [], svgTexts: {}, metadata: null });
    expect(doc.svg).toContain("<text");
    setTextOutliner(outliner);
    const seen: Seen = {};
    const pkg = await buildSheetPackage({ ...args({ includeEps: true }), svg: doc.svg }, deps(seen));
    expect(pkg.problems).toEqual([]);
    expect(file(pkg, ".eps")).toBeDefined();
  });
});
