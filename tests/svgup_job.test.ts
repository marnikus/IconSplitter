// svgup_job.test.ts — the export job (design §6/§16/§17). The fakes stand in for
// the three expensive seams (metadata call, canvas raster, SVGO, EPS converter),
// so every promise in the failure table is exercised here: a stage order that
// renders from the bytes actually written, one paid request and no repeat when the
// answer was never confirmed, an invalid answer that can never become a package, a
// missing converter that yields Partial with SVG+JPEG intact, a skip that writes
// nothing, and a failure that leaves the previous package exactly as it was.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportIcon, widestStroke, type ExportIo, type ExportItem } from "../src/svgupload/exporter";
import { readPackage } from "../src/svgupload/package";
import { EXPORT_SCHEMA, fingerprintSettings, type ExportRecord, type SettingsSnapshot, type SourceRef } from "../src/lib/svgupload/exportjson";
import { readMetadata } from "../src/lib/svgupload/mime";
import { FakeDir } from "./helpers/fakefs";
import type { MetaRecord } from "../src/lib/svgupload/metaprompt";
import { acceptedMeta } from "./helpers/svgupmeta";
import { insertMetadata } from "../src/lib/svgupload/jpegseg";

const SOURCE = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" stroke="#000" stroke-width="2"/></svg>';
const DIR = "run/icon-trophy_AI_7";

const pair = (over: Partial<SourceRef> = {}): SourceRef => ({
  pairId: "p1", base: "icon-trophy_AI_7", dirPath: DIR,
  svgPath: `${DIR}/icon-trophy_AI_7_03.svg`, version: 3, approvedAt: "2026-10-06T10:00:00Z", fingerprint: "100:200",
  ...over,
});

const settings = (): SettingsSnapshot => ({
  defaults: {
    padding: { value: 10, unit: "%" }, outputScale: 1, background: { preset: "white", custom: "#808080" },
    stroke: { enabled: false, value: 2.2, unit: "pt" }, jpeg: { targetMp: 15.1, quality: 0.9, profile: "sRGB-implied" },
    optimizeSvg: true, includeEps: false,
  },
  overrides: [], resolved: { dpi: 96, paddingPx: { top: 2, right: 2, bottom: 2, left: 2 }, artboard: { w: 24, h: 24 }, scale: 1, strokWidth: { targetPx: 0, docWidth: 0, factor: null, measuredPx: null } },
});

function item(over: Partial<ExportItem> = {}): ExportItem {
  return {
    pair: pair(), sourceText: SOURCE, settings: settings(),
    values: {
      padding: { value: 10, unit: "%" }, outputScale: 1, background: "#ffffff",
      stroke: { enabled: false, value: 2.2, unit: "pt" }, jpeg: { targetMp: 15.1, quality: 0.9, profile: "sRGB-implied" },
      optimizeSvg: true, includeEps: false, epsConverter: null,
    },
    requested: { svg: true, jpg: true, eps: false }, record: null, present: { svg: false, jpg: false, eps: false },
    meta: null, metaFresh: false,
    ...over,
  };
}

/** An accepted answer that PASSES the policy — the exporter re-checks it. */
function accepted(over: Partial<MetaRecord> = {}): MetaRecord {
  return acceptedMeta({ pairId: "p1", sourceFingerprint: "100:200", ...over });
}

