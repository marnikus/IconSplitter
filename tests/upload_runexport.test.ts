// RULE 8 — the export pipeline runs for real over a fake folder: the full
// package commits per icon (SVG + JPEG + export.json, atomically, tmp cleaned
// up), the approved source is never touched, a second run with no changes
// does no work, selective re-export does no redundant render, an EPS subset
// failure is an honest `partial` (SVG/JPEG stay committed), and a prepare
// failure commits nothing.
import { describe, expect, it } from "vitest";
import { runExport, type ExportRunArgs, type ExportRunResult } from "../src/upload/runexport";
import {
  newExportRecord, parseExportRecord, serializeExportRecord, type ExportRecord,
} from "../src/lib/upload/export";
import { commitExport } from "../src/upload/exportcommit";
import { DEFAULT_UPLOAD_SETTINGS, settingsFingerprint, type UploadSettings } from "../src/lib/upload/settings";
import { readJpegDimensions, verifyJpeg } from "../src/lib/upload/jpeg";
import type { RasterDeps } from "../src/lib/upload/raster";
import { readEmbeddedMetadata } from "../src/lib/upload/embed";
import { verifyExportSvg } from "../src/lib/upload/clean";
import { verifyEps, verifyEpsDocument } from "../src/lib/upload/eps";
import { readXmpMetadataFromEps } from "../src/lib/upload/epsmetadata";
import { MANDATORY_TAGS, metadataFingerprint, validateMetadata, type IconMetadata } from "../src/lib/upload/meta";
import { sha256HexText } from "../src/lib/upload/hash";
import { serializePairMeta } from "../src/lib/pairmeta";
import { FakeDir, FakeFile } from "./helpers/fakefs";

import { BinDir, BinFile } from "./helpers/binfakefs";
import { minimalJpeg } from "./helpers/minijpeg";
import { pairFile } from "./helpers/pairfile";
import { hiResBox, runPostScript } from "./helpers/psrun";
import { svgVersion } from "./helpers/svgpair";
import type { UploadRowSource } from "../src/upload/discovery";

const OUT = "_split_output/2026-10/2026-10-01_10-24-31";
const DIR = `${OUT}/fog_AI/split_01`;
const AI = "fog_AI.png";
const STEM = "fog_AI";
/** The artifact name in `export/`: the icon's own name, not the app's bookkeeping. */
const ART = "fog";
const SOURCE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" fill="#000000"/></svg>`;

const TAGS = [...MANDATORY_TAGS, "speed", "growth", "chart", "arrow", "up", "business", "finance",
  "analytics", "data", "trend", "increase", "graph", "statistics", "report", "dashboard", "money",
  "coin", "dollar", "euro", "yen", "currency", "cash", "payment", "wallet", "bank", "investment",
  "profit", "success", "target", "goal", "idea", "creative", "design"];
const META: IconMetadata = {
  title: "Minimal line icon of growth and speed",
  description: "Clean line icon showing growth and rising business trends",
  tags: TAGS,
};

/** A fake canvas transport that "encodes" a real minimal JPEG of the target size. */
/** Records the size the pipeline really asks for, and renders at exactly that. */
function captureRaster(): { asked: { width: number; height: number }[]; deps: RasterDeps } {
  const asked: { width: number; height: number }[] = [];
  const render = async (_svg: string, target: { width: number; height: number }): Promise<HTMLCanvasElement> => {
    asked.push({ width: target.width, height: target.height });
    return target as unknown as HTMLCanvasElement;
  };
  const encode = async (canvas: HTMLCanvasElement): Promise<Uint8Array> =>
    minimalJpeg(canvas.width, canvas.height);
  return { asked, deps: { render, encode } };
}

function fakeRaster(width: number, height: number, spy?: { renders: number }) {
  return {
    render: async () => {
      if (spy) spy.renders++;
      return { width, height } as unknown as HTMLCanvasElement;
    },
    encode: async () => minimalJpeg(width, height),
  };
}

function dirAt(root: FakeDir, path: string): FakeDir {
  let node = root;
  for (const part of path.split("/")) node = node.children.get(part) as FakeDir;
  return node;
}

/** The pair folder: AI image, sidecar (approved v1), and the approved SVG. */
function pairRoot(svgText: string = SOURCE_SVG): FakeDir {
  const root = new BinDir("test_processing");
  let node = root;
  for (const part of DIR.split("/")) {
    const child = node.children.get(part);
    if (child instanceof FakeDir) node = child;
    else {
      const made = new BinDir(part);
      node.children.set(part, made);
      node = made;
    }
  }
  node.children.set(AI, new BinFile(AI, "ai", 3100));
  node.children.set(`${STEM}.svg`, new BinFile(`${STEM}.svg`, svgText, 3400));
  const meta = pairFile(DIR, AI, {
    versions: [svgVersion(`${DIR}/${STEM}.svg`, { version: 1, review: "approved" })],
  });
  node.children.set(`${STEM}.svg.json`, new BinFile(`${STEM}.svg.json`, serializePairMeta(meta), 3300));
  return root;
}

const ROW: UploadRowSource = {
  id: "pair_fog",
  base: "fog",
  suffix: "",
  dirPath: DIR,
  version: 1,
  svgPath: `${DIR}/${STEM}.svg`,
  svgName: `${STEM}.svg`,
  fingerprint: `${SOURCE_SVG.length}:3400`,
  aiPath: `${DIR}/${AI}`,
  metaPath: `${DIR}/${STEM}.svg.json`,
  approvedValid: 1,
};

function args(root: FakeDir, over: Partial<ExportRunArgs> = {}): ExportRunArgs {
  return {
    root,
    row: ROW,
    settings: { ...DEFAULT_UPLOAD_SETTINGS },
    defaults: { ...DEFAULT_UPLOAD_SETTINGS },
    overrides: {},
    metadata: null,
    metadataInfo: null,
    record: null,
    deps: { raster: fakeRaster(3886, 3886) },
    ...over,
  };
}

/** Reads the committed export.json back from the fake folder. */
function readRecord(root: FakeDir): ExportRecord {
  const file = dirAt(root, `${DIR}/export`).children.get("export.json") as FakeFile;
  return parseExportRecord(JSON.parse(file.text)) as ExportRecord;
}

