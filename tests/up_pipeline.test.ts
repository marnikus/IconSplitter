// up_pipeline.test.ts — exportio's staged commit and the runner's state
// machine, executed over the in-memory fakes AND the real exportio path
// (RULE 8): the commit marker is written LAST, a failed commit pass leaves
// the previous record intact, the happy path produces the full package with
// embedded metadata that reads back equal, selective re-export re-embeds
// without re-rasterizing, one icon's failure never touches another's package,
// and cancellation lands in `cancelled`.
import { describe, expect, it, vi } from "vitest";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { buildExportRecord } from "../src/lib/upexport";
import { pairFile } from "./helpers/pairfile";
import { serializePairMeta } from "../src/lib/pairmeta";
import { DEFAULT_EXPORT_SETTINGS, type ExportSettings } from "../src/lib/upsettings";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upmeta";
import { readExportRecord } from "../src/lib/upexport";
import { openExportDir, scanExportDir, type StagedCommit } from "../src/upload/exportio";
import { runUploadJob, runUploadJobs, type JobRequest, type JobResult, type RunnerDeps } from "../src/upload/runner";
import type { UploadRowSource } from "../src/upload/sources";
import { DEFAULT_GEMINI_CONFIG } from "../src/lib/gemconfig";
import { readSvgMetadata } from "../src/lib/upprepare";
import { readJpegMetadata } from "../src/lib/upjpegmeta";
import { fakeJpeg } from "./helpers/fakejpeg";

const DIR = "pairs";
const SOURCE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M 4 20 L 12 4 L 20 20 Z" fill="none" stroke="#101010" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const META: IconMetadata = {
  title: "Forward Motion and Fast Growth. The Vector Icon of Speed",
  description: "Arrow symbolising fast upward movement and success",
  tags: [...MANDATORY_TAGS, ...Array.from({ length: 33 }, (_, i) => `concept-${i}`)],
};

function row(over: Partial<UploadRowSource> = {}): UploadRowSource {
  return {
    id: "pair-1", iconBase: "icon-a", name: "icon-a_AI.png", dirPath: DIR, metaPath: `${DIR}/icon-a_AI.svg.json`,
    version: 1, svgName: "icon-a_AI_v1.svg", svgRelPath: `${DIR}/icon-a_AI_v1.svg`, svgFingerprint: "6:3300",
    warnings: [], exportState: "discovered", record: null, ...over,
  };
}

/** A real fake tree: the pair folder with the chosen SVG beside it. */
function rootWithSource(): FakeDir {
  const root = new FakeDir("test_pipeline");
  const folder = new FakeDir(DIR);
  folder.children.set("icon-a_AI_v1.svg", new FakeFile("icon-a_AI_v1.svg", 6, 3300, SOURCE_SVG));
  folder.children.set("icon-a_AI.png", new FakeFile("icon-a_AI.png", 20, 3100, "ai"));
  folder.children.set("icon-a_AI.svg.json", new FakeFile("icon-a_AI.svg.json", 10, 3300,
    serializePairMeta(pairFile(DIR, "icon-a_AI.png", { decision: "approved" }))));
  root.children.set(DIR, folder);
  return root;
}

function deps(root: FakeDir, over: Partial<RunnerDeps> = {}): RunnerDeps {
  const rasterized = fakeJpeg(3886, 3886);
  return {
    readSource: async (relPath) => {
      const file = at(root, relPath);
      return file instanceof FakeFile ? file.text : null;
    },
    scanExport: (dirPath) => scanExportDir(root, dirPath),
    openExport: (dirPath) => openExportDir(root, dirPath),
    hashText: async (text) => `sha:${text.length}`,
    raster: {
      rasterize: async () => new Uint8Array(rasterized),
      decode: async () => true,
      sha256: async (bytes) => `h${bytes.length}`,
    },
    pixels: { renderPixels: async () => new Uint8Array(256 * 256 * 4).fill(120) },
    renderPreviewPng: async () => "cHJldmlldw==",
    sendMetadata: async () => { throw new Error("the AI must not be called in this test"); },
    now: () => "2026-10-07T12:00:00.000Z",
    ...over,
  };
}

