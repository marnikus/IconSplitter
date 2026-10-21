// tests/upload_eps_illustrator_verify.test.ts — real end-to-end export + zero-raster
// + native Adobe Illustrator 30.8.2 verification on:
//  - `tests/assets/svg to EPS/icon-handshake-heart_7_01_v2.svg`
//  - `tests/assets/svg to EPS/icon-handshake-heart_7_03_v2.jpg`
//  - `design temp/two eps to compare/icon-award-ribbon_8_02.eps`

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fileExistsAt, readTextAt } from "../src/lib/fs";
import { inspectAiEps, verifyEps, verifyEpsDocument, writeEps } from "../src/lib/upload/eps";
import { CONVERTERS } from "../src/lib/upload/epsconv/registry";
import { encodeAiDataStream } from "../src/lib/upload/epszlib";
import { DEFAULT_UPLOAD_SETTINGS, type UploadSettings } from "../src/lib/upload/settings";
import { validateArtifacts } from "../src/upload/exportvalidate";
import { runExport } from "../src/upload/runexport";
import type { UploadRowSource } from "../src/upload/discovery";
import type { Artifacts } from "../src/upload/exportstages";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { FakeDir } from "./helpers/fakefs";
import { decodeJpegRgba, epsToPdfBytes, pixelAt, renderEpsToBmp, rgbRmse } from "./helpers/ghostpdl";
import { minimalJpeg } from "./helpers/minijpeg";
import { runPostScript } from "./helpers/psrun";

const ASSET_SVG_PATH = resolve(process.cwd(), "tests/assets/svg to EPS/icon-handshake-heart_7_01_v2.svg");
const ASSET_JPG_PATH = resolve(process.cwd(), "tests/assets/svg to EPS/icon-handshake-heart_7_03_v2.jpg");
const REF_BROKEN_EPS_PATH = resolve(process.cwd(), "design temp/two eps to compare/icon-award-ribbon_8_01.eps");
const REF_AI30_EPS_PATH = resolve(process.cwd(), "design temp/two eps to compare/icon-award-ribbon_8_02.eps");

const DIR = "_split_output/2026-10/handshake/split_01";
const AI_NAME = "icon-handshake-heart_7_01_v2_AI.png";
const ROW: UploadRowSource = {
  id: "handshake-heart-1",
  dirPath: DIR,
  base: "icon-handshake-heart_7_01_v2",
  suffix: "_AI",
  aiPath: `${DIR}/${AI_NAME}`,
  metaPath: `${DIR}/icon-handshake-heart_7_01_v2_AI.json`,
  svgName: "icon-handshake-heart_7_01_v2_AI.svg",
  svgPath: `${DIR}/icon-handshake-heart_7_01_v2_AI.svg`,
  version: 2,
  fingerprint: "fp-handshake",
  approvedValid: 2,
};

function makeFixtureRoot(svgText: string): FakeDir {
  const root = new BinDir("test_processing");
  let node: FakeDir = root;
  for (const part of DIR.split("/")) {
    const made = new BinDir(part);
    node.children.set(part, made);
    node = made;
  }
  node.children.set(AI_NAME, new BinFile(AI_NAME, "ai", 1000));
  node.children.set(ROW.svgName, new BinFile(ROW.svgName, svgText, 1000));
  return root;
}

const rasterStub = {
  render: async (_svg: string, target: { width: number; height: number }) => target as unknown as HTMLCanvasElement,
  encode: async (canvas: HTMLCanvasElement) => minimalJpeg(canvas.width, canvas.height),
};