/** The record an earlier app version wrote: outputs under the `_AI` name. */
function oldNameRecord(withEps = false): ExportRecord {
  const r = newExportRecord({
    pair: { id: ROW.id, base: "fog", suffix: "", dir: DIR },
    source: { svgPath: `${DIR}/${STEM}.svg`, version: 1, approval: "approved", fingerprint: `sha256:${""}` },
    settings: {
      defaults: { ...DEFAULT_UPLOAD_SETTINGS }, overrides: {},
      effective: { ...DEFAULT_UPLOAD_SETTINGS }, fingerprint: settingsFingerprint({ ...DEFAULT_UPLOAD_SETTINGS }),
    },
    svgo: { enabled: true, version: "", config: "", beforeBytes: 0, afterBytes: 0, beforeHash: "", afterHash: "" },
    epsEnabled: false,
  });
  const out = (name: string) => ({ path: `${DIR}/export/${name}`, bytes: 1, hash: "sha256:x" });
  r.outputs = { svg: out(`${STEM}.svg`), jpg: out(`${STEM}.jpg`), eps: withEps ? out(`${STEM}.eps`) : null };
  r.stage = "committed";
  r.status = "processed";
  r.timestamps.committedAt = "2026-10-07T00:00:00.000Z";
  return r;
}

async function bytesOf(file: FakeFile): Promise<Uint8Array> {
  return new Uint8Array(await (await file.getFile()).arrayBuffer());
}

function fileText(root: FakeDir, relPath: string): string {
  const at = relPath.lastIndexOf("/");
  const file = dirAt(root, relPath.slice(0, at)).children.get(relPath.slice(at + 1)) as FakeFile;
  return file.text;
}

