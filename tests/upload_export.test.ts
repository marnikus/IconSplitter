// RULE 8 — the export record runs for real: schema v1 round-trips, corrupt
// JSON is rejected (never destroys outputs), and the stage planner implements
// selective re-export exactly as design §4.4 specifies.
import { describe, expect, it } from "vitest";
import {
  exportDirOf,
  metadataBlock,
  newExportRecord,
  parseExportRecord,
  planStages,
  publishedJpegPath,
  serializeExportRecord,
  stemOf,
  type ExportRecord,
  type PlanInput,
} from "../src/lib/upload/export";
import { DEFAULT_UPLOAD_SETTINGS, settingsFingerprint, type UploadSettings } from "../src/lib/upload/settings";
import { metadataFingerprint, validateMetadata, type IconMetadata } from "../src/lib/upload/meta";
import type { OptimizeRecord } from "../src/lib/upload/optimize";

const SVGO_OFF: OptimizeRecord = {
  enabled: false, version: "4.1.0", config: "{}",
  beforeBytes: 10, afterBytes: 10, beforeHash: "a", afterHash: "a",
};

const TAGS = ["icon", "pictogram", "vector", "stroke", "line", "editable", "web",
  "speed", "growth", "chart", "arrow", "up", "business", "finance", "analytics", "data", "trend",
  "increase", "graph", "statistics", "report", "dashboard", "money", "coin", "dollar", "euro",
  "yen", "currency", "cash", "payment", "wallet", "bank", "investment", "profit", "success",
  "target", "goal", "idea", "creative", "design"];
const META: IconMetadata = {
  title: "Minimal line icon of growth. Speed and growth pictogram",
  description: "Clean line icon showing growth and rising business trends",
  tags: TAGS,
};

function record(over: Partial<ExportRecord> = {}): ExportRecord {
  return {
    ...newExportRecord({
      pair: { id: "pair_abc", base: "fog", suffix: "", dir: "cat/split_01" },
      source: { svgPath: "cat/split_01/fog_AI.svg", version: 2, approval: "approved", fingerprint: "sha256:aaa" },
      settings: {
        defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {},
        effective: DEFAULT_UPLOAD_SETTINGS, fingerprint: settingsFingerprint(DEFAULT_UPLOAD_SETTINGS),
      },
      svgo: SVGO_OFF,
      epsEnabled: false,
    }),
    ...over,
  };
}

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    sourceHash: "sha256:aaa",
    settingsFp: settingsFingerprint(DEFAULT_UPLOAD_SETTINGS),
    metadataFp: "",
    hasMetadata: false,
    optimize: false,
    includeEps: false,
    outputs: { svg: true, jpg: true, eps: true },
    ...over,
  };
}

describe("where a package lands (the Location action's pure half)", () => {
  it("names the pair's own export folder, root pairs included", () => {
    expect(exportDirOf("cat/split_01")).toBe("cat/split_01/export");
    expect(exportDirOf("")).toBe("export");
  });

  it("strips exactly the .svg extension, whatever its case", () => {
    expect(stemOf("fog_AI.svg")).toBe("fog_AI");
    expect(stemOf("fog_AI.SVG")).toBe("fog_AI");
    expect(stemOf("fog_AI.v2.svg")).toBe("fog_AI.v2");
  });

  it("points at the committed JPEG whether or not it exists yet", () => {
    expect(publishedJpegPath("cat/split_01", "fog_AI.svg")).toBe("cat/split_01/export/fog_AI.jpg");
    expect(publishedJpegPath("", "fog_AI.svg")).toBe("export/fog_AI.jpg");
  });
});

describe("the export record — schema v1 round-trip", () => {
  it("serializes and parses back to an equal record", () => {
    const r = record();
    expect(parseExportRecord(JSON.parse(serializeExportRecord(r)))).toEqual(r);
  });

  it("a fresh record is discovered with nothing rendered or committed", () => {
    const r = record();
    expect(r.v).toBe(1);
    expect(r.stage).toBe("discovered");
    expect(r.outputs).toEqual({ svg: null, jpg: null, eps: null });
    expect(r.metadata).toBeNull();
    expect(r.timestamps.committedAt).toBeNull();
  });

  it("rejects corrupt JSON and wrong versions (the pipeline rebuilds)", () => {
    expect(parseExportRecord(null)).toBeNull();
    expect(parseExportRecord("nope")).toBeNull();
    expect(parseExportRecord({ v: 2 })).toBeNull();
    expect(parseExportRecord({ v: 1, pair: {} })).toBeNull();
    const r = record();
    const corrupt = JSON.parse(serializeExportRecord(r));
    delete corrupt.source;
    expect(parseExportRecord(corrupt)).toBeNull();
  });
});

