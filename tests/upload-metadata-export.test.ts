// RULE 8 — end-to-end: an approved SVG asset is exported through the real
// pipeline to JPEG and EPS with accepted metadata, and the Title / Description
// / Tags are read back straight from the committed file bytes — exactly what a
// stock website reads from the uploaded file (EPS: XMP pdfmark stream; JPEG:
// XMP APP1 segment). Uses the two SVG assets under
// tests/assets/SVG to JPEG or EPS export tests/.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runExport, type ExportRunArgs } from "../src/upload/runexport";
import {
  DEFAULT_UPLOAD_SETTINGS,
  type UploadSettings,
} from "../src/lib/upload/settings";
import { readJpegDimensions, readXmpMetadata, verifyJpeg } from "../src/lib/upload/jpeg";
import { readXmpMetadataFromEps, verifyEpsMetadata } from "../src/lib/upload/epsmetadata";
import {
  metadataFingerprint,
  validateMetadata,
  type IconMetadata,
} from "../src/lib/upload/meta";
import { minimalJpeg } from "./helpers/minijpeg";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { serializePairMeta } from "../src/lib/pairmeta";
import type { UploadRowSource } from "../src/upload/discovery";

const ASSET = "tests/assets/SVG to JPEG or EPS export tests";
const JPEG_SOURCE = readFileSync(`${ASSET}/source-for-jpeg.svg`, "utf8");
const EPS_SOURCE = readFileSync(`${ASSET}/source-for-eps.svg`, "utf8");

const OUT = "_split_output/2026-10/2026-10-01_10-24-31";
const DIR = `${OUT}/test_pair/split_01`;
const AI = "test_pair_AI.png";
const STEM = "test_pair_AI";
const ART = "test_pair"; // artifact name after the _AI marker is trimmed

const JPEG_META: IconMetadata = {
  title: "Test icon for JPEG export",
  description: "A minimal line icon used to verify JPEG metadata",
  tags: ["icon", "pictogram", "vector", "stroke", "line", "editable", "web", "jpeg", "test", "metadata"],
};

const EPS_META: IconMetadata = {
  title: "Test icon for EPS export",
  description: "A minimal line icon used to verify EPS metadata",
  tags: ["icon", "pictogram", "vector", "stroke", "line", "editable", "web", "eps", "test", "metadata"],
};

/** A fake canvas transport that encodes a real minimal JPEG at the requested target size. */
function fakeRaster(spy?: { renders: number }) {
  return {
    render: async (_svg: string, target: { width: number; height: number }) => {
      if (spy) spy.renders++;
      return target as unknown as HTMLCanvasElement;
    },
    encode: async (canvas: HTMLCanvasElement) => minimalJpeg(canvas.width, canvas.height),
  };
}

function dirAt(root: BinDir, path: string): BinDir {
  let node = root;
  for (const part of path.split("/")) node = node.children.get(part) as BinDir;
  return node;
}

