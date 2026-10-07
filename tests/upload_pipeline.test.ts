// upload_pipeline.test.ts — the export as a whole (RULE 11/19): the stage
// order, the read-back that proves what was written, the discard-on-failure
// rule, and the selective re-export decisions that avoid redundant work.
import { describe, expect, it } from "vitest";
import { planFor, runPipeline, type PipelineDeps, type PipelineInput } from "../src/lib/uploadpipeline";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/uploadsettings";
import { REQUIRED_TAGS, TAG_COUNT, validateMetadata, type MetadataRecord } from "../src/lib/uploadmeta";
import { hashBytes, parseRecord, isGreen, outputsOf } from "../src/lib/uploadrecord";
import { jpegInfo } from "../src/lib/jpegmeta";
import { readSvgMetadata } from "../src/lib/svgmeta";
import { svgToEps } from "../src/lib/epssvg";
import { verifyEps } from "../src/lib/epsverify";
import { minimalJpeg } from "./helpers/jpeg";

const settings = { ...DEFAULT_UPLOAD_SETTINGS, targetMP: 0.1, optimizeSvg: false, includeEps: false };
const code = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">'
  + '<rect x="4" y="4" width="32" height="32" fill="#123456"/>'
  + '<path d="M8 20 L32 20" stroke="#ffffff" stroke-width="4" fill="none"/></svg>';

const metadata: MetadataRecord = {
  title: "Directional Momentum Conveying Forward Progress. Speed and motion.",
  description: "Arrow-like symbol expressing forward momentum and purposeful movement for interfaces.",
  tags: [...REQUIRED_TAGS, ...Array.from({ length: TAG_COUNT - REQUIRED_TAGS.length }, (_, i) => `tag-${i}`)],
};
const accept = () => validateMetadata(metadata);

interface Staging {
  written: Map<string, Uint8Array | string>;
  committed: string[];
  discarded: string[];
  log: string[];
}

function staging(): Staging {
  return { written: new Map(), committed: [], discarded: [], log: [] };
}

function deps(overrides: Partial<PipelineDeps> = {}, stage: Staging = staging()) {
  const rasterCalls: number[] = [];
  const base: PipelineDeps = {
    write: async (name, data) => { stage.written.set(name, data); },
    commit: async (names) => { stage.committed = [...names]; },
    discard: async (names) => { stage.discarded = [...names]; },
    raster: async (_svg, artboard) => {
      rasterCalls.push(artboard.px.width);
      const bytes = minimalJpeg(artboard.px.width, artboard.px.height);
      return { ok: true, bytes, error: null, width: artboard.px.width, height: artboard.px.height };
    },
    eps: (svg, artboard) => svgToEps({ svg, widthPt: artboard.px.width / 4, heightPt: artboard.px.height / 4 }),
    verifyEps: async (file) => {
      const result = await verifyEps({ eps: file.eps, expectedPt: { width: file.width, height: file.height }, render: async () => true });
      return { ok: result.ok, label: "EPSF-3.0 verified", problems: result.checks.problems };
    },
    log: (entry) => { stage.log.push(`${entry.stage}: ${entry.message}`); },
    signal: new AbortController().signal,
    now: () => "2026-10-07T12:00:00.000Z",
  };
  return { deps: { ...base, ...overrides }, rasterCalls, stage };
}

function input(patch: Partial<PipelineInput> = {}): PipelineInput {
  return {
    source: { id: "s1", name: "arrow-right", path: "pairs/arrow/source.png", code, hash: "abc", version: "v1" },
    record: null,
    settings,
    override: {},
    metadata,
    metadataCheck: accept(),
    want: { svg: true, jpeg: true, eps: false },
    existing: {},
    createdAt: "2026-10-07T12:00:00.000Z",
    ...patch,
  };
}