describe("runExport — the full package commits per icon", () => {
  it("writes <base>.svg, <base>.jpg and export.json, and cleans up tmp files", async () => {
    const root = pairRoot();
    const result = await runExport(args(root));
    expect(result.status).toBe("processed");
    expect(result.error).toBeNull();
    expect(result.stages).toEqual(["prepare", "render", "optimize", "validate", "commit"]);
    const exportDir = dirAt(root, `${DIR}/export`);
    expect([...exportDir.children.keys()].sort()).toEqual(["export.json", `${ART}.jpg`, `${ART}.svg`]);
    expect(result.outputs).toEqual({ svg: `${ART}.svg`, jpg: `${ART}.jpg`, eps: null });
  });

  it("records the real package: hashes, dims, real megapixels, stage, status", async () => {
    const root = pairRoot();
    await runExport(args(root));
    const record = readRecord(root);
    expect(record.status).toBe("processed");
    expect(record.stage).toBe("committed");
    expect(record.source.fingerprint).toBe(`sha256:${await sha256HexText(SOURCE_SVG)}`);
    expect(record.source.approval).toBe("approved");
    expect(record.jpeg).toMatchObject({ width: 3886, height: 3886, quality: 0.92, profile: "baseline" });
    expect(record.jpeg.megapixels).toBeCloseTo(15.1, 2);
    expect(record.outputs.svg?.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(record.outputs.jpg?.bytes).toBeGreaterThan(0);
    expect(record.outputs.eps).toBeNull();
    expect(record.timestamps.committedAt).not.toBeNull();
    // the committed outputs verify
    const svgText = fileText(root, `${DIR}/export/${ART}.svg`);
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    // ...including the clean-code policy: SVG 1.1, no raster, no naming, no bloat
    expect(verifyExportSvg(svgText)).toEqual([]);
    expect(doc.documentElement.getAttribute("version")).toBe("1.1");
    expect(doc.documentElement.getAttribute("viewBox")).toBe("0 0 92.8 92.8");
    const jpegBytes = await bytesOf(dirAt(root, `${DIR}/export`).children.get(`${ART}.jpg`) as FakeFile);
    expect(readJpegDimensions(jpegBytes)).toEqual({ width: 3886, height: 3886 });
  });

  it("a pinned artboard decides the committed size: 512×256 means a 512×256 JPEG and SVG", async () => {
    const root = pairRoot();
    const settings: UploadSettings = {
      ...DEFAULT_UPLOAD_SETTINGS,
      artboard: { mode: "custom", size: 512, width: 512, height: 256 },
    };
    const result = await runExport(args(root, { settings, defaults: settings, deps: { raster: fakeRaster(512, 256) } }));
    expect(result.status).toBe("processed");
    const record = readRecord(root);
    expect(record.jpeg).toMatchObject({ width: 512, height: 256 });
    expect(record.jpeg.megapixels).toBeCloseTo(0.131, 3);
    const svgText = fileText(root, `${DIR}/export/${ART}.svg`);
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    expect(doc.documentElement.getAttribute("viewBox")).toBe("0 0 512 256");
    expect(doc.documentElement.getAttribute("width")).toBeNull(); // the viewBox IS the size (2026-10-08)
    expect(verifyExportSvg(svgText)).toEqual([]);
    const jpegBytes = await bytesOf(dirAt(root, `${DIR}/export`).children.get(`${ART}.jpg`) as FakeFile);
    expect(readJpegDimensions(jpegBytes)).toEqual({ width: 512, height: 256 });
  });

  it("the stroke width setting is the number in the SHIPPED file — through SVGO, under an artwork transform and a pinned artboard (2026-10-08)", async () => {
    // The stock reviewer's file read stroke-width="2.6224000000000003": a width
    // finalised in local units, then re-multiplied when SVGO baked the transforms.
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g transform="scale(1.1)">`
      + `<path d="M4 4h16v16H4z" fill="none" stroke="#333"/><circle cx="12" cy="12" r="3" fill="none" stroke="#333"/></g></svg>`;
    const root = pairRoot(source);
    const settings: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, strokePx: 2, optimizeSvg: true, includeEps: true, artboard: { mode: "preset", size: 512, width: 512, height: 512 } };
    const result = await runExport(args(root, { settings, defaults: settings, deps: { raster: fakeRaster(512, 512) } }));
    expect(result.status).toBe("processed");
    const svgText = fileText(root, `${DIR}/export/${ART}.svg`);
    expect(svgText.match(/stroke-width="([^"]*)"/g)).toEqual([`stroke-width="2"`]); // the NUMBER is the user's, defined once
    expect(svgText).not.toContain("transform=");
    expect(verifyExportSvg(svgText)).toEqual([]);
    expect(readRecord(root).settings.effective.strokePx).toBe(2);
    expect(verifyEps(fileText(root, `${DIR}/export/${ART}.eps`)).ok).toBe(true);
  });

  it("ships ONE global stroke definition: `stroke` and `stroke-width` exactly once, on <svg>, the colour #000 (2026-10-08)", async () => {
    // The stock reviewer's second file: `<svg stroke="#111"><g stroke="#000"
    // stroke-width=".8">` with every <path> carrying its own width. The rules:
    // the width is defined once, globally; the colour is defined once, globally,
    // and it is #000; no other definition of either survives — not on the
    // group, not on the shapes, not on the background rect.
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="#111">`
      + `<rect width="24" height="24" fill="#fff" stroke="none"/><g stroke="#000" stroke-width=".8" fill="none">`
      + `<path d="M4 4h16v16H4z" stroke-width=".8"/><path d="M8 8h8v8H8z" stroke-width=".8"/></g></svg>`;
    const root = pairRoot(source);
    const settings: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, strokePx: 2, background: "#ffffff", optimizeSvg: true, artboard: { mode: "preset", size: 512, width: 512, height: 512 } };
    const result = await runExport(args(root, { settings, defaults: settings, deps: { raster: fakeRaster(512, 512) } }));
    expect(result.status).toBe("processed");
    const svgText = fileText(root, `${DIR}/export/${ART}.svg`);
    const rootTag = svgText.match(/<svg[^>]*>/)?.[0] ?? "";
    expect(rootTag).toContain(`stroke-width="2"`);
    expect(rootTag).toContain(`stroke="#000"`);
    expect(svgText.match(/stroke-width="/g)).toHaveLength(1);
    expect(svgText.match(/stroke="[^"]*"/g)?.filter((a) => a !== `stroke="none"`)).toEqual([`stroke="#000"`]);
    expect(svgText).not.toContain("#111");
    expect(svgText).not.toContain(`stroke-width=".8"`);
    expect(verifyExportSvg(svgText)).toEqual([]);
  });

  it("lets the user keep the artboard's RATIO at their own megapixels", async () => {
    const root = pairRoot();
    // A small artboard must not cap the resolution: 512×256 with "same as the
    // artboard" off and 4 MP → a 2:1 JPEG of 4 MP, while the SVG stays 512×256.
    const settings: UploadSettings = {
      ...DEFAULT_UPLOAD_SETTINGS,
      jpegMegapixels: 4,
      jpegMatchArtboard: false,
      artboard: { mode: "custom", size: 512, width: 512, height: 256 },
    };
    const raster = captureRaster();
    const result = await runExport(args(root, { settings, defaults: settings, deps: { raster: raster.deps } }));
    expect(result.status).toBe("processed");
    // what the pipeline ASKED the canvas to render, and what it committed
    expect(raster.asked).toEqual([{ width: 2828, height: 1414 }]);
    expect(readRecord(root).jpeg).toMatchObject({ width: 2828, height: 1414 });
    const doc = new DOMParser().parseFromString(fileText(root, `${DIR}/export/${ART}.svg`), "image/svg+xml");
    expect(doc.documentElement.getAttribute("viewBox")).toBe("0 0 512 256");
  });

  it("converts to EPS from the OPTIMIZED svg, never from the source text", async () => {
    // The source carries a paint-only stylesheet the EPS writer itself would
    // refuse ("CSS <style> blocks are outside the EPS subset") and editor
    // bookkeeping the clean policy strips. The export must therefore feed the
    // EPS stage the PROCESSED text: clean + optimize ran before the conversion,
    // which is exactly what "convert after the SVG was optimized" means.
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><style>.a{fill:#123456}</style>` +
      `<rect class="a" x="4" y="4" width="16" height="16" data-name="Layer 1"/></svg>`;
    const root = pairRoot(source);
    const settings: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, includeEps: true };
    const result = await runExport(args(root, {
      settings, defaults: settings,
      deps: { raster: fakeRaster(3886, 3886), now: () => "2026-10-08T12:00:00.000Z" },
    }));
    expect(result.status).toBe("processed");
    const eps = fileText(root, `${DIR}/export/${ART}.eps`);
    // a real EPS 10 document, carrying the icon's own file name and the run's clock
    expect(eps.startsWith("%!PS-Adobe-3.0 EPSF-3.0")).toBe(true);
    expect(eps).toContain(`%%Title: ${ART}.eps`);
    expect(eps).toContain("%%CreationDate: 2026-10-08T12:00:00.000Z");
    expect(eps).toContain("%%LanguageLevel: 3");
    // the stylesheet's paint arrived as a folded attribute, and no <style> text did
    expect(eps).toContain("0.071 0.204 0.337"); // #123456, setrgbcolor
    expect(eps).not.toContain("style");
    expect(verifyEps(eps).ok).toBe(true);
    // and it RUNS (I-61): the subset interpreter executes it with no error and
    // paints only inside the declared box — the file Illustrator opens
    const run = runPostScript(eps);
    expect(run.errors).toEqual([]);
    const box = hiResBox(eps);
    expect(run.painted!.urx).toBeLessThanOrEqual(box.urx + 1e-6);
    expect(run.painted!.ury).toBeLessThanOrEqual(box.ury + 1e-6);
    expect(run.painted!.llx).toBeGreaterThanOrEqual(-1e-6);
    expect(run.painted!.lly).toBeGreaterThanOrEqual(-1e-6);
  });

  it("embeds and reads back accepted Title, Description, and Tags in EPS after conversion", async () => {
    const root = pairRoot();
    const settings: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, includeEps: true };
    const result = await runExport(args(root, {
      settings, defaults: settings, metadata: META,
      metadataInfo: {
        prompt: "p", provider: "Gemini", model: "gemini-3.1-flash-lite", requestId: null,
        usage: { input: 1, output: 2, total: 3 }, validation: validateMetadata(META),
      },
      deps: { raster: fakeRaster(3886, 3886) },
    }));
    expect(result.status).toBe("processed");
    const eps = fileText(root, `${DIR}/export/${ART}.eps`);
    expect(eps).toContain("%ADO_ContainsXMP: MainFirst");
    expect(eps).toContain("%%DocumentData: Clean8Bit");
    expect(readXmpMetadataFromEps(eps)).toEqual(META);
    expect(verifyEpsDocument(eps).ok).toBe(true);
    expect(readRecord(root).validation).toMatchObject({ eps: true, readback: true });
    // Metadata postprocessing preserves the built-in EPS artboard and artwork.
    expect(eps).toContain("%AI5_ArtSize:");
    expect(eps).toContain("[0.75 0 0 -0.75");
    expect(eps).toContain("newpath");
    expect(eps.indexOf("/BDC pdfmark")).toBeLessThan(eps.indexOf("newpath"));
    expect(eps.indexOf("[/EMC pdfmark")).toBeLessThan(eps.indexOf("%%EOF"));
  });

  it("updates EPS XMP on a metadata edit without rendering, and handles Inkscape output too", async () => {
    const EPS = "%!PS-Adobe-3.0 EPSF-3.0\n%%Creator: cairo 1.18.0\n%%LanguageLevel: 2\n%%BoundingBox: 0 0 70 70\n%%EndComments\n0 0 moveto fill\n%%EOF\n";
    const settings: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, includeEps: true, epsConverter: "inkscape" };
    const converter = { bridgeUrl: "http://127.0.0.1:47391", fetch: async () => new Response(EPS, { status: 200 }) };
    const root = pairRoot();
    const info = {
      prompt: "p", provider: "Gemini", model: "gemini-3.1-flash-lite", requestId: null,
      usage: { input: 1, output: 2, total: 3 }, validation: validateMetadata(META),
    };
    const first = await runExport(args(root, {
      settings, defaults: settings, metadata: META, metadataInfo: info,
      deps: { raster: fakeRaster(3886, 3886), converter },
    }));
    expect(first.status).toBe("processed");
    expect(readXmpMetadataFromEps(fileText(root, `${DIR}/export/${ART}.eps`))).toEqual(META);

    const edited: IconMetadata = { ...META, title: "Minimal line icon of progress and speed" };
    const spy = { renders: 0 };
    const second = await runExport(args(root, {
      settings, defaults: settings, record: readRecord(root), metadata: edited,
      metadataInfo: { ...info, validation: validateMetadata(edited) },
      deps: { raster: fakeRaster(3886, 3886, spy), converter },
    }));
    expect(second.stages).toEqual(["embed", "eps", "validate", "commit"]);
    expect(spy.renders).toBe(0);
    const eps = fileText(root, `${DIR}/export/${ART}.eps`);
    expect(readXmpMetadataFromEps(eps)).toEqual(edited);
    expect(eps).toContain("0 0 moveto fill");
    expect(readRecord(root).validation).toMatchObject({ eps: true, readback: true });
  });

  it("a rounded <rect> is written to EPS exactly and the automatic fix is recorded, not asked (2026-10-08)", async () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
      `<rect x="4" y="4" width="16" height="16" rx="3" fill="#000"/></svg>`;
    const root = pairRoot(source);
    const settings: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, includeEps: true };
    const result = await runExport(args(root, { settings, defaults: settings, deps: { raster: fakeRaster(3886, 3886) } }));
    expect(result.status).toBe("processed"); // not partial — the EPS stage succeeded
    expect(result.error).toBeNull();
    expect(result.notes).toEqual(["1 rounded <rect> written as an exact path outline"]);
    const eps = fileText(root, `${DIR}/export/${ART}.eps`);
    expect(eps.match(/curveto/g)).toHaveLength(4);
    expect(verifyEps(eps).ok).toBe(true);
    expect(readRecord(root).tools.eps).toMatchObject({ enabled: true, fixes: ["1 rounded <rect> written as an exact path outline"] });
    // the SVG output keeps its <rect rx> — nothing about the artwork changed
    expect(fileText(root, `${DIR}/export/${ART}.svg`)).toContain("rx=");
  });

  it("records the artboard the file ships: mode, px, megapixels, scaledTo null, passes — and the viewBox agrees (I-60)", async () => {
    const root = pairRoot();
    const settings: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, strokePx: 2 };
    const result = await runExport(args(root, { settings, defaults: settings, deps: { raster: fakeRaster(3886, 3886) } }));
    expect(result.status).toBe("processed");
    const artboard = readRecord(root).tools.artboard;
    expect(artboard).toMatchObject({ mode: "content", scaledTo: null });
    expect(artboard!.passes).toBeGreaterThanOrEqual(1);
    expect(artboard!.megapixels).toBeCloseTo((artboard!.width * artboard!.height) / 1e6, 6);
    expect(fileText(root, `${DIR}/export/${ART}.svg`)).toContain(`viewBox="0 0 ${artboard!.width} ${artboard!.height}"`);
  });

  it("Scale to 5 MP: the record says scaledTo 5 and the artboard IS 5 MP; the JPEG still follows jpegMegapixels (I-62)", async () => {
    const root = pairRoot();
    const settings: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, scaleToMegapixels: true, artboardMegapixels: 5, jpegMegapixels: 15.1 };
    const result = await runExport(args(root, { settings, defaults: settings, deps: { raster: fakeRaster(3886, 3886) } }));
    expect(result.status).toBe("processed");
    const record = readRecord(root);
    expect(record.tools.artboard).toMatchObject({ mode: "content", scaledTo: 5 });
    expect(record.tools.artboard!.megapixels).toBeCloseTo(5, 3);
    expect(record.jpeg.width).toBe(3886); // the JPEG resolution is its own setting
    expect(fileText(root, `${DIR}/export/${ART}.svg`)).toContain(`viewBox="0 0 ${record.tools.artboard!.width} ${record.tools.artboard!.height}"`);
    // a pinned artboard: the px decide, scaledTo stays null even with the box on
    const pinnedRoot = pairRoot();
    const pinned: UploadSettings = { ...settings, artboard: { mode: "preset", size: 512, width: 512, height: 512 } };
    await runExport(args(pinnedRoot, { settings: pinned, defaults: pinned, deps: { raster: fakeRaster(512, 512) } }));
    expect(readRecord(pinnedRoot).tools.artboard).toMatchObject({ mode: "preset", width: 512, height: 512, scaledTo: null });
  });

  it("records the converter that wrote the EPS and the expand block (2026-10-09)", async () => {
    const root = pairRoot();
    const settings: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, includeEps: true };
    const result = await runExport(args(root, { settings, defaults: settings, deps: { raster: fakeRaster(3886, 3886) } }));
    expect(result.status).toBe("processed");
    expect(readRecord(root).tools.eps).toMatchObject({ enabled: true, converter: "builtin", writer: "builtin-subset-2" });
    expect(readRecord(root).tools.expand).toEqual({ enabled: false, shapes: 0 });
  });

  it("Expand strokes to fills: the shipped SVG has no stroke, the EPS no stroke operator, the record counts the shapes (2026-10-09)", async () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g transform="scale(1.1)">`
      + `<path d="M4 4h16v16H4z" fill="none" stroke="#333"/><circle cx="12" cy="12" r="3" fill="none" stroke="#333" stroke-dasharray="2 1"/></g></svg>`;
    const root = pairRoot(source);
    const settings: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, strokePx: 2, expandStrokes: true, optimizeSvg: true, includeEps: true, artboard: { mode: "preset", size: 512, width: 512, height: 512 } };
    const result = await runExport(args(root, { settings, defaults: settings, deps: { raster: fakeRaster(512, 512) } }));
    expect(result.status).toBe("processed");
    const svgText = fileText(root, `${DIR}/export/${ART}.svg`);
    expect(svgText).not.toMatch(/stroke/);
    expect(svgText.match(/<path/g)?.length).toBe(3); // the artboard (a path after SVGO) + the two outlines
    expect(verifyExportSvg(svgText)).toEqual([]);
    const eps = fileText(root, `${DIR}/export/${ART}.eps`);
    expect(verifyEps(eps).ok).toBe(true);
    expect(eps).not.toMatch(/setlinewidth|\bstroke\b/);
    expect(eps).toMatch(/\bfill\b/);
    const record = readRecord(root);
    expect(record.tools.expand).toEqual({ enabled: true, shapes: 2 });
    expect(record.settings.effective.expandStrokes).toBe(true);
  });

  it("the Inkscape converter: the helper's EPS commits with its writer; an unreachable helper is a named partial (2026-10-09)", async () => {
    const EPS = "%!PS-Adobe-3.0 EPSF-3.0\n%%Creator: cairo 1.18.0\n%%LanguageLevel: 2\n%%BoundingBox: 0 0 70 70\n%%EndComments\n0 0 moveto fill\n%%EOF\n";
    const settings: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, includeEps: true, epsConverter: "inkscape" };
    const up = async () => new Response(EPS, { status: 200, headers: { "x-inkscape-version": "1.3.2" } });
    const okRoot = pairRoot();
    const ok = await runExport(args(okRoot, {
      settings, defaults: settings,
      deps: { raster: fakeRaster(3886, 3886), converter: { bridgeUrl: "http://127.0.0.1:47391", fetch: up } },
    }));
    expect(ok.status).toBe("processed");
    expect(fileText(okRoot, `${DIR}/export/${ART}.eps`)).toBe(EPS);
    expect(readRecord(okRoot).tools.eps).toMatchObject({ converter: "inkscape", writer: "inkscape-cli@1.3.2" });

    const downRoot = pairRoot();
    const down = await runExport(args(downRoot, {
      settings, defaults: settings,
      deps: { raster: fakeRaster(3886, 3886), converter: { bridgeUrl: "http://127.0.0.1:47391", fetch: () => Promise.reject(new TypeError("Failed to fetch")) } },
    }));
    expect(down.status).toBe("partial");
    expect(down.error?.detail).toContain("not reachable at http://127.0.0.1:47391");
    expect(down.error?.detail).toContain("run_inkscape_bridge.bat");
    expect(fileText(downRoot, `${DIR}/export/${ART}.svg`)).toContain("<svg"); // the required outputs committed
    expect(readRecord(downRoot).outputs.eps).toBeNull();
  });

  it("a plain package carries no notes and no fixes", async () => {
    const root = pairRoot();
    const settings: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, includeEps: true };
    const result = await runExport(args(root, { settings, defaults: settings, deps: { raster: fakeRaster(3886, 3886) } }));
    expect(result.status).toBe("processed");
    expect(result.notes).toEqual([]);
    expect(readRecord(root).tools.eps.fixes).toEqual([]);
  });

  it("never touches the approved source", async () => {
    const root = pairRoot();
    await runExport(args(root));
    expect(fileText(root, `${DIR}/${STEM}.svg`)).toBe(SOURCE_SVG);
    expect(fileText(root, `${DIR}/${STEM}.svg.json`)).toContain("approved");
  });

  it("embeds accepted metadata into the SVG and the JPEG (XMP), verified by readback", async () => {
    const root = pairRoot();
    const result = await runExport(args(root, {
      metadata: META,
      metadataInfo: {
        prompt: "the prompt", provider: "Gemini", model: "gemini-3.1-flash-lite",
        requestId: "req-1", usage: { input: 1, output: 2, total: 3 }, validation: validateMetadata(META),
      },
      deps: { raster: fakeRaster(3886, 3886) },
    }));
    expect(result.status).toBe("processed");
    expect(result.stages).toContain("embed");
    const svgText = fileText(root, `${DIR}/export/${ART}.svg`);
    expect(readEmbeddedMetadata(svgText)).toEqual(META);
    // the SHIPPED text: <title> and <dc:title> are ONE phrase, no period (stock review 2026-10-08)
    expect(svgText).toContain("<title>Minimal line icon of growth and speed</title>");
    expect(svgText).toContain("<dc:title>Minimal line icon of growth and speed</dc:title>");
    expect(svgText).toContain("<desc>Clean line icon showing growth and rising business trends</desc>");
    const jpegBytes = await bytesOf(dirAt(root, `${DIR}/export`).children.get(`${ART}.jpg`) as FakeFile);
    expect(verifyJpeg(jpegBytes, { width: 3886, height: 3886, metadata: META }).ok).toBe(true);
    const record = readRecord(root);
    expect(record.metadata?.state).toBe("accepted");
    expect(record.metadata?.fingerprint).toBe(metadataFingerprint(META));
    expect(record.metadata?.cost).toBeNull();
  });
});

describe("runExport — selective re-export (no redundant work)", () => {
  it("a second run with no changes does no work at all", async () => {
    const root = pairRoot();
    await runExport(args(root));
    const before = fileText(root, `${DIR}/export/export.json`);
    const spy = { renders: 0 };
    const second = await runExport(args(root, {
      record: readRecord(root),
      deps: { raster: fakeRaster(3886, 3886, spy) },
    }));
    expect(second.stages).toEqual([]);
    expect(second.status).toBe("processed");
    expect(spy.renders).toBe(0);
    expect(fileText(root, `${DIR}/export/export.json`)).toBe(before);
  });

  it("repairs existing SVG and EPS that lost accepted metadata even when fingerprints match", async () => {
    const root = pairRoot();
    const settings: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, includeEps: true };
    const info = {
      prompt: "p", provider: "Gemini", model: "gemini-3.1-flash-lite", requestId: null,
      usage: { input: 1, output: 2, total: 3 }, validation: validateMetadata(META),
    };
    await runExport(args(root, { settings, defaults: settings, metadata: META, metadataInfo: info }));
    const exportDir = dirAt(root, `${DIR}/export`);
    const jpegBefore = await bytesOf(exportDir.children.get(`${ART}.jpg`) as FakeFile);
    exportDir.children.set(`${ART}.svg`, new BinFile(`${ART}.svg`, SOURCE_SVG));
    exportDir.children.set(`${ART}.eps`, new BinFile(`${ART}.eps`,
      "%!PS-Adobe-3.0 EPSF-3.0\n%%DocumentData: Clean7Bit\n%%EOF\n"));

    const spy = { renders: 0 };
    const repaired = await runExport(args(root, {
      settings, defaults: settings, record: readRecord(root), metadata: META, metadataInfo: info,
      deps: { raster: fakeRaster(3886, 3886, spy) },
    }));

    expect(repaired.stages).not.toEqual([]);
    expect(readEmbeddedMetadata(fileText(root, `${DIR}/export/${ART}.svg`))).toEqual(META);
    expect(readXmpMetadataFromEps(fileText(root, `${DIR}/export/${ART}.eps`))).toEqual(META);
    expect(spy.renders).toBe(0);
    expect(await bytesOf(dirAt(root, `${DIR}/export`).children.get(`${ART}.jpg`) as FakeFile)).toEqual(jpegBefore);
  });

  it("a metadata edit re-embeds only — no AI, no render", async () => {
    const root = pairRoot();
    const info = {
      prompt: "p", provider: "Gemini", model: "gemini-3.1-flash-lite",
      requestId: null, usage: { input: 1, output: 2, total: 3 }, validation: validateMetadata(META),
    };
    await runExport(args(root, { metadata: META, metadataInfo: info }));
    const edited: IconMetadata = { ...META, title: "Minimal line icon of progress and speed" };
    const spy = { renders: 0 };
    const result = await runExport(args(root, {
      record: readRecord(root),
      metadata: edited,
      metadataInfo: { ...info, validation: validateMetadata(edited) },
      deps: { raster: fakeRaster(3886, 3886, spy) },
    }));
    expect(result.stages).toEqual(["embed", "validate", "commit"]);
    expect(spy.renders).toBe(0); // the JPEG is re-embedded, never re-rendered
    expect(readEmbeddedMetadata(fileText(root, `${DIR}/export/${ART}.svg`))?.title).toBe(edited.title);
    const jpegBytes = await bytesOf(dirAt(root, `${DIR}/export`).children.get(`${ART}.jpg`) as FakeFile);
    expect(verifyJpeg(jpegBytes, { width: 3886, height: 3886, metadata: edited }).ok).toBe(true);
  });

  it("a missing JPEG rebuilds only the JPEG", async () => {
    const root = pairRoot();
    await runExport(args(root));
    dirAt(root, `${DIR}/export`).children.delete(`${ART}.jpg`);
    const svgBefore = fileText(root, `${DIR}/export/${ART}.svg`);
    const spy = { renders: 0 };
    const result = await runExport(args(root, {
      record: readRecord(root),
      deps: { raster: fakeRaster(3886, 3886, spy) },
    }));
    expect(result.stages).toEqual(["render", "validate", "commit"]);
    expect(spy.renders).toBe(1);
    expect(fileText(root, `${DIR}/export/${ART}.svg`)).toBe(svgBefore); // SVG untouched
    expect(dirAt(root, `${DIR}/export`).children.has(`${ART}.jpg`)).toBe(true);
    // the record keeps naming the SVG this run did not rewrite (2026-10-08)
    expect(readRecord(root).outputs.svg).toEqual(expect.objectContaining({ path: `${DIR}/export/${ART}.svg` }));
  });

  it("keeps a numeric tail in the artifact name — `fog_AI_7.svg` exports as `fog_7.*`", async () => {
    const root = pairRoot();                       // the pair folder holds `fog_AI*`
    const dir = dirAt(root, DIR);
    const named = "fog_AI_7.svg";
    dir.children.set(named, new BinFile(named, SOURCE_SVG, 3400));
    dir.children.delete(`${STEM}.svg.json`);
    dir.children.set(`${named}.json`, new BinFile(`${named}.json`, serializePairMeta(pairFile(DIR, "fog_AI_7.png", {
      id: "pair_7", versions: [svgVersion(`${DIR}/${named}`, { version: 1, review: "approved" })],
    })), 3300));
    const result = await runExport(args(root, {
      row: { ...ROW, id: "pair_7", svgName: named, svgPath: `${DIR}/${named}`, metaPath: `${DIR}/${named}.json` },
    }));
    expect(result.status).toBe("processed");
    expect([...dirAt(root, `${DIR}/export`).children.keys()].sort())
      .toEqual(["export.json", "fog_7.jpg", "fog_7.svg"]);
  });

  it("sweeps an orphan the record never named — the old-named EPS a real folder keeps", async () => {
    const root = pairRoot();
    await runExport(args(root));                       // the current-name package: fog.svg + fog.jpg
    const dir = dirAt(root, `${DIR}/export`);
    dir.children.set(`${STEM}.eps`, new BinFile(`${STEM}.eps`, "%!PS-Adobe-3.0 EPSF-3.0", 100));
    // nothing in the record names that EPS (an older partial run rewrote it),
    // and something has to be written for the sweep to run: the JPEG is gone.
    dir.children.delete(`${ART}.jpg`);
    const result = await runExport(args(root, { record: readRecord(root), deps: { raster: fakeRaster(3886, 3886) } }));
    expect(result.status).toBe("processed");
    expect([...dir.children.keys()].sort()).toEqual(["export.json", `${ART}.jpg`, `${ART}.svg`]);
    expect(result.outputs).toEqual({ svg: null, jpg: `${ART}.jpg`, eps: null }); // only the JPEG was rebuilt
    // ...and the record still names the package that is really on disk
    const record = readRecord(root);
    expect(record.outputs).toEqual({
      svg: expect.objectContaining({ path: `${DIR}/export/${ART}.svg` }),
      jpg: expect.objectContaining({ path: `${DIR}/export/${ART}.jpg` }),
      eps: null,
    });
    expect(record.jpeg.width).toBe(3886); // the JPEG block survives a selective run
  });

  it("replaces the package an earlier version left under the bookkeeping name", async () => {
    const root = pairRoot();
    // The pre-2026-10-08 package: `fog_AI.*` beside its record naming those files.
    const dir = new BinDir("export");
    (dirAt(root, DIR) as BinDir).children.set("export", dir);
    dir.children.set(`${STEM}.svg`, new BinFile(`${STEM}.svg`, SOURCE_SVG, 3400));
    dir.children.set(`${STEM}.jpg`, new BinFile(`${STEM}.jpg`, minimalJpeg(3886, 3886), 3500));
    dir.children.set("export.json", new BinFile("export.json", serializeExportRecord(oldNameRecord()), 3300));
    const result = await runExport(args(root, { record: oldNameRecord() }));
    expect(result.status).toBe("processed");
    // The record's own files went with the rename; nothing else was touched.
    expect([...dir.children.keys()].sort()).toEqual(["export.json", `${ART}.jpg`, `${ART}.svg`]);
    expect(result.outputs).toEqual({ svg: `${ART}.svg`, jpg: `${ART}.jpg`, eps: null });
    expect(readRecord(root).source.svgPath).toBe(`${DIR}/${STEM}.svg`); // the provenance stays
  });

  it("a corrupt export.json rebuilds the whole package", async () => {
    const root = pairRoot();
    await runExport(args(root));
    dirAt(root, `${DIR}/export`).children.set("export.json", new BinFile("export.json", "nope", 1));
    const result = await runExport(args(root, { deps: { raster: fakeRaster(3886, 3886) } }));
    expect(result.stages).toEqual(["prepare", "render", "optimize", "validate", "commit"]);
    expect(result.status).toBe("processed");
    expect(readRecord(root).status).toBe("processed");
  });
});

describe("the rename migration is never allowed to lose a package", () => {
  /** A commit with nothing rebuilt — the migration's own unit seam. */
  function bareCommit(root: FakeDir, epsText: string | null, record = oldNameRecord()) {
    return commitExport({
      root, exportDir: `${DIR}/export`, stem: ART,
      svgOut: null, jpeg: null, epsText, metadata: null,
      jpegExpected: { width: 0, height: 0 },
      record, partial: epsText === null,
      epsFailure: epsText === null ? "the EPS stage failed" : null,
      validation: { svg: true, jpeg: true, eps: epsText !== null, json: true, readback: true },
      now: "2026-10-08T00:00:00.000Z",
    });
  }

  it("keeps an old-named file when this run wrote nothing to take its place", async () => {
    const root = pairRoot();
    const dir = new BinDir("export"); // only the OLD package: no fog.eps at all
    (dirAt(root, DIR) as BinDir).children.set("export", dir);
    dir.children.set(`${STEM}.eps`, new BinFile(`${STEM}.eps`, "%!PS-Adobe-3.0 EPSF-3.0", 100));
    const record = oldNameRecord(true); // the pre-rename record names that EPS
    const result = await bareCommit(root, null, record);
    expect(dir.children.has(`${STEM}.eps`)).toBe(true); // the only EPS there is stays
    expect(result.replaced).toEqual([]);
    // and the record still names it, because it is still there
    expect(result.record.outputs.eps?.path).toBe(`${DIR}/export/${STEM}.eps`);
  });

  it("stops naming a file it just removed", async () => {
    const root = pairRoot();
    const dir = new BinDir("export");
    (dirAt(root, DIR) as BinDir).children.set("export", dir);
    dir.children.set(`${STEM}.eps`, new BinFile(`${STEM}.eps`, "old", 100));
    dir.children.set(`${ART}.eps`, new BinFile(`${ART}.eps`, "%!PS-Adobe-3.0 EPSF-3.0", 100));
    // the current artifact IS on disk, so the superseded one goes...
    const record = oldNameRecord(true); // a pre-rename record that really names the EPS
    const result = await bareCommit(root, null, record);
    expect(dir.children.has(`${STEM}.eps`)).toBe(false);      // ...because its name is superseded
    expect(result.replaced).toEqual([`${DIR}/export/${STEM}.eps`]);
    // ...and the record never keeps pointing at a file that is gone
    expect(result.record.outputs.eps).toBeNull();
  });
});

describe("runExport — honest failures", () => {
  it("an EPS subset failure is `partial`: SVG/JPEG stay committed, no EPS", async () => {
    const gradient = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">`
      + `<defs><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient></defs>`
      + `<rect x="10" y="10" width="80" height="80" fill="url(#g)"/></svg>`;
    const root = pairRoot(gradient);
    const settings: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, includeEps: true };
    const result = await runExport(args(root, { settings, defaults: settings }));
    expect(result.status).toBe("partial");
    expect(result.error?.klass).toBe("eps");
    expect(result.outputs).toEqual({ svg: `${ART}.svg`, jpg: `${ART}.jpg`, eps: null });
    const exportDir = dirAt(root, `${DIR}/export`);
    expect(exportDir.children.has(`${ART}.svg`)).toBe(true);
    expect(exportDir.children.has(`${ART}.jpg`)).toBe(true);
    expect(exportDir.children.has(`${ART}.eps`)).toBe(false);
    const record = readRecord(root);
    expect(record.status).toBe("partial");
    expect(record.error).toContain("paint");
    expect(record.validation.svg).toBe(true);
    expect(record.validation.jpeg).toBe(true);
  });

  it("a prepare failure commits nothing and reports the stage", async () => {
    const withText = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="10" y="20">hi</text></svg>`;
    const root = pairRoot(withText);
    const result = await runExport(args(root));
    expect(result.status).toBe("failed");
    expect(result.error?.klass).toBe("prepare");
    expect(dirAt(root, DIR).children.has("export")).toBe(false); // nothing committed
  });

  it("an unreadable source fails in preflight", async () => {
    const root = pairRoot();
    dirAt(root, DIR).children.set(`${STEM}.svg`, new (class extends FakeFile {
      async getFile(): Promise<File> { throw new Error("locked"); }
    })(`${STEM}.svg`));
    const result = await runExport(args(root));
    expect(result.status).toBe("failed");
    expect(result.error?.klass).toBe("preflight");
  });

  it("a cancel before the stages commits nothing", async () => {
    const root = pairRoot();
    const controller = new AbortController();
    controller.abort();
    const result = await runExport(args(root, { signal: controller.signal }));
    expect(result.status).toBe("cancelled");
    expect(dirAt(root, DIR).children.has("export")).toBe(false);
  });

  it("one failing row never affects another (per-item isolation)", async () => {
    const badRoot = pairRoot(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="1" y="2">x</text></svg>`);
    const goodRoot = pairRoot();
    const bad = await runExport(args(badRoot, { row: { ...ROW, id: "pair_bad" } }));
    const good = await runExport(args(goodRoot));
    expect(bad.status).toBe("failed");
    expect(good.status).toBe("processed");
    expect((good as ExportRunResult).record?.status).toBe("processed");
  });
});

