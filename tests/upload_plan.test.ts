// upload_plan.test.ts — selective re-export decisions (RULE 9/17) and the job
// pool's isolation and cancellation (RULE 10/14).
import { describe, expect, it, vi } from "vitest";
import { planExport, planSummary, settingsDiff, type PlanInput } from "../src/lib/uploadplan";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/uploadsettings";
import { hashText, outputsOf, parseRecord, recordSummary, sourceFingerprint, isGreen, type ExportRecord } from "../src/lib/uploadrecord";
import { Cancelled, delay, isCancelled, runPool, throwIfAborted } from "../src/lib/uploadjobs";

const settings = { ...DEFAULT_UPLOAD_SETTINGS };
const all = { svg: true, jpeg: true, eps: false };
const present = { svg: true, jpeg: true, eps: true };

function record(patch: Partial<ExportRecord> = {}): ExportRecord {
  const effective = patch.effective ?? settings;
  return {
    version: 1, iconId: "i1", iconName: "arrow-right", sourcePath: "pairs/a/source.png",
    sourceHash: "abc", sourceVersion: "v1",
    settings, override: {}, effective, dpi: 300, strokePx: 9.166,
    jpeg: { width: 3886, height: 3886, megapixels: 15.101, quality: 0.92, profile: "srgb" },
    svgo: { enabled: true, version: "svgo@4.1.0", beforeBytes: 900, afterBytes: 700, differences: [] },
    eps: { enabled: false, widthPt: 932.64, heightPt: 932.64, features: [], verdict: "ok" },
    metadata: { title: "T", description: "d", tags: ["icon"] }, metadataCheck: null, metadataAcceptedAt: "2026-01-01T00:00:00.000Z",
    prompt: null, provider: null, tokens: null, cost: null,
    outputs: [{ format: "svg", name: "arrow-right.svg", bytes: 700, hash: "h1", width: null, height: null }],
    warnings: [], interrupted: false, stage: "commit", status: "processed",
    validation: { ok: true, problems: [] }, error: null,
    generatedAt: "2026-01-01T00:00:00.000Z", committedAt: "2026-01-01T00:00:05.000Z",
    fingerprints: { source: "abc:v1", settings: hashText(JSON.stringify(settings)), metadata: "m1", tools: "t1" },
    ...patch,
  };
}

function plan(patch: Partial<PlanInput> = {}): ReturnType<typeof planExport> {
  const base: PlanInput = {
    record: record(),
    effective: settings,
    want: all,
    present,
    hasMetadata: true,
    fingerprints: { source: "abc:v1", settings: hashText(JSON.stringify(settings)), metadata: "m1", tools: "t1" },
    ...patch,
  };
  return planExport(base);
}

describe("settingsDiff", () => {
  it("reports nothing when the settings are identical and everything when they are unknown", () => {
    expect(settingsDiff(settings, { ...settings })).toEqual([]);
    expect(settingsDiff(null, settings).length).toBeGreaterThan(5);
  });

  it("reports exactly the fields that differ", () => {
    expect(settingsDiff(settings, { ...settings, paddingPct: 20 })).toEqual(["paddingPct"]);
    expect(settingsDiff(settings, { ...settings, jpegQuality: 0.8, includeEps: true })).toEqual(["jpegQuality", "includeEps"]);
  });
});

describe("planExport", () => {
  it("does nothing when everything is valid, and says so", () => {
    const result = plan();
    expect(result.formats).toEqual([]);
    expect(result.stages).toEqual([]);
    expect(result.reasons).toEqual(["everything requested is already valid"]);
    expect(planSummary(result)).toBe("up to date");
  });

  it("rebuilds everything when there is no usable record", () => {
    const result = plan({ record: null, hasMetadata: false });
    expect(result.full).toBe(true);
    expect(result.formats).toEqual(["svg", "jpeg"]);
    expect(result.needMetadata).toBe(true);
    expect(result.stages).toContain("prepare");
  });

  it("re-embeds only, without any AI request, for a metadata-only edit", () => {
    const result = plan({ fingerprints: { source: "abc:v1", settings: hashText(JSON.stringify(settings)), metadata: "m2", tools: "t1" } });
    expect(result.formats).toEqual(["svg", "jpeg"]);
    expect(result.needMetadata).toBe(false);
    expect(result.metadataReview).toBe(false);
    expect(result.stages).toEqual(["embed", "commit"]);
    expect(result.reasons).toContain("only the metadata changed");
  });

  it("rebuilds visuals and asks for a metadata review when geometry settings change", () => {
    const result = plan({ effective: { ...settings, paddingPct: 24 } });
    expect(result.formats).toEqual(["svg", "jpeg"]);
    expect(result.metadataReview).toBe(true);
    expect(result.stages).toContain("render");
    expect(result.stages).not.toContain("eps");
  });

  it("re-renders the raster only when quality or size changes, and reuses the SVG", () => {
    const result = plan({ effective: { ...settings, jpegQuality: 0.7 } });
    expect(result.formats).toEqual(["jpeg"]);
    expect(result.reuse).toEqual(["svg"]);
    expect(result.stages).toEqual(["prepare", "render", "optimize", "embed", "commit"]);
  });

  it("invalidates dependents when the source version changes", () => {
    const result = plan({ fingerprints: { source: "abc:v2", settings: hashText(JSON.stringify(settings)), metadata: "m1", tools: "t1" } });
    expect(result.formats).toEqual(["svg", "jpeg"]);
    expect(result.needMetadata).toBe(true); // the artwork changed, so the accepted metadata is no longer trustworthy
    expect(result.reasons.join(" ")).toContain("source");
  });

  it("rebuilds only the missing output, not its healthy siblings", () => {
    const result = plan({ present: { ...present, jpeg: false } });
    expect(result.formats).toEqual(["jpeg"]);
    expect(result.reuse).toEqual(["svg"]);
    expect(result.stages).toEqual(["prepare", "render", "optimize", "embed", "commit"]);
  });

  it("adds the EPS stage only when EPS is requested", () => {
    const withEps = plan({ want: { svg: true, jpeg: true, eps: true }, present: { ...present, eps: false } });
    expect(withEps.formats).toEqual(["eps"]);
    expect(withEps.stages).toEqual(["prepare", "render", "optimize", "eps", "commit"]);
  });

  it("rebuilds the outputs when the optimiser configuration changes", () => {
    const result = plan({ effective: { ...settings, optimizeSvg: false } });
    expect(result.formats).toEqual(["svg", "jpeg"]);
    expect(result.reasons.join(" ")).toContain("optimizer");
  });

  it("does not touch an EPS for a metadata-only edit", () => {
    const result = plan({
      want: { svg: true, jpeg: true, eps: true },
      fingerprints: { source: "abc:v1", settings: hashText(JSON.stringify(settings)), metadata: "m2", tools: "t1" },
    });
    expect(result.formats).toEqual(["svg", "jpeg"]);
    expect(result.reuse).toEqual(["eps"]);
  });
});

