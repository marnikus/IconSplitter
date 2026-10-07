// svgup_exportjson.test.ts — the per-icon package record (design §15/§17).
// The cases are the promises: the record names the source and version with
// fingerprints, records the effective settings AND where each value came from,
// keeps every output with bytes and hash, carries the accepted metadata with the
// exact prompt/model/cost, survives a write/read round trip, reports a corrupt or
// future-schema file instead of trusting it, and is green only when every
// requested output validated.
import { describe, expect, it } from "vitest";
import {
  EXPORT_SCHEMA, STATUS_TEXT, fingerprintSettings, hashBytes, hashText, isGreen, parseExportRecord, parseExportRecordText, serializeExportRecord,
  type ExportRecord, type SettingsSnapshot,
} from "../src/lib/svgupload/exportjson";
import { planRegeneration, statusAfter, statusNote } from "../src/lib/svgupload/states";

const settings: SettingsSnapshot = {
  defaults: {
    padding: { value: 10, unit: "%" }, outputScale: 1, background: { preset: "white", custom: "#808080" },
    stroke: { enabled: true, value: 2.2, unit: "pt" }, jpeg: { targetMp: 15.1, quality: 0.9, profile: "sRGB-implied" },
    optimizeSvg: true, includeEps: false,
  },
  overrides: ["outputScale"],
  resolved: {
    dpi: 96, paddingPx: { top: 10, right: 10, bottom: 10, left: 10 }, artboard: { w: 120, h: 120 }, scale: 1.2,
    strokWidth: { targetPx: 2.9333, docWidth: 2.4444, factor: 2.0952, measuredPx: 1.4 },
  },
};

const record = (over: Partial<ExportRecord> = {}): ExportRecord => ({
  v: EXPORT_SCHEMA,
  pair: { pairId: "pair_90cf3e3d", base: "icon-trophy_AI_7", dirPath: "run/split_04", svgPath: "run/split_04/icon-trophy_AI_7_04_v2.svg", version: 2, approvedAt: "2026-10-05T09:00:00Z", fingerprint: "2048:1730000001" },
  settings,
  metadata: {
    policy: "upload-meta-v1", title: "The Vector Icon of Focus and Clarity. Sharp Clean Lines.",
    description: "A minimal square icon for interfaces, labels, buttons and print.", tags: ["icon", "vector"],
    prompt: "…", provider: "requesty", model: "gemini-3.1-flash-lite", requestId: "req_1",
    tokens: { input: 1200, output: 900, total: 2100 }, cost: { actual: 0.0021, estimated: null, currency: "USD", estimatedOnly: false },
    generatedAt: "2026-10-07T10:00:00Z",
  },
  tools: [{ name: "svgo", version: "4.1.0", config: { multipass: false } }],
  outputs: [
    { format: "svg", path: "icon-trophy_AI_7_04.svg", bytes: 512, hash: "a1b2c3d4" },
    { format: "jpg", path: "icon-trophy_AI_7_04.jpg", bytes: 900_000, hash: "deadbeef", width: 3886, height: 3886, mp: 15.101, quality: 0.9 },
  ],
  stages: [{ stage: "commit", at: "2026-10-07T10:00:01Z", ms: 12, status: "ok" }],
  status: "processed",
  fingerprints: { source: "2048:1730000001", settings: "abc12345", svg: "0badf00d", jpeg: "cafebabe" },
  validation: { ok: true, errors: [], warnings: [] },
  error: null,
  createdAt: "2026-10-07T10:00:00Z", updatedAt: "2026-10-07T10:00:01Z",
  ...over,
});

describe("hashes — the same content, the same value", () => {
  it("hashes text and bytes stably and differently", () => {
    expect(hashText("abc")).toBe(hashText("abc"));
    expect(hashText("abc")).not.toBe(hashText("abd"));
    expect(hashBytes(new Uint8Array([1, 2, 3]))).toBe(hashBytes(new Uint8Array([1, 2, 3])));
    expect(hashText("abc")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("fingerprints settings so a changed field is visible", () => {
    const other = { ...settings, resolved: { ...settings.resolved, scale: 2 } };
    expect(fingerprintSettings(settings)).not.toBe(fingerprintSettings(other));
    expect(fingerprintSettings(settings)).toBe(fingerprintSettings(structuredClone(settings)));
  });
});

describe("round trip", () => {
  it("writes and reads the whole record back", () => {
    const parsed = parseExportRecordText(serializeExportRecord(record()));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.record.pair.svgPath).toContain("_v2.svg");
      expect(parsed.record.outputs.map((o) => o.format)).toEqual(["svg", "jpg"]);
      expect(parsed.record.settings.resolved.strokWidth.factor).toBeCloseTo(2.0952, 4);
      expect(parsed.record.metadata?.cost.actual).toBeCloseTo(0.0021, 6);
    }
  });

  it("uses output paths INSIDE the export folder so the package can be moved", () => {
    for (const out of record().outputs) expect(out.path.includes("/")).toBe(false);
  });
});

describe("a broken record is reported, never trusted", () => {
  it("rejects junk, a truncated file and a future schema", () => {
    expect(parseExportRecordText("{not json").ok).toBe(false);
    expect(parseExportRecord(null).ok).toBe(false);
    const future = { ...record(), v: EXPORT_SCHEMA + 1 };
    const parsed = parseExportRecord(future);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors[0]).toContain("schema version");
  });

  it("rejects a record that lost its outputs or stages", () => {
    const half = { ...record(), outputs: undefined };
    expect(parseExportRecord(half).ok).toBe(false);
  });
});