describe("runExport — EPS success and atomic leftovers", () => {
  it("commits a genuine EPS when the source is inside the subset", async () => {
    const root = pairRoot();
    const settings: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, includeEps: true };
    const result = await runExport(args(root, { settings, defaults: settings }));
    expect(result.status).toBe("processed");
    expect(result.outputs.eps).toBe(`${ART}.eps`);
    const eps = fileText(root, `${DIR}/export/${ART}.eps`);
    expect(verifyEps(eps).ok).toBe(true);
    expect(eps.startsWith("%!PS-Adobe-3.0 EPSF-3.0")).toBe(true);
  });

  it("a transparent background (the default) ships the artboard rect INVISIBLE in the SVG, no shape for it in the EPS, and flattens the JPEG onto white (2026-10-08, I-60 2026-10-09)", async () => {
    const root = pairRoot();
    const settings: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, background: "transparent", includeEps: true };
    const seen: string[] = [];
    const raster: RasterDeps = {
      render: async (_svg, target) => { seen.push(target.background); return { width: 3886, height: 3886 } as unknown as HTMLCanvasElement; },
      encode: async () => minimalJpeg(3886, 3886),
    };
    const result = await runExport(args(root, { settings, defaults: settings, deps: { raster } }));
    expect(result.status).toBe("processed");
    expect(seen).toEqual(["#ffffff"]); // JPEG has no alpha: flattened onto white, never "transparent"
    const svg = fileText(root, `${DIR}/export/${ART}.svg`);
    expect(verifyExportSvg(svg)).toEqual([]);
    expect(svg).not.toMatch(/<svg[^>]*\swidth=/); // no px size on the root either
    const board = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement.firstElementChild!;
    expect(board.getAttribute("fill")).toBe("none"); // the artboard is an object, but paints nothing
    expect(svg).not.toMatch(/fill="#fff/);
    const eps = fileText(root, `${DIR}/export/${ART}.eps`);
    expect(verifyEps(eps).ok).toBe(true);
    expect(eps.match(/gsave/g)).toHaveLength(1); // the artwork's one shape — the unpainted artboard emits nothing
    expect(readRecord(root).settings.effective.background).toBe("transparent");
  });

  it("a colour background still paints the rect and flattens onto that colour", async () => {
    const root = pairRoot();
    const settings: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, background: "#102030", includeEps: true };
    const seen: string[] = [];
    const raster: RasterDeps = {
      render: async (_svg, target) => { seen.push(target.background); return { width: 3886, height: 3886 } as unknown as HTMLCanvasElement; },
      encode: async () => minimalJpeg(3886, 3886),
    };
    const result = await runExport(args(root, { settings, defaults: settings, deps: { raster } }));
    expect(result.status).toBe("processed");
    expect(seen).toEqual(["#102030"]);
    const svg = fileText(root, `${DIR}/export/${ART}.svg`);
    expect(svg).toContain(`fill="#102030"`);
    expect(verifyEps(fileText(root, `${DIR}/export/${ART}.eps`)).ok).toBe(true);
  });

  it("a leftover tmp file is harmless and overwritten", async () => {
    const root = pairRoot();
    await runExport(args(root));
    const exportDir = dirAt(root, `${DIR}/export`);
    exportDir.children.set(`${ART}.svg.tmp`, new BinFile(`${ART}.svg.tmp`, "junk", 1));
    const result = await runExport(args(root, { record: readRecord(root) }));
    expect(result.stages).toEqual([]); // nothing to do — the tmp is not an output
    expect((exportDir.children.get(`${ART}.svg.tmp`) as FakeFile)?.text).toBe("junk"); // untouched, harmless
  });
});