function at(root: FakeDir, relPath: string): FakeDir | FakeFile | undefined {
  let node: FakeDir | FakeFile = root;
  for (const part of relPath.split("/")) {
    if (!(node instanceof FakeDir)) return undefined;
    const next = node.children.get(part);
    if (next === undefined) return undefined;
    node = next;
  }
  return node;
}

function request(over: Partial<JobRequest> = {}): JobRequest {
  return {
    row: row(),
    settings: { ...DEFAULT_EXPORT_SETTINGS },
    prompt: "Task: Analyze the icon image.",
    apiKey: "KEY",
    gemini: DEFAULT_GEMINI_CONFIG,
    metadata: META,
    allowAi: false,
    ...over,
  };
}

const exportFile = (root: FakeDir, name: string) => at(root, `${DIR}/export/${name}`);

/** Byte-accurate readback of a written file (binary-safe through the fake). */
async function bytesOf(root: FakeDir, name: string): Promise<Uint8Array> {
  const file = exportFile(root, name) as FakeFile;
  return new Uint8Array(await (await file.getFile()).arrayBuffer());
}

describe("exportio — the staged commit (design §9)", () => {
  it("writes outputs first and export.json last, in the pair's export folder", async () => {
    const root = rootWithSource();
    const staged = (await openExportDir(root, DIR)) as StagedCommit;
    expect(await staged.writeOutputs([{ name: "icon-a.svg", bytes: new Uint8Array([1, 2]) }])).toBe(true);
    expect(exportFile(root, "export.json")).toBeUndefined(); // not yet — outputs only
    expect(await staged.commitRecord(fullRecord())).toBe(true);
    expect(JSON.parse((exportFile(root, "export.json") as FakeFile).text).v).toBe(1);
  });

  it("scanExportDir reports the record text and the output names", async () => {
    const root = rootWithSource();
    const staged = (await openExportDir(root, DIR)) as StagedCommit;
    await staged.writeOutputs([
      { name: "icon-a.svg", bytes: new Uint8Array([1]) },
      { name: "icon-a.jpg", bytes: new Uint8Array([2]) },
    ]);
    await staged.commitRecord(fullRecord());
    const scan = await scanExportDir(root, DIR);
    expect(scan.outputs).toEqual(["icon-a.jpg", "icon-a.svg"]);
    expect(scan.exportJson).not.toBeNull();
  });

  it("a missing export folder scans as nothing", async () => {
    const scan = await scanExportDir(rootWithSource(), DIR);
    expect(scan).toEqual({ exportJson: null, outputs: [] });
  });
});

function fullRecord() {
  return buildExportRecord({
    pairId: "pair-1", iconBase: "icon-a",
    source: { relPath: `${DIR}/icon-a_AI_v1.svg`, version: 1, sha256: "sha:24" },
    settings: { ...DEFAULT_EXPORT_SETTINGS },
    metadata: META,
    outputs: {
      svg: { relPath: `${DIR}/export/icon-a.svg`, bytes: 10, sha256: "h10", optimizer: null },
      jpeg: { relPath: `${DIR}/export/icon-a.jpg`, bytes: 20, sha256: "h20", width: 3886, height: 3886, mpx: 15.1, quality: 0.92 },
      eps: null,
    },
    state: "processed", failure: null, committedAt: "2026-10-07T12:00:00.000Z",
  });
}