describe("runPipeline", () => {
  it("publishes a green package: svg + jpeg + export.json, in that order", async () => {
    const { deps: d, stage, rasterCalls } = deps();
    const run = await runPipeline(input(), d);
    expect(run.status).toBe("processed");
    expect([...stage.written.keys()]).toEqual(["arrow-right.svg", "arrow-right.jpg", "export.json"]);
    expect(stage.committed).toEqual(["arrow-right.svg", "arrow-right.jpg", "export.json"]);
    expect(stage.discarded).toEqual([]);
    expect(rasterCalls).toEqual([316]); // the artboard's own pixel size, not a thumbnail
    const record = parseRecord(JSON.parse(String(stage.written.get("export.json"))));
    expect(isGreen(record!)).toBe(true);
    expect(outputsOf(record!).svg?.hash).toBe(hashBytes(new TextEncoder().encode(String(stage.written.get("arrow-right.svg")))));
    expect(record!.jpeg?.megapixels).toBe(0.1);
    expect(record!.stage).toBe("commit");
    expect(stage.log.join(" ")).toContain("published");
  });

  it("writes the accepted metadata into both files, and proves it reads back", async () => {
    const { deps: d, stage } = deps();
    await runPipeline(input(), d);
    const svg = readSvgMetadata(String(stage.written.get("arrow-right.svg")));
    expect(svg.title).toBe(metadata.title);
    expect(svg.keywords).toEqual(metadata.tags);
    const jpeg = stage.written.get("arrow-right.jpg") as Uint8Array;
    expect(jpegInfo(jpeg)).toMatchObject({ width: 316, height: 316, hasXmp: true, hasIptc: true });
  });

  it("refuses to export metadata that did not validate", async () => {
    const { deps: d, stage, rasterCalls } = deps();
    const bad = { ok: false, errors: ["44 tags, expected exactly 40"], warnings: [] };
    const run = await runPipeline(input({ metadataCheck: bad }), d);
    expect(run.status).toBe("failed");
    expect(run.error).toContain("44 tags");
    expect(stage.written.size).toBe(0);
    expect(rasterCalls).toEqual([]); // not one pixel is rendered for invalid metadata
    expect(stage.discarded.length).toBeGreaterThan(0);
  });

  it("says why a document could not be prepared instead of writing half a package", async () => {
    const { deps: d, stage } = deps();
    const run = await runPipeline(input({ source: { ...input().source, code: "<svg>nonsense</svg>" } }), d);
    expect(run.status).toBe("failed");
    expect(run.error).toContain("prepare");
    expect(stage.committed).toEqual([]);
  });

  it("reports a raster that came back the wrong size as a failure, not as success", async () => {
    const { deps: d, stage } = deps({ raster: async () => ({ ok: true, bytes: minimalJpeg(10, 10), error: null, width: 10, height: 10 }) });
    const run = await runPipeline(input(), d);
    expect(run.status).toBe("failed");
    expect(run.error).toContain("10×10");
    expect(stage.committed).toEqual([]);
  });

  it("keeps the previous package when the commit itself fails", async () => {
    const { deps: d, stage } = deps({ commit: async () => { throw new Error("no space left on device"); } });
    const run = await runPipeline(input(), d);
    expect(run.status).toBe("failed");
    expect(run.error).toContain("no space left");
    expect(stage.discarded).toContain("export.json");
    expect(run.record.interrupted).toBe(true);
  });

  it("publishes nothing when the run is cancelled, and keeps what was there", async () => {
    const controller = new AbortController();
    controller.abort();
    const { deps: d, stage } = deps({ signal: controller.signal });
    const run = await runPipeline(input(), d);
    expect(run.status).toBe("cancelled");
    expect(stage.committed).toEqual([]);
    expect(run.record.error).toContain("cancelled");
  });

  it("turns a requested-EPS failure into Partial while SVG and JPEG stay available", async () => {
    const { deps: d, stage } = deps({
      eps: () => ({ ok: false, error: "gradients cannot be expressed in EPS", eps: "", box: null, width: 100, height: 100, features: ["linearGradient"], warnings: [] }),
    });
    const run = await runPipeline(input({ want: { svg: true, jpeg: true, eps: true }, settings: { ...settings, includeEps: true } }), d);
    expect(run.status).toBe("partial");
    expect(run.record.validation.ok).toBe(false);
    expect(run.record.validation.problems.join(" ")).toContain("EPS");
    expect([...stage.written.keys()]).toEqual(["arrow-right.svg", "arrow-right.jpg", "export.json"]);
    expect(stage.committed).toContain("arrow-right.jpg");
    expect(run.record.eps).toBeNull();
  });

  it("writes a genuine EPS when one is requested and verified", async () => {
    const { deps: d, stage } = deps();
    const run = await runPipeline(input({ want: { svg: true, jpeg: true, eps: true }, settings: { ...settings, includeEps: true } }), d);
    expect(run.status).toBe("processed");
    const eps = String(stage.written.get("arrow-right.eps"));
    expect(eps.startsWith("%!PS-Adobe-3.0 EPSF-3.0")).toBe(true);
    expect(eps).toContain("%%BoundingBox:");
    expect(run.record.eps?.verdict).toContain("verified");
    expect(run.record.eps?.features).toEqual([]);
  });
});

