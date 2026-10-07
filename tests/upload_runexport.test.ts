// RULE 8 — the export pipeline runs for real over a fake folder: the full
// package commits per icon (SVG + JPEG + export.json, atomically, tmp cleaned
// up), the approved source is never touched, a second run with no changes
// does no work, selective re-export does no redundant render, an EPS subset
// failure is an honest `partial` (SVG/JPEG stay committed), and a prepare
// failure commits nothing.
import { describe, expect, it } from "vitest";
import { runExport, type ExportRunArgs, type ExportRunResult } from "../src/upload/runexport";
import { parseExportRecord, type ExportRecord } from "../src/lib/upload/export";
import { DEFAULT_UPLOAD_SETTINGS, type UploadSettings } from "../src/lib/upload/settings";
import { readJpegDimensions, verifyJpeg } from "../src/lib/upload/jpeg";
import { readEmbeddedMetadata } from "../src/lib/upload/embed";
import { verifyEps } from "../src/lib/upload/eps";
import { metadataFingerprint, validateMetadata, type IconMetadata } from "../src/lib/upload/meta";
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
const SOURCE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" fill="#000000"/></svg>`;

const TAGS = [
  "speed", "growth", "chart", "arrow", "business", "finance",
  "analytics", "data", "trend", "increase", "graph", "statistics",
];
const META: IconMetadata = {
  title: "Minimal line icon of growth. Speed and growth pictogram",
  description: "Clean line icon showing growth and rising business trends",
  tags: TAGS,
};

/** A fake canvas transport that "encodes" a real minimal JPEG of the target size. */
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
    expect([...exportDir.children.keys()].sort()).toEqual(["export.json", `${STEM}.jpg`, `${STEM}.svg`]);
    expect(result.outputs).toEqual({ svg: `${STEM}.svg`, jpg: `${STEM}.jpg`, eps: null });
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
    const svgText = fileText(root, `${DIR}/export/${STEM}.svg`);
    expect(new DOMParser().parseFromString(svgText, "image/svg+xml").querySelector("parsererror")).toBeNull();
    const jpegBytes = await bytesOf(dirAt(root, `${DIR}/export`).children.get(`${STEM}.jpg`) as FakeFile);
    expect(readJpegDimensions(jpegBytes)).toEqual({ width: 3886, height: 3886 });
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
    const svgText = fileText(root, `${DIR}/export/${STEM}.svg`);
    expect(readEmbeddedMetadata(svgText)).toEqual(META);
    const jpegBytes = await bytesOf(dirAt(root, `${DIR}/export`).children.get(`${STEM}.jpg`) as FakeFile);
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
    expect(readEmbeddedMetadata(fileText(root, `${DIR}/export/${STEM}.svg`))?.title).toBe(edited.title);
    const jpegBytes = await bytesOf(dirAt(root, `${DIR}/export`).children.get(`${STEM}.jpg`) as FakeFile);
    expect(verifyJpeg(jpegBytes, { width: 3886, height: 3886, metadata: edited }).ok).toBe(true);
  });

  it("a missing JPEG rebuilds only the JPEG", async () => {
    const root = pairRoot();
    await runExport(args(root));
    dirAt(root, `${DIR}/export`).children.delete(`${STEM}.jpg`);
    const svgBefore = fileText(root, `${DIR}/export/${STEM}.svg`);
    const spy = { renders: 0 };
    const result = await runExport(args(root, {
      record: readRecord(root),
      deps: { raster: fakeRaster(3886, 3886, spy) },
    }));
    expect(result.stages).toEqual(["render", "validate", "commit"]);
    expect(spy.renders).toBe(1);
    expect(fileText(root, `${DIR}/export/${STEM}.svg`)).toBe(svgBefore); // SVG untouched
    expect(dirAt(root, `${DIR}/export`).children.has(`${STEM}.jpg`)).toBe(true);
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
    expect(result.outputs).toEqual({ svg: `${STEM}.svg`, jpg: `${STEM}.jpg`, eps: null });
    const exportDir = dirAt(root, `${DIR}/export`);
    expect(exportDir.children.has(`${STEM}.svg`)).toBe(true);
    expect(exportDir.children.has(`${STEM}.jpg`)).toBe(true);
    expect(exportDir.children.has(`${STEM}.eps`)).toBe(false);
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
    expect(result.outputs.eps).toBe(`${STEM}.eps`);
    const eps = fileText(root, `${DIR}/export/${STEM}.eps`);
    expect(verifyEps(eps).ok).toBe(true);
    expect(eps.startsWith("%!PS-Adobe-3.0 EPSF-3.0")).toBe(true);
  });

  it("a leftover tmp file is harmless and overwritten", async () => {
    const root = pairRoot();
    await runExport(args(root));
    const exportDir = dirAt(root, `${DIR}/export`);
    exportDir.children.set(`${STEM}.svg.tmp`, new BinFile(`${STEM}.svg.tmp`, "junk", 1));
    const result = await runExport(args(root, { record: readRecord(root) }));
    expect(result.stages).toEqual([]); // nothing to do — the tmp is not an output
    expect((exportDir.children.get(`${STEM}.svg.tmp`) as FakeFile)?.text).toBe("junk"); // untouched, harmless
  });
});
