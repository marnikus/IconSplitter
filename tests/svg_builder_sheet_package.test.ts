// @vitest-environment happy-dom
// svg_builder_sheet_package.test.ts — an artboard sheet's stock package (2026-11-14):
// SVG (metadata embedded) + JPG (XMP) + EPS (the Upload tab's converter, colours
// resolved) + a full PNG, recorded in an export.json the stock upload tab reads.
// The browser renderers and the converter are injected; nothing leaves the test.
import { describe, expect, it } from "vitest";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { parseExportRecord } from "../src/lib/upload/export";
import { readEmbeddedMetadata } from "../src/lib/upload/embed";
import { acceptSheetMetadata } from "../src/lib/svgBuilder/metadata";
import { buildSheetPackage, solidPaint } from "../src/svgBuilder/sheetpackage";
import { minimalJpeg } from "./helpers/minijpeg";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="660" viewBox="0 0 1080 660"><rect width="1080" height="660" fill="#F4F0E7"/>'
  + '<g color="#202A24" stroke="currentColor" fill="none"><path d="M3 3h18" stroke="currentColor"/></g></svg>';
const META = acceptSheetMetadata({ title: "Domestic household routines and grocery shopping", description: "Domestic household routines and grocery shopping concepts today",
  tags: ["icon", "pictogram", "vector", "stroke", "line", "editable", "web", "food", "home", "kitchen"] });

function deps() {
  const seen = { eps: "", jpg: { w: 0, h: 0 }, png: { w: 0, h: 0 } };
  return {
    seen,
    d: {
      pngBlob: async (_svg: string, w: number, h: number) => { seen.png = { w, h }; return new Blob([new Uint8Array([137, 80, 78, 71])]); },
      rasterize: async (_svg: string, t: { width: number; height: number; quality: number }) => {
        seen.jpg = { w: t.width, h: t.height };
        const jpeg = minimalJpeg(t.width, t.height);
        return { ok: true as const, jpeg, record: { width: t.width, height: t.height, megapixels: t.width * t.height / 1e6, quality: t.quality, bytes: jpeg.length, hash: "h", profile: "baseline" } };
      },
      eps: async (input: { svg: string }) => { seen.eps = input.svg; return { ok: true as const, eps: "%!PS-Adobe-3.0 EPSF-3.0\n%%EOF\n", writer: "test", fixes: [] }; },
    },
  };
}

const args = (over: Partial<Parameters<typeof buildSheetPackage>[0]> = {}) => ({
  svg: SVG, metadata: META, settings: { ...DEFAULT_UPLOAD_SETTINGS, includeEps: true }, folder: "_artboard_sheets/2026-11/2026-11-09/x_sheet_1_icons_green_palette_id00001/artboard_variant_1",
  stem: "x_sheet_1_icons_green_palette_id00001_v1", pairId: "art-1", now: "2026-11-09T10:00:00.000Z", prompt: "P", model: "gemini-x", ...over,
});

describe("artboard sheet package", () => {
  it("writes SVG, JPG, EPS and a full PNG named by the stem, and an export.json the stock tab can read", async () => {
    const { d, seen } = deps();
    const pkg = await buildSheetPackage(args(), d);
    expect(pkg.problems).toEqual([]);
    expect(pkg.files.map((f) => f.name).sort()).toEqual(["export.json", "x_sheet_1_icons_green_palette_id00001_v1.eps", "x_sheet_1_icons_green_palette_id00001_v1.jpg",
      "x_sheet_1_icons_green_palette_id00001_v1.png", "x_sheet_1_icons_green_palette_id00001_v1.svg"]);
    const svg = new TextDecoder().decode(pkg.files.find((f) => f.name.endsWith(".svg"))!.bytes);
    expect(readEmbeddedMetadata(svg)?.title).toBe(META.title);
    expect(seen.jpg.w * seen.jpg.h).toBeLessThanOrEqual(DEFAULT_UPLOAD_SETTINGS.jpegMegapixels * 1e6);
    expect(seen.png).toEqual({ w: 2160, h: 1320 });
    expect(seen.eps).not.toContain("currentColor"); // the converter gets real colours
    const record = parseExportRecord(JSON.parse(new TextDecoder().decode(pkg.files.find((f) => f.name === "export.json")!.bytes)));
    expect(record).not.toBeNull();
    expect(record!.status).toBe("processed");
    expect(record!.outputs.svg?.path).toBe("x_sheet_1_icons_green_palette_id00001_v1.svg");
    expect(record!.outputs.eps).not.toBeNull();
    expect(record!.metadata).toMatchObject({ state: "accepted", title: META.title, model: "gemini-x" });
  });

  it("a failing part is reported and left out; the rest still ships (partial)", async () => {
    const { d } = deps();
    const pkg = await buildSheetPackage(args(), { ...d, eps: async () => ({ ok: false as const, reason: "unsupported element: text", fix: "use the Inkscape converter" }) });
    expect(pkg.problems.join(" ")).toMatch(/EPS.*unsupported element: text.*Inkscape/);
    expect(pkg.files.some((f) => f.name.endsWith(".eps"))).toBe(false);
    const record = JSON.parse(new TextDecoder().decode(pkg.files.find((f) => f.name === "export.json")!.bytes));
    expect(record.status).toBe("partial");
    expect(record.outputs.eps).toBeNull();
  });

  it("without accepted metadata the files ship without it", async () => {
    const { d } = deps();
    const pkg = await buildSheetPackage(args({ metadata: null }), d);
    const record = JSON.parse(new TextDecoder().decode(pkg.files.find((f) => f.name === "export.json")!.bytes));
    expect(record.metadata).toBeNull();
  });

  it("resolves currentColor to each group's own colour", () => {
    expect(solidPaint(SVG)).not.toContain("currentColor");
    expect(solidPaint(SVG)).toContain('stroke="#202A24"');
  });
});