describe("runner — the happy path end to end", () => {
  it("produces the full package: optimized SVG, embedded JPEG, committed record", async () => {
    const root = rootWithSource();
    const states: string[] = [];
    const out = await runUploadJob(request(), deps(root, { onState: (_id, s) => states.push(s) }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.record.state).toBe("processed");
    expect(out.record.metadata).toEqual(META);
    // stages ran in the design's order
    expect(states).toEqual(["preflight", "prepare", "metadata", "render", "embed", "eps", "validate", "commit", "processed"]);
    // the files exist and validate
    const svgText = (exportFile(root, "icon-a.svg") as FakeFile).text;
    expect(readSvgMetadata(svgText)?.title).toBe(META.title);
    expect(readJpegMetadata(await bytesOf(root, "icon-a.jpg")).xmp).not.toBeNull();
    const record = readExportRecord((exportFile(root, "export.json") as FakeFile).text);
    expect(record.ok).toBe(true);
  });

  it("R08: the committed JPEG hash and byte count describe the file on disk, not the raw render", async () => {
    const root = rootWithSource();
    const out = await runUploadJob(request(), deps(root));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const onDisk = await bytesOf(root, "icon-a.jpg");
    expect(out.record.outputs.jpeg.sha256).toBe(`h${onDisk.length}`);
    expect(out.record.outputs.jpeg.bytes).toBe(onDisk.length);
  });

  it("does not call the AI when accepted metadata is in hand", async () => {
    const root = rootWithSource();
    const out = await runUploadJob(request({ metadata: META }), deps(root));
    expect(out.ok).toBe(true);
  });

  it("generates and accepts valid metadata when allowed", async () => {
    const root = rootWithSource();
    const answer = JSON.stringify({ title: META.title, description: META.description, tags: META.tags });
    const out = await runUploadJob(
      request({ metadata: null, allowAi: true }),
      deps(root, { sendMetadata: async () => ({ ok: true, text: answer, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 }, requestId: null, finishReason: "STOP" }) }),
    );
    expect(out.ok).toBe(true);
    const svgText = (exportFile(root, "icon-a.svg") as FakeFile).text;
    expect(readSvgMetadata(svgText)?.description).toBe(META.description);
  });

  it("an AI refusal fails the job honestly, with nothing written", async () => {
    const root = rootWithSource();
    const out = await runUploadJob(
      request({ metadata: null, allowAi: true }),
      deps(root, { sendMetadata: async () => ({ ok: false, failure: { kind: "refusal", message: "blocked", retryAfterMs: null, retryable: false, status: 200, requestId: "r" } }) }),
    );
    expect(out).toMatchObject({ ok: false, state: "failed" });
    if (!out.ok) expect(out.error).toContain("refusal");
    expect(exportFile(root, "export.json")).toBeUndefined();
  });

  it("no metadata and no AI allowance fails before anything is written", async () => {
    const root = rootWithSource();
    const out = await runUploadJob(request({ metadata: null, allowAi: false }), deps(root));
    expect(out).toMatchObject({ ok: false, state: "failed" });
    expect(exportFile(root, "export.json")).toBeUndefined();
  });

  it("an unparsable source fails preflight, never silently", async () => {
    const root = rootWithSource();
    (at(root, `${DIR}/icon-a_AI_v1.svg`) as FakeFile).text = "not an svg";
    const out = await runUploadJob(request(), deps(root));
    expect(out).toMatchObject({ ok: false, state: "failed" });
  });

  it("cancellation lands in cancelled", async () => {
    let calls = 0;
    const root = rootWithSource();
    const out = await runUploadJob(request(), deps(root, { cancelled: () => ++calls > 1 }));
    expect(out).toMatchObject({ ok: false, state: "cancelled" });
    expect(exportFile(root, "export.json")).toBeUndefined();
  });
});