describe("selective re-export", () => {
  /** A finished package, as the second run would find it on disk. */
  async function firstRun(patch: Partial<PipelineInput> = {}) {
    const { deps: d, stage } = deps();
    const run = await runPipeline(input(patch), d);
    return { run, stage };
  }

  it("re-embeds metadata only: no raster, no new AI request", async () => {
    const first = await firstRun();
    const edited = { ...metadata, title: "Renewed Directional Symbol Conveying Momentum. Speed and motion." };
    const { deps: d, stage, rasterCalls } = deps();
    const run = await runPipeline(input({
      record: first.run.record,
      metadata: edited,
      metadataCheck: validateMetadata(edited),
      existing: {
        svg: new TextEncoder().encode(String(first.stage.written.get("arrow-right.svg"))),
        jpeg: first.stage.written.get("arrow-right.jpg") as Uint8Array,
      },
    }), d);
    expect(run.status).toBe("processed");
    expect(rasterCalls).toEqual([]);
    expect(stage.written.has("arrow-right.svg")).toBe(true);
    expect(readSvgMetadata(String(stage.written.get("arrow-right.svg"))).title).toBe(edited.title);
    expect(run.record.metadata.tags).toEqual(edited.tags);
  });

  it("rerenders only the raster when a raster setting changed, reusing the SVG", async () => {
    const first = await firstRun();
    const { deps: d, stage, rasterCalls } = deps();
    const run = await runPipeline(input({
      record: first.run.record,
      settings: { ...settings, jpegQuality: 0.6 },
      existing: {
        svg: new TextEncoder().encode(String(first.stage.written.get("arrow-right.svg"))),
        jpeg: first.stage.written.get("arrow-right.jpg") as Uint8Array,
      },
    }), d);
    expect(rasterCalls).toEqual([316]);
    expect(stage.written.has("arrow-right.jpg")).toBe(true);
    expect(stage.written.has("arrow-right.svg")).toBe(false);
    expect(run.reused.map((o) => o.format)).toEqual(["svg"]);
  });

  it("rebuilds a missing output only, and never reads a stale one", async () => {
    const first = await firstRun();
    const { deps: d, stage, rasterCalls } = deps();
    const run = await runPipeline(input({
      record: first.run.record,
      existing: { svg: new TextEncoder().encode(String(first.stage.written.get("arrow-right.svg"))) },
    }), d);
    expect(rasterCalls).toEqual([316]);
    expect([...stage.written.keys()]).toEqual(["arrow-right.jpg", "export.json"]);
    expect(outputsOf(run.record).svg).not.toBeNull(); // carried over, still listed
    expect(run.record.validation.ok).toBe(true);
  });

  it("does nothing at all when everything on disk still matches the record", async () => {
    const first = await firstRun();
    const { deps: d, stage, rasterCalls } = deps();
    const run = await runPipeline(input({
      record: first.run.record,
      existing: {
        svg: new TextEncoder().encode(String(first.stage.written.get("arrow-right.svg"))),
        jpeg: first.stage.written.get("arrow-right.jpg") as Uint8Array,
      },
    }), d);
    expect(rasterCalls).toEqual([]);
    expect(stage.written.size).toBe(0);
    expect(stage.committed).toEqual([]);
    expect(run.reused.map((o) => o.format)).toEqual(["svg", "jpeg"]);
    expect(stage.log.join(" ")).toContain("already up to date");
  });

  it("invalidates everything when the approved source version changes", async () => {
    const first = await firstRun();
    const { rasterCalls } = deps();
    const plan = planFor(input({
      record: first.run.record,
      source: { ...input().source, hash: "changed", version: "v2" },
      existing: {
        svg: new TextEncoder().encode(String(first.stage.written.get("arrow-right.svg"))),
        jpeg: first.stage.written.get("arrow-right.jpg") as Uint8Array,
      },
    }));
    expect(rasterCalls).toEqual([]);
    expect(plan.reasons.join(" ")).toContain("source");
    expect(plan.needMetadata).toBe(true); // the artwork changed, so the old metadata is not reused silently
    expect(plan.metadataReview).toBe(true);
  });

  it("ignores a file whose bytes no longer match the record", async () => {
    const first = await firstRun();
    const plan = planFor(input({
      record: first.run.record,
      existing: { svg: new TextEncoder().encode("tampered"), jpeg: first.stage.written.get("arrow-right.jpg") as Uint8Array },
    }));
    expect(plan.formats).toEqual(["svg"]);
  });
});