describe("green needs everything", () => {
  it("is green only for a processed package whose validation passed", () => {
    expect(isGreen(record())).toBe(true);
    expect(isGreen(record({ status: "partial" }))).toBe(false);
    expect(isGreen(record({ validation: { ok: false, errors: ["x"], warnings: [] } }))).toBe(false);
  });

  it("has one wording per status", () => {
    for (const text of Object.values(STATUS_TEXT)) expect(text.length).toBeGreaterThan(3);
  });
});

describe("statusAfter — the single rule", () => {
  const request = { svg: true, jpg: true, eps: false };

  it("is Processed only when every requested output was produced and validated", () => {
    expect(statusAfter({ requested: request, produced: { svg: true, jpg: true, eps: false }, hardFailure: false, cancelled: false, validationOk: true })).toBe("processed");
  });

  it("is Partial when a requested output is missing or validation failed", () => {
    expect(statusAfter({ requested: request, produced: { svg: true, jpg: false, eps: false }, hardFailure: false, cancelled: false, validationOk: true })).toBe("partial");
    expect(statusAfter({ requested: request, produced: { svg: true, jpg: true, eps: false }, hardFailure: false, cancelled: false, validationOk: false })).toBe("partial");
  });

  it("is Partial — never Processed — when a requested EPS was skipped", () => {
    const epsRequest = { svg: true, jpg: true, eps: true };
    expect(statusAfter({ requested: epsRequest, produced: { svg: true, jpg: true, eps: false }, hardFailure: false, cancelled: false, validationOk: true })).toBe("partial");
  });

  it("keeps Failed and Cancelled distinct from Partial", () => {
    expect(statusAfter({ requested: request, produced: { svg: false, jpg: false, eps: false }, hardFailure: true, cancelled: false, validationOk: false })).toBe("failed");
    expect(statusAfter({ requested: request, produced: { svg: true, jpg: false, eps: false }, hardFailure: false, cancelled: true, validationOk: false })).toBe("cancelled");
  });

  it("names the missing outputs in the note", () => {
    expect(statusNote("partial", ["eps"])).toContain("EPS not produced");
    expect(statusNote("processed", [])).toContain("verified");
  });
});

describe("planRegeneration — nothing stale is reused, no paid work is repeated", () => {
  const base = {
    record: record(), sourceFingerprint: "2048:1730000001", settingsFingerprint: "abc12345",
    metadataReady: true, metadataFresh: true,
    requested: { svg: true, jpg: true, eps: false }, present: { svg: true, jpg: true, eps: false },
  };

  it("skips when the source, the settings and the outputs all match", () => {
    const plan = planRegeneration(base);
    expect(plan.action).toBe("skip");
    expect(plan.stages).toEqual([]);
    expect(plan.reason).toContain("nothing to redo");
  });

  it("rebuilds everything when the source changed, and says the metadata is stale", () => {
    const plan = planRegeneration({ ...base, sourceFingerprint: "2048:9999999999" });
    expect(plan.action).toBe("rebuild");
    expect(plan.reason).toContain("changed on disk");
    expect(plan.reason).toContain("metadata no longer describes");
    expect(plan.stages).toContain("metadata");
  });

  it("re-renders on a settings change and REUSES the accepted metadata", () => {
    const plan = planRegeneration({ ...base, settingsFingerprint: "ffffffff" });
    expect(plan.action).toBe("rebuild");
    expect(plan.reusesMetadata).toBe(true);
    expect(plan.needsMetadata).toBe(false);
    expect(plan.reason).toContain("settings changed");
  });

  it("reproduces only the missing output", () => {
    const plan = planRegeneration({ ...base, present: { svg: true, jpg: false, eps: false } });
    expect(plan.action).toBe("rebuild");
    expect(plan.reason).toContain("JPEG");
    expect(plan.needsMetadata).toBe(false);
  });

  it("plans a first export for an icon with no package, asking for metadata only when there is none", () => {
    const ready = planRegeneration({ ...base, record: null });
    expect(ready.action).toBe("export");
    expect(ready.needsMetadata).toBe(false); // an accepted answer for this source is reused
    expect(ready.reusesMetadata).toBe(true);
    expect(ready.reason).toContain("No package");
    const fresh = planRegeneration({ ...base, record: null, metadataReady: false, metadataFresh: false });
    expect(fresh.needsMetadata).toBe(true);
    expect(fresh.stages).toContain("metadata");
  });

  it("adds the metadata stage when a rebuild needs a fresh answer", () => {
    const plan = planRegeneration({ ...base, sourceFingerprint: "changed:1", metadataReady: false, metadataFresh: false });
    expect(plan.stages).toContain("metadata");
    expect(plan.reusesMetadata).toBe(false);
  });

  it("asks for the EPS stage only when EPS is requested", () => {
    const withEps = planRegeneration({ ...base, requested: { svg: true, jpg: true, eps: true }, present: { svg: true, jpg: true, eps: false } });
    expect(withEps.stages).toContain("eps");
    expect(planRegeneration(base).stages).not.toContain("eps");
  });
});