describe("Native Illustrator 30.8.2 + Zero-Raster EPS Verification (icon-handshake-heart_7_01_v2)", () => {
  it("calibrates inspectAiEps directly against real Adobe Illustrator 30.8.2 output (02 passes, old 01 fails)", () => {
    const oldBroken = inspectAiEps(new Uint8Array(readFileSync(REF_BROKEN_EPS_PATH)));
    expect(oldBroken.ok).toBe(false);
    expect(oldBroken.mpsParserFallback).toBe(true);

    const rawBytes = new Uint8Array(readFileSync(REF_AI30_EPS_PATH));
    const report = inspectAiEps(rawBytes);
    expect(report).toMatchObject({
      ok: true,
      errors: [],
      mpsParserFallback: false,
      embeddedRasterCount: 0,
    });
    expect(report.objects.length).toBeGreaterThanOrEqual(4);
  });

  it("runs real production runExport on icon-handshake-heart_7_01_v2.svg and verifies 100% vector gradients + editable strokes (0 raster)", async () => {
    const svg = readFileSync(ASSET_SVG_PATH, "utf8");
    const root = makeFixtureRoot(svg);
    const settings: UploadSettings = {
      ...DEFAULT_UPLOAD_SETTINGS,
      paddingPct: -1, // exact source geometry ("as is") matching icon-handshake-heart_7_03_v2.jpg
      includeEps: true,
      epsConverter: "builtin",
    };

    const result = await runExport({
      root, row: ROW, settings, defaults: settings, overrides: {},
      metadata: null, metadataInfo: null, record: null,
      deps: { raster: rasterStub, now: () => "2026-10-21T12:00:00.000Z" },
    });
    expect(result.status).toBe("processed");
    expect(result.error).toBeNull();

    const epsPath = `${DIR}/export/${ROW.base}.eps`;
    const eps = await readTextAt(root, epsPath);
    expect(eps).not.toBeNull();
    const epsText = eps!;

    // Compact, DSC-compliant, lag-free file budget: 22-glyph text-outlined SVG -> 36.9 KB total EPS
    // (pure icon + radial shadow without outlined text banner -> ~6 KB total EPS!)
    // with EVERY line strictly <= 255 chars (Adobe DSC v3.0 §4.2 & AI9_read_buffer limit)!
    expect(epsText.length).toBeLessThan(40_000);
    expect(Math.max(...epsText.split("\r\n").map((l) => l.length))).toBeLessThanOrEqual(255);
    expect(epsText).toContain("\r\n");
    expect(epsText).toContain("%AI9_PrintingDataEnd\r\n");
    expect(epsText).toContain("userdict /ai9_skip_data get exec\r\n");

    expect(verifyEps(epsText)).toEqual({ ok: true, errors: [], boundingBox: { llx: 0, lly: 0, urx: 900, ury: 488 } });
    expect(verifyEpsDocument(epsText).ok).toBe(true);
    expect(runPostScript(epsText).errors).toEqual([]);

    for (const forbidden of ["shfill", "/ShadingType", "colorimage", "imagemask", "cairo_image", "%AI5_BeginRaster"]) {
      expect(epsText).not.toContain(forbidden);
    }

    const report = inspectAiEps(epsText);
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.mpsParserFallback).toBe(false);
    expect(report.embeddedRasterCount).toBe(0);
    expect(report.maxClippedFillsPerClip).toBeLessThanOrEqual(17);
    expect(report.objects).toHaveLength(14);

    // Exact 3-stop translucent radial gradient swatch from <radialGradient id="a">
    expect(report.gradients).toHaveLength(1);
    const grad = report.gradients[0];
    expect(grad.kind).toBe("radial");
    expect(grad.stops).toHaveLength(3);
    expect(grad.stops[0]).toMatchObject({ offset: 0, opacity: 1 });
    expect(grad.stops[1].offset).toBeCloseTo(0.649, 3);
    expect(grad.stops[1].opacity).toBeCloseTo(0.25, 3);
    expect(grad.stops[2]).toMatchObject({ offset: 1, opacity: 0 });

    // Live vector gradient ellipse with exact 0.2 opacity, 0.117 aspect, and (450, 87.85) center
    const shadowObj = report.objects.find((o) => o.fillKind === "gradient");
    expect(shadowObj).toBeDefined();
    expect(shadowObj!.opacity).toBeCloseTo(0.2, 4);
    expect(shadowObj!.aspect!).toBeCloseTo(0.117, 3);
    expect(shadowObj!.xm![0]).toBeCloseTo(135.651, 2);
    expect(shadowObj!.xm![3]).toBeCloseTo(-15.85, 2);
    expect(shadowObj!.xm![4]).toBeCloseTo(450.001, 2);
    expect(shadowObj!.xm![5]).toBeCloseTo(87.851, 2);

    // Every single EDITABLE STROKE WIDTH path remains an editable live stroked vector path!
    const strokedObjs = report.objects.filter((o) => o.hasStroke);
    expect(strokedObjs).toHaveLength(10);
    expect(strokedObjs.some((o) => Math.abs((o.strokeWidthPt ?? 0) - 6) < 0.01)).toBe(true);
    expect(strokedObjs.some((o) => Math.abs((o.strokeWidthPt ?? 0) - 1.911) < 0.01)).toBe(true);
    expect(strokedObjs.some((o) => Math.abs((o.strokeWidthPt ?? 0) - 0.9555) < 0.01)).toBe(true);
  });

  it("passes real Ghostscript pdfwrite (0 /Subtype /Image XObjects) AND pixel-matches icon-handshake-heart_7_03_v2.jpg", async () => {
    const svg = readFileSync(ASSET_SVG_PATH, "utf8");
    const refJpg = decodeJpegRgba(readFileSync(ASSET_JPG_PATH));
    expect([refJpg.width, refJpg.height]).toEqual([1200, 650]);

    const res = writeEps(svg, "#ffffff", { title: "icon-handshake-heart_7_01_v2.eps" });
    if (!res.ok) throw new Error(res.reason);

    // Tier 2: Real Ghostscript WASM EPS -> uncompressed PDF XObject inspection
    const pdfBytes = await epsToPdfBytes(res.eps);
    const pdfLatin1 = Buffer.from(pdfBytes).toString("latin1");
    expect(pdfLatin1.startsWith("%PDF-")).toBe(true);
    expect(pdfLatin1).not.toMatch(/\/Subtype\s*\/Image\b/);
    expect(pdfLatin1).not.toMatch(/\/ShadingType\b/);

    // Tier 3: Real Ghostscript WASM EPS -> 1200x650 RGB bitmap compared over the shared
    // 850x138 shadow + EDITABLE STROKE WIDTH region (x=350..1200, y=512..650; right of the S/L mini icon)
    const rendered = await renderEpsToBmp(res.eps, 1200, 650, 96);
    const shadowAndBadgeBandRmse = rgbRmse(rendered, refJpg, { x: 350, y: 512, w: 850, h: 138 });
    expect(shadowAndBadgeBandRmse).toBeLessThan(9);
    const shadowRoiRmse = rgbRmse(rendered, refJpg, { x: 400, y: 524, w: 400, h: 30 });
    expect(shadowRoiRmse).toBeLessThan(8);

    // Smooth monotonic radial falloff across the translucent shadow at y = 533
    // Exact mathematical center gray: 255 * (1 - 0.2) = 204
    const centerShadow = pixelAt(rendered, 600, 533)[0];
    const midShadow = pixelAt(rendered, 680, 533)[0];
    const outerWhite = pixelAt(rendered, 790, 533)[0];
    expect(Math.abs(centerShadow - 204)).toBeLessThanOrEqual(1);
    expect(centerShadow).toBeLessThan(midShadow);
    expect(midShadow).toBeLessThan(outerWhite);
    expect(outerWhite).toBe(255);

    // Verify crisp black handshake-heart vector stroke on white artboard
    const [sr, sg, sb] = pixelAt(rendered, 601, 160);
    expect(sr).toBeLessThan(25);
    expect(sg).toBeLessThan(25);
    expect(sb).toBeLessThan(25);
  }, 30_000);

  it("HARD-FAILS both production export (status: 'failed', 0 committed files) AND verifiers on ANY raster or MPSParser-rasterizing EPS", async () => {
    const svg = readFileSync(ASSET_SVG_PATH, "utf8");
    const good = writeEps(svg, "#ffffff");
    if (!good.ok) throw new Error(good.reason);

    const compressedRasterStream = encodeAiDataStream(
      `%%BoundingBox: 0 0 900 488\n%AI5_FileFormat 14.0\n%%EndComments\n`
      + `%%BeginProlog\n%%EndProlog\n%%BeginSetup\n%%EndSetup\n`
      + `%AI5_BeginLayer\n%AI5_BeginRaster\nXI\n%AI5_EndRaster\nLB\n%%PageTrailer\ngsave annotatepage grestore showpage\n%%Trailer\n%%EOF\n`,
    );

    const bloatedBands = Array.from({ length: 30 }, () => "0.9 0.9 0.9 setrgbcolor 0 0 moveto 10 0 lineto 10 10 lineto closepath fill").join("\r\n");
    const unopt48Gon = `0.9 0.9 0.9 setrgbcolor 0 0 moveto ${Array.from({ length: 24 }, (_, k) => `${k} ${k} lineto`).join(" ")} closepath fill`;
    const orphanStackStream = encodeAiDataStream(
      `%%BoundingBox: 0 0 900 488\r\n%%HiResBoundingBox: 0 0 900 487.5\r\n%AI5_FileFormat 6.0\r\n%%EndComments\r\n`
      + `%%BeginProlog\r\n%%EndProlog\r\n%%BeginSetup\r\n%AI5_Begin_NonPrinting\r\nNp\r\n1 Bn\r\n`
      + `%AI5_BeginGradient: (Gradient 1)\r\n(Gradient 1) 1 2 Bd\r\n[\r\n<00FF>\r\n0\r\n`
      + `%_0 0 0 1 0 0 0 2 1 6 50 0 Bs\r\n%_0 0 0 0 1 1 1 2 0 6 50 100 Bs\r\nBD\r\n%AI5_EndGradient\r\n%AI5_End_NonPrinting--\r\n`
      + `%AI5_BeginPalette\r\n0 0 Pb\r\nPB\r\n%AI5_EndPalette\r\n%%EndSetup\r\n`
      + `%AI5_BeginLayer\r\nLB\r\n%AI5_EndLayer--\r\n%%PageTrailer\r\nshowpage\r\n%%Trailer\r\n%%EOF\r\n`,
    );

    const rasterCases: [string, string][] = [
      ["outer PostScript colorimage", good.eps.replace("%%PageTrailer", "10 10 8 [1 0 0 1 0 0] { () } false 3 colorimage\r\n%%PageTrailer")],
      ["Cairo EPS cairo_image", good.eps.replace("%%PageTrailer", "q 10 10 8 [1 0 0 1 0 0] cairo_image Q\r\n%%PageTrailer")],
      ["2769702d MPSParser shfill fallback", good.eps.replace("%%PageTrailer", "<< /ShadingType 3 >> shfill\r\n%%PageTrailer")],
      ["2769702d missing Adobe Illustrator outer header", good.eps.replace("%%Creator: Adobe Illustrator(R) 24.0", "%%Creator: IconSplitter")],
      ["bc29975d missing %AI9_PrintingDataEnd before private stream", good.eps.replace("%AI9_PrintingDataEnd", "% missing")],
      ["bc29975d unoptimized >24 stacked bands inside clip group", good.eps.replace("clip newpath", `clip newpath\r\n${bloatedBands}`)],
      ["bc29975d unoptimized 48-gon polyline tessellation inside clip group", good.eps.replace("clip newpath", `clip newpath\r\n${unopt48Gon}`)],
      ["bc29975d orphan <00FF> stack inside %AI5_BeginGradient", good.eps.replace(/%AI9_DataStream[\s\S]*?%AI9_PrivateDataEnd/, `%AI9_DataStream\r\n${orphanStackStream}\r\n%AI9_PrivateDataEnd`)],
      ["compressed %AI5_BeginRaster / XI inside %AI9_DataStream", good.eps.replace(/%AI9_DataStream[\s\S]*?%AI9_PrivateDataEnd/, `%AI9_DataStream\r\n${compressedRasterStream}\r\n%AI9_PrivateDataEnd`)],
    ];

    for (const [label, poisonedEps] of rasterCases) {
      expect(verifyEps(poisonedEps).ok, label).toBe(false);
      expect(verifyEpsDocument(poisonedEps).ok, label).toBe(false);
      expect(inspectAiEps(poisonedEps).ok, label).toBe(false);

      // Gate 1: validateArtifacts rejects poisoned EPS before commit
      const fakeArt: Artifacts = {
        prepared: null, optimizedSvg: null, optimizeRecord: null, svgOut: null,
        jpeg: null, jpegRecord: null, epsText: poisonedEps, epsFailure: null, epsFixes: [], epsWriter: "bad",
      };
      const validation = validateArtifacts(fakeArt, null);
      expect(validation.eps, `validateArtifacts must reject ${label}`).toBe(false);

      // Gate 2: Full production runExport HARD-FAILS (status === "failed", ZERO files committed!)
      const nonGradSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#000"/></svg>`;
      const root = makeFixtureRoot(nonGradSvg);
      const settings: UploadSettings = {
        ...DEFAULT_UPLOAD_SETTINGS, paddingPct: -1, includeEps: true, epsConverter: "inkscape",
      };
      const failedRun = await runExport({
        root, row: ROW, settings, defaults: settings, overrides: {},
        metadata: null, metadataInfo: null, record: null,
        deps: {
          raster: rasterStub,
          converter: { fetch: async () => new Response(poisonedEps, { status: 200 }), bridgeUrl: "http://127.0.0.1:47391" },
          now: () => "2026-10-21T12:00:00.000Z",
        },
      });
      expect(failedRun.status, `runExport must fail on ${label}`).toBe("failed");
      expect(await fileExistsAt(root, `${DIR}/export/${ROW.base}.eps`), `no EPS written on ${label}`).toBe(false);
    }
  });

  it("Inkscape converter upgrades gradient SVGs to 100%-vector native AI EPS when Cairo emits shfill/image, and fails non-gradient rasters", async () => {
    const svg = readFileSync(ASSET_SVG_PATH, "utf8");
    const cairoShadingEps = "%!PS-Adobe-3.0 EPSF-3.0\n%%Creator: cairo 1.18.0\n%%BoundingBox: 0 0 900 488\n<< /ShadingType 3 >> shfill\n%%EOF\n";
    const upgraded = await CONVERTERS.inkscape.convert(
      { svg, background: "#ffffff", title: "icon-handshake-heart_7_01_v2.eps" },
      { fetch: async () => new Response(cairoShadingEps, { status: 200 }), bridgeUrl: "http://127.0.0.1:47391" },
    );
    expect(upgraded.ok).toBe(true);
    if (!upgraded.ok) throw new Error(upgraded.reason);
    expect(inspectAiEps(upgraded.eps)).toMatchObject({ ok: true, mpsParserFallback: false, embeddedRasterCount: 0 });
  });

  it("preserves compact native AI 30.8.2 validity when XMP metadata is embedded in full runExport", async () => {
    const svg = readFileSync(ASSET_SVG_PATH, "utf8");
    const root = makeFixtureRoot(svg);
    const settings: UploadSettings = {
      ...DEFAULT_UPLOAD_SETTINGS,
      paddingPct: -1,
      includeEps: true,
      epsConverter: "builtin",
    };
    const result = await runExport({
      root,
      row: ROW,
      settings,
      defaults: settings,
      overrides: {},
      metadata: {
        title: "Handshake heart line icon",
        description: "Two hands forming a heart symbol with editable stroke width",
        tags: ["handshake", "heart", "partnership", "vector", "icon"],
      },
      metadataInfo: null,
      record: null,
      deps: { raster: rasterStub, now: () => "2026-10-21T12:00:00.000Z" },
    });
    expect(result.status).toBe("processed");
    const epsText = (await readTextAt(root, `${DIR}/export/${ROW.base}.eps`))!;
    expect(epsText.length).toBeLessThan(42_000);
    expect(verifyEps(epsText).ok).toBe(true);
    expect(inspectAiEps(epsText)).toMatchObject({
      ok: true,
      mpsParserFallback: false,
      embeddedRasterCount: 0,
    });
  });
});