describe("records", () => {
  it("reads its own record back and keeps usable outputs", () => {
    const parsed = parseRecord(JSON.parse(JSON.stringify(record())));
    expect(parsed?.iconId).toBe("i1");
    expect(outputsOf(parsed!).svg?.name).toBe("arrow-right.svg");
    expect(isGreen(parsed!)).toBe(true);
    expect(recordSummary(parsed!)).toContain("processed");
  });

  it("refuses a payload it cannot trust instead of throwing", () => {
    expect(parseRecord(null)).toBeNull();
    expect(parseRecord("nonsense")).toBeNull();
    expect(parseRecord({ outputs: [] })).toBeNull();
    expect(parseRecord({ version: 1, iconId: "i1", outputs: [{ format: "svg" }] })?.outputs).toEqual([]);
  });

  it("is not green when the package is partial, interrupted or invalid", () => {
    expect(isGreen(record({ status: "partial" }))).toBe(false);
    expect(isGreen(record({ interrupted: true }))).toBe(false);
    expect(isGreen(record({ validation: { ok: false, problems: ["eps missing"] } }))).toBe(false);
  });

  it("fingerprints the source by bytes and version together", () => {
    expect(sourceFingerprint({ hash: "a", version: "v1" })).not.toBe(sourceFingerprint({ hash: "a", version: "v2" }));
  });
});

describe("runPool", () => {
  const items = ["a", "b", "c", "d", "e"];
  const controller = () => new AbortController();

  it("never runs more workers at once than the limit", async () => {
    let live = 0;
    let peak = 0;
    const result = await runPool(items, {
      limit: 2, signal: controller().signal,
      worker: async () => { live += 1; peak = Math.max(peak, live); await delay(5); live -= 1; },
    });
    expect(result.done).toHaveLength(5);
    expect(peak).toBe(2);
  });

  it("keeps going when one item fails, and reports only that one", async () => {
    const result = await runPool(items, {
      limit: 2, signal: controller().signal,
      worker: async (item) => { if (item === "c") throw new Error("render failed"); },
    });
    expect(result.failed.map((f) => f.item)).toEqual(["c"]);
    expect(result.failed[0].error).toBe("render failed");
    expect(result.done.sort()).toEqual(["a", "b", "d", "e"]);
  });

  it("stops handing out work when the user cancels, without failing what never ran", async () => {
    const ctrl = controller();
    const started: string[] = [];
    const result = await runPool(items, {
      limit: 1, signal: ctrl.signal,
      worker: async (item) => { started.push(item); if (item === "b") ctrl.abort(); },
    });
    expect(started).toEqual(["a", "b"]);
    expect(result.aborted).toBe(true);
    expect(result.failed).toEqual([]);
    expect(result.cancelled).toEqual(["c", "d", "e"]);
  });

  it("treats a Cancelled thrown by a worker as cancelled, not as a failure", async () => {
    const result = await runPool(["a"], {
      limit: 1, signal: controller().signal,
      worker: async () => { throw new Cancelled(); },
    });
    expect(result.failed).toEqual([]);
    expect(result.cancelled).toEqual(["a"]);
    expect(isCancelled(new Cancelled())).toBe(true);
    expect(isCancelled(new Error("nope"))).toBe(false);
  });

  it("throws Cancelled when a stage notices the abort, and delay resolves on abort", async () => {
    const ctrl = controller();
    const pending = delay(5_000, ctrl.signal);
    ctrl.abort();
    await pending; // resolves early instead of leaking a 5 s timer
    expect(() => throwIfAborted(ctrl.signal)).toThrow(Cancelled);
    expect(vi.fn()).toBeDefined();
  });
});