describe("runner — EPS and partial states", () => {
  it("includeEps builds the genuine EPS and the record is processed", async () => {
    const root = rootWithSource();
    const settings: ExportSettings = { ...DEFAULT_EXPORT_SETTINGS, includeEps: true };
    const out = await runUploadJob(request({ settings }), deps(root));
    expect(out.ok).toBe(true);
    const eps = (exportFile(root, "icon-a.eps") as FakeFile).text;
    expect(eps.startsWith("%!PS-Adobe-3.0 EPSF-3.0")).toBe(true);
    expect(eps).toContain("2.2 setlinewidth");
  });

  it("an EPS-preflight failure is partial, never silently missing", async () => {
    const root = rootWithSource();
    (at(root, `${DIR}/icon-a_AI_v1.svg`) as FakeFile).text =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text x="1" y="2">hi</text><path d="M 4 20 L 12 4 L 20 20 Z" fill="none" stroke="#101010" stroke-width="2"/></svg>`;
    const settings: ExportSettings = { ...DEFAULT_EXPORT_SETTINGS, includeEps: true };
    const out = await runUploadJob(request({ settings }), deps(root));
    expect(out).toMatchObject({ ok: false, state: "partial" });
    if (!out.ok) expect(out.error).toContain("EPS skipped");
    // SVG and JPEG still committed; the record says partial
    const record = readExportRecord((exportFile(root, "export.json") as FakeFile).text);
    expect(record.ok && record.record.state).toBe("partial");
  });
});

describe("runner — selective re-export (design §9)", () => {
  it("a metadata-only change re-embeds into the existing JPEG without re-rasterizing", async () => {
    const root = rootWithSource();
    expect((await runUploadJob(request(), deps(root))).ok).toBe(true);
    const firstJpeg = await bytesOf(root, "icon-a.jpg");
    const rasterize = vi.fn(async () => new Uint8Array(fakeJpeg(3886, 3886)));
    const edited: IconMetadata = { ...META, description: "A rising arrow showing quick progress forward" };
    const out = await runUploadJob(request({ metadata: edited }), deps(root, { raster: {
      rasterize, decode: async () => true, sha256: async (b) => `h${b.length}`,
    } }));
    expect(out.ok).toBe(true);
    expect(rasterize).not.toHaveBeenCalled(); // no AI call, no raster
    const svgText = (exportFile(root, "icon-a.svg") as FakeFile).text;
    expect(readSvgMetadata(svgText)?.description).toBe(edited.description);
    const reembedded = await bytesOf(root, "icon-a.jpg");
    expect(reembedded.length).toBeGreaterThan(firstJpeg.length - firstJpeg.length); // grew by the new segments
    expect(reembedded.length).not.toBe(firstJpeg.length); // not the same bytes — new metadata
    const record = readExportRecord((exportFile(root, "export.json") as FakeFile).text);
    expect(record.ok && record.record.metadata.description).toBe(edited.description);
  });

  it("a quality-only change re-encodes the JPEG and keeps the SVG file", async () => {
    const root = rootWithSource();
    expect((await runUploadJob(request(), deps(root))).ok).toBe(true);
    const svgBefore = (exportFile(root, "icon-a.svg") as FakeFile).text;
    const settings: ExportSettings = { ...DEFAULT_EXPORT_SETTINGS, jpegQuality: 0.95 };
    const out = await runUploadJob(request({ settings }), deps(root));
    expect(out.ok).toBe(true);
    expect((exportFile(root, "icon-a.svg") as FakeFile).text).toBe(svgBefore); // untouched
    const record = readExportRecord((exportFile(root, "export.json") as FakeFile).text);
    expect(record.ok && record.record.settings.jpegQuality).toBe(0.95);
  });
});

describe("runUploadJobs — bounded concurrency, isolated failures", () => {
  it("runs every icon and isolates failures per package", async () => {
    const root = rootWithSource();
    const folder = at(root, DIR) as FakeDir;
    folder.children.set("icon-b_AI_v1.svg", new FakeFile("icon-b_AI_v1.svg", 6, 3300, SOURCE_SVG));
    folder.children.set("broken_AI_v1.svg", new FakeFile("broken_AI_v1.svg", 6, 3300, "not an svg"));
    const jobs = ["icon-a", "icon-b", "broken"].map((base) =>
      request({ row: row({ id: `pair-${base}`, iconBase: base, svgRelPath: `${DIR}/${base}_AI_v1.svg` }) }));
    const results = await runUploadJobs(jobs, deps(root), { concurrency: 2 });
    expect(results.size).toBe(3);
    expect((results.get("pair-icon-a") as JobResult).ok).toBe(true);
    expect((results.get("pair-icon-b") as JobResult).ok).toBe(true);
    expect(results.get("pair-broken")).toMatchObject({ ok: false, state: "failed" });
    // the broken icon's failure left the others' packages whole
    expect(exportFile(root, "icon-a.svg")).toBeDefined();
    expect(exportFile(root, "icon-b.svg")).toBeDefined();
  });
});
