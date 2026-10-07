// up_export.test.ts — export.json schema v1 (design §9): the record IS the
// commit marker, so its build/validate/read trio is tested against real
// serialized payloads. A corrupt record must be reported as such — never
// silently treated as "no export" — and a processed record never carries a
// failure. Deleting lib/upexport fails every assertion here.
import { describe, expect, it } from "vitest";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upmeta";
import { DEFAULT_EXPORT_SETTINGS, type ExportSettings } from "../src/lib/upsettings";
import {
  buildExportRecord, readExportRecord, serializeExportRecord, validateExportRecord, type ExportRecord,
} from "../src/lib/upexport";

const META: IconMetadata = {
  title: "Forward Motion and Growth. The Vector Icon of Speed",
  description: "Arrow symbolising fast upward movement and success",
  tags: [...MANDATORY_TAGS, ...Array.from({ length: 33 }, (_, i) => `concept-${i}`)],
};

const SETTINGS: ExportSettings = { ...DEFAULT_EXPORT_SETTINGS };

function record(over: Partial<Parameters<typeof buildExportRecord>[0]> = {}): ExportRecord {
  return buildExportRecord({
    pairId: "pairs/icon-a|_AI",
    iconBase: "icon-a",
    source: { relPath: "pairs/icon-a_AI_v3.svg", version: 3, sha256: "abc" },
    settings: SETTINGS,
    metadata: META,
    outputs: {
      svg: { relPath: "pairs/export/icon-a.svg", bytes: 900, sha256: "d1", optimizer: { version: "4.1.0", config: "preset-default", beforeBytes: 1000, afterBytes: 900 } },
      jpeg: { relPath: "pairs/export/icon-a.jpg", bytes: 500_000, sha256: "d2", width: 3886, height: 3886, mpx: 15.1, quality: 0.92 },
      eps: null,
    },
    state: "processed",
    failure: null,
    committedAt: "2026-10-07T10:00:00.000Z",
    ...over,
  });
}

describe("upexport — build and round-trip", () => {
  it("builds the v1 record and round-trips it through serialize/read", () => {
    const r = record();
    expect(r.v).toBe(1);
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
    expect(readExportRecord(JSON.stringify({ ...record(), v: 2 })).ok).toBe(false);
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
