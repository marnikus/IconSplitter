// up_export.test.ts — the export record, schema v2 (report §7 phase 2): the
// record IS the commit, so its build/validate/read trio is tested against real
// serialized payloads. Identity is root + pair + source CONTENT hash + policy;
// a record from an earlier schema is reported as such — never silently treated
// as "no export", never half-read — and a processed record never carries a
// failure. Deleting lib/upexport* fails every assertion here.
import { describe, expect, it } from "vitest";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upmeta";
import { DEFAULT_EXPORT_SETTINGS, type ExportSettings } from "../src/lib/upsettings";
import {
  buildExportRecord, generationId, serializeExportRecord, serializePointer, type ExportRecord,
} from "../src/lib/upexport";
import { classifyForeign, readExportRecord, validateExportRecord } from "../src/lib/upexportread";
import { readPointer } from "../src/lib/upexportread";

const META: IconMetadata = {
  title: "Forward Motion and Growth. The Vector Icon of Speed",
  description: "Arrow symbolising fast upward movement and success",
  tags: [...MANDATORY_TAGS, ...Array.from({ length: 33 }, (_, i) => `concept-${i}`)],
};

const SETTINGS: ExportSettings = { ...DEFAULT_EXPORT_SETTINGS };

const PROVENANCE = {
  origin: "ai" as const, prompt: "name the icon", model: "gemini-3.1-flash-lite", endpointHost: "generativelanguage.googleapis.com",
  requestId: "req-1", inputTokens: 120, outputTokens: 260, estimatedCostUsd: 0.00042,
  generatedAt: "2026-10-07T09:59:00.000Z", policy: "upload-meta-v2",
};

function record(over: Partial<Parameters<typeof buildExportRecord>[0]> = {}): ExportRecord {
  return buildExportRecord({
    pairId: "pairs/icon-a|_AI",
    iconBase: "icon-a",
    rootName: "/Users/m/split_output",
    dirPath: "pairs",
    source: { relPath: "pairs/icon-a_AI_v3.svg", version: 3, sha256: "abc", bytes: 1200 },
    settings: SETTINGS,
    metadata: META,
    provenance: PROVENANCE,
    requested: { svg: true, jpeg: true, eps: false },
    outputs: {
      svg: { relPath: "pairs/export/generations/gen-1/icon-a.svg", bytes: 900, sha256: "d1", optimizer: { version: "4.1.0", config: "preset-default", beforeBytes: 1000, afterBytes: 900 } },
      jpeg: { relPath: "pairs/export/generations/gen-1/icon-a.jpg", bytes: 500_000, sha256: "d2", width: 3886, height: 3886, mpx: 15.1, quality: 0.92 },
      eps: null,
    },
    generation: "gen-1",
    state: "processed",
    failure: null,
    committedAt: "2026-10-07T10:00:00.000Z",
    ...over,
  });
}

describe("upexport — build and round-trip", () => {
  it("builds the v1 record and round-trips it through serialize/read", () => {
    const r = record();
    expect(r.v).toBe(2);
    expect(r.schema).toBe("iconsplitter.upload.package");
    const read = readExportRecord(serializeExportRecord(r));
    expect(read).toMatchObject({ ok: true });
    if (read.ok) expect(read.record).toEqual(r);
  });

  it("a processed record never carries a failure; a partial one must", () => {
    expect(record({ state: "processed", failure: "ignored" }).failure).toBeNull();
    const partial = record({ state: "partial", failure: "eps preflight: text" });
    expect(partial.state).toBe("partial");
    expect(partial.failure).toBe("eps preflight: text");
    expect(readExportRecord(serializeExportRecord(partial))).toMatchObject({ ok: true });
  });

  it("keeps the effective settings and accepted metadata in the record", () => {
    const r = record();
    expect(r.settings).toEqual(SETTINGS);
    expect(r.metadata).toEqual(META);
  });
});