/** The pair folder: AI image, approved sidecar, and the SVG source under test. */
function pairRoot(svgText: string): BinDir {
  const root = new BinDir("test_processing");
  let node = root;
  for (const part of DIR.split("/")) {
    const made = new BinDir(part);
    node.children.set(part, made);
    node = made;
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
  id: "pair_test",
  base: "test_pair",
  suffix: "",
  dirPath: DIR,
  version: 1,
  svgPath: `${DIR}/${STEM}.svg`,
  svgName: `${STEM}.svg`,
  fingerprint: "sha256:source",
  aiPath: `${DIR}/${AI}`,
  metaPath: `${DIR}/${STEM}.svg.json`,
  approvedValid: 1,
};

function args(root: BinDir, over: Partial<ExportRunArgs> = {}): ExportRunArgs {
  return {
    root,
    row: ROW,
    settings: { ...DEFAULT_UPLOAD_SETTINGS },
    defaults: { ...DEFAULT_UPLOAD_SETTINGS },
    overrides: {},
    metadata: null,
    metadataInfo: null,
    record: null,
    deps: { raster: fakeRaster() },
    ...over,
  };
}

/** The committed export.json read back from the fake folder. */
function readRecord(root: BinDir) {
  const file = dirAt(root, `${DIR}/export`).children.get("export.json") as BinFile;
  const raw = new TextDecoder().decode(file.bytes);
  return JSON.parse(raw);
}

/** The committed JPEG bytes. */
async function jpegBytes(root: BinDir): Promise<Uint8Array> {
  const file = dirAt(root, `${DIR}/export`).children.get(`${ART}.jpg`) as BinFile;
  return new Uint8Array(await (await file.getFile()).arrayBuffer());
}

/** The committed EPS text. */
function epsText(root: BinDir): string {
  return (dirAt(root, `${DIR}/export`).children.get(`${ART}.eps`) as BinFile).text;
}

const INFO = {
  prompt: "the prompt",
  provider: "Gemini",
  model: "gemini-3.1-flash-lite",
  requestId: "req-1",
  usage: { input: 1, output: 2, total: 3 },
};

describe("SVG asset → exported JPEG and EPS carry readable metadata", () => {
  it("writes Title / Description / Tags into the exported JPEG (XMP) and reads them back", async () => {
    const root = pairRoot(JPEG_SOURCE);
    const settings: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, includeEps: false };
    const result = await runExport(args(root, {
      settings, defaults: settings,
      metadata: JPEG_META,
      metadataInfo: { ...INFO, validation: validateMetadata(JPEG_META) },
      deps: { raster: fakeRaster() },
    }));
    expect(result.status).toBe("processed");
    expect(result.outputs).toEqual({ svg: `${ART}.svg`, jpg: `${ART}.jpg`, eps: null });

    const bytes = await jpegBytes(root);
    const dims = readJpegDimensions(bytes);
    expect(dims).not.toBeNull();
    expect(verifyJpeg(bytes, { width: dims!.width, height: dims!.height, metadata: JPEG_META }).ok).toBe(true);
    expect(readXmpMetadata(bytes)).toEqual(JPEG_META);

    const record = readRecord(root);
    expect(record.metadata?.state).toBe("accepted");
    expect(record.metadata?.fingerprint).toBe(metadataFingerprint(JPEG_META));
    expect(record.outputs.jpg?.path).toBe(`${DIR}/export/${ART}.jpg`);
  });

  it("writes Title / Description / Tags into the exported EPS (XMP pdfmark) and reads them back", async () => {
    const root = pairRoot(EPS_SOURCE);
    const settings: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, includeEps: true };
    const result = await runExport(args(root, {
      settings, defaults: settings,
      metadata: EPS_META,
      metadataInfo: { ...INFO, validation: validateMetadata(EPS_META) },
      deps: { raster: fakeRaster() },
    }));
    expect(result.status).toBe("processed");
    expect(result.outputs).toEqual({ svg: `${ART}.svg`, jpg: `${ART}.jpg`, eps: `${ART}.eps` });

    const eps = epsText(root);
    expect(eps).toContain("%ADO_ContainsXMP: MainFirst");
    expect(eps).toContain("%%DocumentData: Clean8Bit");
    expect(readXmpMetadataFromEps(eps)).toEqual(EPS_META);
    expect(verifyEpsMetadata(eps, EPS_META)).toBe(true);

    const record = readRecord(root);
    expect(record.validation).toMatchObject({ eps: true, readback: true });
    expect(record.outputs.eps?.path).toBe(`${DIR}/export/${ART}.eps`);
  });

  it("a metadata edit re-embeds JPEG and EPS without re-rendering (read-back reflects the edit)", async () => {
    const root = pairRoot(JPEG_SOURCE);
    const settings: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, includeEps: true };
    const info = { ...INFO, validation: validateMetadata(JPEG_META) };
    await runExport(args(root, { settings, defaults: settings, metadata: JPEG_META, metadataInfo: info }));
    const beforeJpeg = await jpegBytes(root);
    const beforeEps = epsText(root);

    const edited: IconMetadata = { ...JPEG_META, title: "Test icon for JPEG export — edited" };
    const spy = { renders: 0 };
    const result = await runExport(args(root, {
      record: readRecord(root),
      settings, defaults: settings,
      metadata: edited,
      metadataInfo: { ...info, validation: validateMetadata(edited) },
      deps: { raster: fakeRaster(spy) },
    }));
    expect(result.status).toBe("processed");
    expect(spy.renders).toBe(0); // no re-render on a metadata-only edit

    expect(readXmpMetadata(await jpegBytes(root))).toEqual(edited);
    expect(readXmpMetadataFromEps(epsText(root))).toEqual(edited);
    // the JPEG was re-embedded (metadata changed), so bytes differ from before
    expect(await jpegBytes(root)).not.toEqual(beforeJpeg);
    expect(epsText(root)).not.toEqual(beforeEps);
  });
});