/** A real 1×1 JPEG (SOI…EOI) so the segment writer has honest bytes to work on. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);

function root(): FakeDir {
  const dir = new FakeDir("root");
  dir.children.set("run", new FakeDir("run"));
  return dir;
}

interface Fakes {
  io: ExportIo;
  calls: { metadata: number; raster: number; optimize: number; eps: number };
}

function io(over: Partial<ExportIo> = {}, model: MetaRecord | null = accepted()): Fakes {
  const calls = { metadata: 0, raster: 0, optimize: 0, eps: 0 };
  const base: ExportIo = {
    root: root(),
    metadata: async () => { calls.metadata += 1; return model === null ? { record: accepted({ status: "rejected" }), meta: null, error: "The answer had 38 tags; 40 are required." } : { record: model, meta: { title: model.title, description: model.description, tags: model.tags }, error: null }; },
    // The seam contract: the raster returns the JPEG bytes WITH the metadata
    // injected (the real module does exactly this and verifies the read-back).
    raster: async (args) => {
      calls.raster += 1;
      expect(args.svg).toContain("<title>");
      const inserted = args.meta === null ? { ok: false as const, reason: "" } : insertMetadata(JPEG, args.meta);
      const bytes = inserted.ok ? inserted.bytes : JPEG;
      return { ok: true, blob: new Blob([bytes as unknown as BlobPart]), bytes, dims: { width: 3886, height: 3886, mp: 15.101, clamped: false }, md: args.meta, warnings: [] };
    },
    optimize: (code) => { calls.optimize += 1; return { svg: code.replace(/\n/g, ""), applied: true, version: "4.1.0", bytesBefore: code.length, bytesAfter: code.length, differences: [], warnings: [] }; },
    eps: async () => { calls.eps += 1; return { ok: true, bytes: new TextEncoder().encode("%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 24 24\nshowpage\n%%EOF\n") }; },
    publishedSvg: async () => null,
    now: () => "2026-10-07T10:00:00Z",
  };
  return { io: { ...base, ...over }, calls };
}

beforeEach(() => vi.restoreAllMocks());

describe("stage order and the rendered bytes", () => {
  it("writes the SVG, the JPEG and export.json for one icon into its own folder", async () => {
    const f = io();
    const out = await exportIcon(item(), f.io);
    expect(out.status).toBe("processed");
    expect(out.note).toBe("Exported and verified.");
    const read = await readPackage(f.io.root, DIR, "icon-trophy_AI_7");
    expect(read.exists).toBe(true);
    expect(read.present).toEqual({ svg: true, jpg: true, eps: false });
    expect(read.record?.status).toBe("processed");
    expect(read.record?.pair.version).toBe(3); // the APPROVED version, not the newest
    expect(read.record?.outputs.map((o) => o.format).sort()).toEqual(["jpg", "svg"]);
  });

  it("renders the JPEG from the SVG text that is being written, not a re-make", async () => {
    const f = io();
    let sawRasterSvg = "";
    const out = await exportIcon(item(), { ...f.io, raster: async (args) => { sawRasterSvg = args.svg; return await f.io.raster(args); } });
    expect(out.status).toBe("processed");
    const read = await readPackage(f.io.root, DIR, "icon-trophy_AI_7");
    const dir = await import("../src/lib/fs").then((fs) => fs.probePath(f.io.root, "run/icon-trophy_AI_7/export"));
    const svgText = await (await dir!.getFileHandle("icon-trophy_AI_7.svg")).getFile().then((file) => file.text());
    expect(sawRasterSvg).toBe(svgText); // preview = SVG = JPEG, literally
    expect(read.present.jpg).toBe(true);
  });

  it("embeds the accepted metadata into BOTH formats and reads it back", async () => {
    const f = io();
    await exportIcon(item(), f.io);
    const dir = await import("../src/lib/fs").then((fs) => fs.probePath(f.io.root, "run/icon-trophy_AI_7/export"));
    const svgText = await (await dir!.getFileHandle("icon-trophy_AI_7.svg")).getFile().then((file) => file.text());
    expect(readMetadata(svgText)).toEqual({ title: accepted().title, description: accepted().description, tags: accepted().tags });
    const jpg = new Uint8Array(await (await (await dir!.getFileHandle("icon-trophy_AI_7.jpg")).getFile()).arrayBuffer());
    const { readMetadata: readJpeg } = await import("../src/lib/svgupload/jpegseg");
    expect(readJpeg(jpg)?.tags).toContain("trophy");
  });

  it("leaves the approved source untouched and never writes outside the export folder", async () => {
    const f = io();
    const before = SOURCE;
    await exportIcon(item(), f.io);
    expect(SOURCE).toBe(before);
    const runDir = await import("../src/lib/fs").then((fs) => fs.probePath(f.io.root, "run/icon-trophy_AI_7"));
    const names = await import("../src/lib/fs").then((fs) => fs.listChildNames(runDir!));
    expect(names).toEqual(["export"]);
  });
});

describe("metadata is one paid request, decided by fingerprints", () => {
  it("reuses accepted metadata without asking the provider again", async () => {
    const f = io();
    await exportIcon(item({ meta: accepted(), metaFresh: true }), f.io);
    expect(f.calls.metadata).toBe(0);
  });

  it("asks exactly once when there is no answer yet", async () => {
    const f = io();
    await exportIcon(item(), f.io);
    expect(f.calls.metadata).toBe(1);
  });

  it("never publishes when the answer was refused — the previous package stays", async () => {
    const f = io();
    await exportIcon(item(), f.io);
    const before = await readPackage(f.io.root, DIR, "icon-trophy_AI_7");
    const bad = io({}, null);
    bad.io.root = f.io.root;
    const out = await exportIcon(item({ record: before.record, present: before.present }), bad.io);
    expect(out.status).toBe("failed");
    expect(out.note).toContain("previous package");
    const after = await readPackage(f.io.root, DIR, "icon-trophy_AI_7");
    expect(after.record?.updatedAt).toBe(before.record?.updatedAt);
    expect(after.record?.metadata?.title).toBe(accepted().title);
  });

  it("makes an invalid answer impossible to export, whatever the caller asked for", async () => {
    const f = io({}, null);
    const out = await exportIcon(item(), f.io);
    expect(out.status).toBe("failed");
    expect(out.record).toBeNull();
    const read = await readPackage(f.io.root, DIR, "icon-trophy_AI_7");
    expect(read.exists).toBe(false);
  });
});

describe("EPS is genuine or it is Partial", () => {
  it("skips the converter, exports SVG+JPEG and reports Partial when none is configured", async () => {
    const f = io();
    const out = await exportIcon(item({ requested: { svg: true, jpg: true, eps: true } }), f.io);
    expect(out.status).toBe("partial");
    expect(out.note).toContain("Partial");
    expect(f.calls.eps).toBe(0);
    const read = await readPackage(f.io.root, DIR, "icon-trophy_AI_7");
    expect(read.present).toEqual({ svg: true, jpg: true, eps: false });
    expect(read.record?.status).toBe("partial");
  });

  it("writes a real EPS and calls it Processed when a converter is configured", async () => {
    const f = io();
    const withConverter = item({ requested: { svg: true, jpg: true, eps: true } });
    withConverter.values.epsConverter = "http://localhost:8899/eps";
    const out = await exportIcon(withConverter, f.io);
    expect(f.calls.eps).toBe(1);
    expect(out.status).toBe("processed");
    const read = await readPackage(f.io.root, DIR, "icon-trophy_AI_7");
    expect(read.present.eps).toBe(true);
  });

  it("refuses a converter answer that is not PostScript", async () => {
    const f = io({ eps: async () => ({ ok: true, bytes: new TextEncoder().encode("%PDF-1.4 not an eps") }) });
    const withConverter = item({ requested: { svg: true, jpg: true, eps: true } });
    withConverter.values.epsConverter = "http://localhost:8899/eps";
    const out = await exportIcon(withConverter, f.io);
    expect(out.status).toBe("partial");
    expect(out.note).toContain("Partial");
    const read = await readPackage(f.io.root, DIR, "icon-trophy_AI_7");
    expect(read.present.eps).toBe(false);
  });
});

describe("selective re-export (§17)", () => {
  async function first(): Promise<{ f: Fakes; record: ExportRecord; present: { svg: boolean; jpg: boolean; eps: boolean } }> {
    const f = io();
    await exportIcon(item({ meta: accepted(), metaFresh: true }), f.io);
    const read = await readPackage(f.io.root, DIR, "icon-trophy_AI_7");
    return { f, record: read.record as ExportRecord, present: read.present };
  }

  it("skips entirely when nothing changed — no render, no request, no write", async () => {
    const { f, record, present } = await first();
    const out = await exportIcon(item({ record, present, meta: accepted(), metaFresh: true }), f.io);
    expect(out.skipped).toBe(true);
    expect(out.note).toContain("nothing to redo");
    expect(f.calls.raster).toBe(1); // only the first export rendered
    expect(f.calls.metadata).toBe(0);
  });

  it("re-renders on a settings change but still never re-asks the model", async () => {
    const { f, record, present } = await first();
    // The effective settings — and therefore the snapshot the record keeps — changed.
    const changed = item({ record, present, meta: accepted(), metaFresh: true });
    const next = settings();
    next.defaults.jpeg = { targetMp: 15.1, quality: 0.75, profile: "sRGB-implied" };
    changed.settings = next;
    changed.values.jpeg = { targetMp: 15.1, quality: 0.75, profile: "sRGB-implied" };
    const out = await exportIcon(changed, f.io);
    expect(out.status).toBe("processed");
    expect(f.calls.raster).toBe(2);
    expect(f.calls.metadata).toBe(0);
  });

  it("rebuilds everything and says the metadata is stale when the source moved on", async () => {
    const { f, record, present } = await first();
    const changed = item({ record, present, meta: accepted({ sourceFingerprint: "old" }), metaFresh: false });
    changed.pair = pair({ fingerprint: "999:111", version: 4, svgPath: `${DIR}/icon-trophy_AI_7_04.svg` });
    const out = await exportIcon(changed, f.io);
    expect(out.status).toBe("processed");
    expect(f.calls.metadata).toBe(1); // ONE new request for the new source
    expect(f.calls.raster).toBe(2);
    const read = await readPackage(f.io.root, DIR, "icon-trophy_AI_7");
    expect(read.record?.pair.version).toBe(4);
  });

  it("reproduces only the missing output by reusing the published SVG", async () => {
    const { f, record } = await first();
    const published = await import("../src/lib/fs").then((fs) => fs.probePath(f.io.root, "run/icon-trophy_AI_7/export"));
    const svgText = await (await published!.getFileHandle("icon-trophy_AI_7.svg")).getFile().then((file) => file.text());
    const out = await exportIcon(
      item({ record, present: { svg: true, jpg: false, eps: false }, meta: accepted(), metaFresh: true }),
      { ...f.io, publishedSvg: async () => svgText },
    );
    expect(out.status).toBe("processed");
    expect(f.calls.metadata).toBe(0);
    expect(f.calls.raster).toBe(2);
  });
});

describe("the record behind a green row", () => {
  it("records the schema, the tool versions, the exact prompt and the policy id", async () => {
    const f = io();
    await exportIcon(item(), f.io);
    const read = await readPackage(f.io.root, DIR, "icon-trophy_AI_7");
    const record = read.record as ExportRecord;
    expect(record.v).toBe(EXPORT_SCHEMA);
    expect(record.metadata?.model).toBe("gemini-3.1-flash-lite");
    expect(record.metadata?.prompt).toBe("the exact prompt");
    expect(record.metadata?.policy).toBe("upload-meta-v1");
    expect(record.metadata?.cost).toEqual({ actual: 0.0007, estimated: null, currency: "USD", estimatedOnly: false });
    expect(record.tools.map((t) => t.name)).toContain("svgo");
    expect(record.fingerprints.settings).toBe(fingerprintSettings(settings()));
    expect(record.validation.ok).toBe(true);
    expect(record.stages.map((s) => s.stage)).toContain("commit");
  });

  it("carries the source fingerprint and the approved version, so a later scan can tell", async () => {
    const f = io();
    await exportIcon(item(), f.io);
    const read = await readPackage(f.io.root, DIR, "icon-trophy_AI_7");
    const record = read.record as ExportRecord;
    expect(record.pair.fingerprint).toBe("100:200");
    expect(record.pair.approvedAt).toBe("2026-10-06T10:00:00Z");
    expect(record.fingerprints.source).toBe("100:200");
  });
});

describe("widestStroke", () => {
  it("reads the widest stroke from attributes and inline styles", () => {
    expect(widestStroke('<path stroke-width="2.5"/><path style="stroke-width:1"/>')).toBe(2.5);
    expect(widestStroke("<path/>")).toBeNull();
  });
});