describe("upexport — tolerant read (RULE 4/13)", () => {
  it("reports unparseable JSON honestly", () => {
    const read = readExportRecord("{oops");
    expect(read).toMatchObject({ ok: false });
    if (!read.ok) expect(read.reason).toContain("not parseable");
  });

  it("rejects the wrong version, missing identity and mangled fields", () => {
    expect(readExportRecord('{"v":2}').ok).toBe(false);
    expect(readExportRecord(JSON.stringify({ ...record(), v: 1 })).ok).toBe(false);
    expect(readExportRecord(JSON.stringify({ ...record(), schema: "other.package" })).ok).toBe(false);
    expect(readExportRecord(JSON.stringify({ ...record(), pairId: "" })).ok).toBe(false);
    expect(readExportRecord(JSON.stringify({ ...record(), source: { relPath: "x" } })).ok).toBe(false);
    expect(validateExportRecord(null)).toBeNull();
    expect(validateExportRecord("junk")).toBeNull();
  });

  it("rejects metadata that lost its shape", () => {
    expect(readExportRecord(JSON.stringify({ ...record(), metadata: { title: "x" } })).ok).toBe(false);
    expect(readExportRecord(JSON.stringify({ ...record(), metadata: { ...META, tags: "icon,pictogram" } })).ok).toBe(false);
    expect(readExportRecord(JSON.stringify({ ...record(), metadata: { ...META, tags: [] } })).ok).toBe(false);
  });

  it("requires output shapes — a broken optimizer record is not a valid commit", () => {
    const broken = record();
    broken.outputs.svg.optimizer = { version: 1, config: "", beforeBytes: "x", afterBytes: 0 } as unknown as ExportRecord["outputs"]["svg"]["optimizer"];
    expect(readExportRecord(JSON.stringify(broken)).ok).toBe(false);
    const noJpeg = JSON.parse(JSON.stringify(record())) as ExportRecord;
    delete (noJpeg.outputs as Record<string, unknown>).jpeg;
    expect(readExportRecord(JSON.stringify(noJpeg)).ok).toBe(false);
  });

  it("accepts a null optimizer and a missing eps as the honest no-op states", () => {
    const honest = JSON.parse(JSON.stringify(record())) as ExportRecord;
    honest.outputs.svg.optimizer = null;
    const read = readExportRecord(JSON.stringify(honest));
    expect(read).toMatchObject({ ok: true });
  });
});

describe("reading a package written by another schema (R24)", () => {
  it("names the base's v1 payload and refuses it with a visible reason", () => {
    const foreign = { v: 1, pairId: "p", iconBase: "icon-a", source: { relPath: "x.svg", version: 1, sha256: "sha:9" } };
    expect(classifyForeign(foreign)).toMatchObject({ donor: "v1", version: 1 });
    const read = readExportRecord(JSON.stringify(foreign));
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.reason).toContain("earlier schema");
      expect(read.reason).toContain("re-export");
    }
  });

  it("names the svgupload v1 payload (pair, no iconBase) too", () => {
    expect(classifyForeign({ v: 1, pair: "p", outputs: [] })).toMatchObject({ donor: "svgupload-v1" });
  });

  it("does not pretend a foreign payload with no identity is a record", () => {
    expect(classifyForeign({ hello: "world" })).toBeNull();
    expect(readExportRecord('{"hello":"world"}')).toMatchObject({ ok: false });
  });

  it("accepts only a pointer whose record names the same generation", () => {
    const good = serializePointer(record());
    expect(readPointer(good)?.generation).toBe("gen-1");
    // The pointer is not itself a record — the record inside it is.
    expect(readExportRecord(good).ok).toBe(false);
    const mismatched = JSON.stringify({ ...JSON.parse(good) as object, generation: "gen-2" });
    expect(readPointer(mismatched)).toBeNull();
  });
});

describe("generation ids", () => {
  it("is a directory-safe name derived from the commit time", () => {
    expect(generationId("2026-10-07T10:00:00.000Z", [])).toBe("gen-2026-10-07T10-00-00-000Z");
  });

  it("disambiguates a commit that lands in the same millisecond", () => {
    const taken = ["gen-2026-10-07T10-00-00-000Z", "gen-2026-10-07T10-00-00-000Z-2"];
    expect(generationId("2026-10-07T10:00:00.000Z", taken)).toBe("gen-2026-10-07T10-00-00-000Z-3");
  });
});