describe("metadataBlock", () => {
  it("records accepted metadata with real usage and no invented cost", () => {
    const block = metadataBlock(META, {
      prompt: "the prompt", provider: "Gemini", model: "gemini-3.1-flash-lite",
      requestId: "req-1", usage: { input: 10, output: 20, total: 30 },
      fingerprint: metadataFingerprint(META), validation: validateMetadata(META),
    });
    expect(block?.state).toBe("accepted");
    expect(block?.usage).toEqual({ input: 10, output: 20, total: 30 });
    expect(block?.cost).toBeNull();
    expect(block?.costBasis).toBe("none");
    expect(block?.tags).toHaveLength(40);
  });

  it("records invalid metadata as invalid (never accepted silently)", () => {
    const bad = { ...META, tags: META.tags.slice(0, 9) };
    const block = metadataBlock(bad, {
      prompt: "p", provider: "Gemini", model: "m", requestId: null,
      usage: { input: null, output: null, total: null },
      fingerprint: metadataFingerprint(bad), validation: validateMetadata(bad),
    });
    expect(block?.state).toBe("invalid");
    expect(block?.validation.ok).toBe(false);
  });
});

describe("planStages — selective re-export (design §4.4)", () => {
  it("no record → the full pipeline, every output rebuilds", () => {
    expect(planStages(null, input()).stages).toEqual(["prepare", "render", "validate", "commit"]);
    expect(planStages(null, input()).rebuild).toEqual({ svg: true, jpg: true, eps: false });
    const full = planStages(null, input({ optimize: true, includeEps: true, hasMetadata: true, metadataFp: "m1" }));
    expect(full.stages).toEqual(["prepare", "render", "optimize", "embed", "eps", "validate", "commit"]);
    expect(full.rebuild).toEqual({ svg: true, jpg: true, eps: true });
  });

  it("a source change rebuilds everything", () => {
    const plan = planStages(record(), input({ sourceHash: "sha256:changed" }));
    expect(plan.stages).toEqual(["prepare", "render", "validate", "commit"]);
    expect(plan.rebuild).toEqual({ svg: true, jpg: true, eps: false });
  });

  it("a settings change rebuilds the geometry chain but keeps metadata (no AI)", () => {
    const changed: UploadSettings = { ...DEFAULT_UPLOAD_SETTINGS, paddingPct: 20 };
    const plan = planStages(record(), input({
      settingsFp: settingsFingerprint(changed), hasMetadata: true, metadataFp: "m1",
    }));
    expect(plan.stages).toEqual(["prepare", "render", "embed", "validate", "commit"]);
    expect(plan.rebuild).toEqual({ svg: true, jpg: true, eps: false });
  });

  it("a metadata edit re-embeds only — no render, no AI", () => {
    const withMeta = withMetadata("m-old");
    const plan = planStages(withMeta, input({ hasMetadata: true, metadataFp: "m-new" }));
    expect(plan.stages).toEqual(["embed", "validate", "commit"]);
    expect(plan.rebuild).toEqual({ svg: true, jpg: true, eps: false });
  });

  it("an optimize toggle re-optimizes and re-embeds, keeping the JPEG", () => {
    // the record already carries m1 — only the optimize toggle is new
    const plan = planStages(withMetadata("m1"), input({ optimize: true, hasMetadata: true, metadataFp: "m1" }));
    expect(plan.stages).toEqual(["optimize", "embed", "validate", "commit"]);
    expect(plan.rebuild).toEqual({ svg: true, jpg: false, eps: false });
  });

  it("an EPS toggle is EPS-only", () => {
    const plan = planStages(record(), input({ includeEps: true }));
    expect(plan.stages).toEqual(["eps", "validate", "commit"]);
    expect(plan.rebuild).toEqual({ svg: false, jpg: false, eps: true });
  });

  it("a missing output rebuilds only that output", () => {
    expect(planStages(record(), input({ outputs: { svg: false, jpg: true, eps: true } })).stages)
      .toEqual(["prepare", "validate", "commit"]);
    expect(planStages(record(), input({ outputs: { svg: false, jpg: true, eps: true } })).rebuild)
      .toEqual({ svg: true, jpg: false, eps: false });
    expect(planStages(record(), input({ outputs: { svg: true, jpg: false, eps: true } })).stages)
      .toEqual(["render", "validate", "commit"]);
    expect(planStages(record(), input({ outputs: { svg: true, jpg: false, eps: true } })).rebuild)
      .toEqual({ svg: false, jpg: true, eps: false });
    expect(planStages(record(), input({ outputs: { svg: true, jpg: true, eps: false }, includeEps: true })).stages)
      .toEqual(["eps", "validate", "commit"]);
  });

  it("nothing changed → no work at all", () => {
    expect(planStages(record(), input())).toEqual({ stages: [], rebuild: { svg: false, jpg: false, eps: false } });
    const withMeta = withMetadata("m1");
    expect(planStages(withMeta, input({ hasMetadata: true, metadataFp: "m1" }))).toEqual({
      stages: [], rebuild: { svg: false, jpg: false, eps: false },
    });
  });
});

/** A record carrying accepted metadata with the given fingerprint. */
function withMetadata(fingerprint: string): ExportRecord {
  return {
    ...record(),
    metadata: metadataBlock(META, {
      prompt: "p", provider: "Gemini", model: "m", requestId: null,
      usage: { input: 1, output: 2, total: 3 }, fingerprint, validation: validateMetadata(META),
    }),
  };
}
