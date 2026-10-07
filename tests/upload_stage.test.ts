// upload_stage.test.ts — the preflight verdict and the recovery wording
// (RULE 8/11). The rules under test are the ones that decide whether a run may
// start and what a person is told about a package that was cut short.
import { describe, expect, it } from "vitest";
import {
  currentStage, isCommitted, preflight, reviewState, RUN_STAGES, stageIndex, stageLabel, stageTrail,
} from "../src/lib/uploadstage";
import { RECORD_VERSION, type ExportRecord } from "../src/lib/uploadrecord";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/uploadsettings";

const base = {
  folderOpen: true, approved: 3, selected: 3, needsMetadata: 0,
  wantsEps: false, epsRenderer: false, keyPresent: true,
};

describe("preflight", () => {
  it("passes a run that has everything it needs", () => {
    const result = preflight(base);
    expect(result.ok).toBe(true);
    expect(result.items).toEqual([]);
  });

  it("blocks a run with no folder or no approved SVG", () => {
    expect(preflight({ ...base, folderOpen: false }).blockers).toHaveLength(1);
    expect(preflight({ ...base, approved: 0 }).blockers[0]).toContain("No approved SVGs");
  });

  it("blocks metadata generation when no key is stored", () => {
    const result = preflight({ ...base, needsMetadata: 2, keyPresent: false });
    expect(result.ok).toBe(false);
    expect(result.blockers[0]).toContain("2 icon(s)");
  });

  it("keeps a missing EPS renderer a warning, never a blocker", () => {
    const result = preflight({ ...base, wantsEps: true, epsRenderer: false });
    expect(result.ok).toBe(true);
    expect(result.warnings[0]).toContain("cannot be confirmed");
    expect(preflight({ ...base, wantsEps: true, epsRenderer: true }).warnings).toEqual([]);
  });

  it("warns when nothing is selected", () => {
    const result = preflight({ ...base, selected: 0 });
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });
});

describe("stages", () => {
  it("lists the delivery order once, and labels every stage", () => {
    expect(RUN_STAGES[0]).toBe("discovered");
    expect(RUN_STAGES.at(-1)).toBe("processed");
    expect(stageIndex("metadata")).toBeGreaterThan(stageIndex("prepare"));
    expect(stageIndex("render")).toBeLessThan(stageIndex("embed"));
    expect(stageLabel("eps")).toBe("EPS");
    expect(stageTrail(["prepare", "render", "commit"])).toBe("Prepare → Render → Commit");
  });

  it("reports the stage a row is at", () => {
    expect(currentStage(null, null)).toBe("discovered");
    expect(currentStage(null, "rendering")).toBe("render");
    expect(currentStage(record({ status: "processed" }), null)).toBe("processed");
    expect(currentStage(record({ stage: "abandon", status: "failed", interrupted: true }), null)).toBe("validate");
  });
});

describe("recovery", () => {
  it("never presents an interrupted package as finished", () => {
    expect(reviewState(record({ interrupted: true }), null)).toContain("Interrupted");
    expect(reviewState(record({ status: "cancelled", interrupted: true }), null)).toContain("Interrupted");
    expect(isCommitted(record({ interrupted: true }))).toBe(false);
    expect(isCommitted(record({}))).toBe(true);
    expect(isCommitted(null)).toBe(false);
  });

  it("says what changed since the package was built", () => {
    const stored = record({});
    const printed = stored.fingerprints;
    expect(reviewState(stored, printed)).toBe("up to date");
    expect(reviewState(stored, { ...printed, source: "other" })).toContain("source changed");
    expect(reviewState(stored, { ...printed, metadata: "other" })).toContain("metadata changed");
    expect(reviewState(stored, null)).toBe("up to date");
    expect(reviewState(null, null)).toBe("not exported yet");
  });

  it("surfaces a package that did not validate", () => {
    const bad = { ...record({}), validation: { ok: false, problems: ["EPS: unverified"] } };
    expect(reviewState(bad, bad.fingerprints)).toContain("not valid");
  });
});

function record(over: Partial<ExportRecord>): ExportRecord {
  return {
    version: RECORD_VERSION,
    iconId: "id",
    iconName: "icon",
    sourcePath: "a/b.svg",
    sourceHash: "h",
    sourceVersion: "v1",
    settings: DEFAULT_UPLOAD_SETTINGS,
    override: {},
    effective: DEFAULT_UPLOAD_SETTINGS,
    dpi: 300,
    strokePx: 9.166,
    jpeg: null,
    svgo: null,
    eps: null,
    metadata: { title: "", description: "", tags: [] },
    metadataCheck: null,
    metadataAcceptedAt: null,
    prompt: null, provider: null, tokens: null, cost: null,
    outputs: [],
    warnings: [],
    interrupted: false,
    stage: "commit",
    status: "processed",
    validation: { ok: true, problems: [] },
    error: null,
    generatedAt: "2026-10-07T00:00:00.000Z",
    committedAt: "2026-10-07T00:00:00.000Z",
    fingerprints: { source: "s", settings: "t", metadata: "m", tools: "k" },
    ...over,
  };
}
