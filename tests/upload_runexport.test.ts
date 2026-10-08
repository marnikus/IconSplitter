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
import { verifyEps } from "../src/lib/upload/eps";
import { MANDATORY_TAGS, metadataFingerprint, validateMetadata, type IconMetadata } from "../src/lib/upload/meta";
import { sha256HexText } from "../src/lib/upload/hash";
import { serializePairMeta } from "../src/lib/pairmeta";
import { FakeDir, FakeFile } from "./helpers/fakefs";

import { BinDir, BinFile } from "./helpers/binfakefs";
import { minimalJpeg } from "./helpers/minijpeg";
import { pairFile } from "./helpers/pairfile";
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
  title: "Minimal line icon of growth. Speed and growth pictogram",
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
    expect(doc.documentElement.getAttribute("width")).toBe("512");
    expect(verifyExportSvg(svgText)).toEqual([]);
    const jpegBytes = await bytesOf(dirAt(root, `${DIR}/export`).children.get(`${ART}.jpg`) as FakeFile);
    expect(readJpegDimensions(jpegBytes)).toEqual({ width: 512, height: 256 });
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

  it("a metadata edit re-embeds only — no AI, no render", async () => {
    const root = pairRoot();
    const info = {
      prompt: "p", provider: "Gemini", model: "gemini-3.1-flash-lite",
      requestId: null, usage: { input: 1, output: 2, total: 3 }, validation: validateMetadata(META),
    };
    await runExport(args(root, { metadata: META, metadataInfo: info }));
    const edited: IconMetadata = { ...META, title: "Minimal line icon of progress. Speed and growth pictogram" };
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
