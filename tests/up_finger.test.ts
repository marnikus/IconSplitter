// up_finger.test.ts — the selective re-export plan (design §9), pure: every
// difference class maps to exactly the minimal stage set, nothing stale is
// silently reused, and every reuse decision names its reason.
import { describe, expect, it } from "vitest";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upmeta";
import { DEFAULT_EXPORT_SETTINGS, type ExportSettings } from "../src/lib/upsettings";
import { buildExportRecord, type ExportRecord } from "../src/lib/upexport";
import { fingerprintsOf, planReexport, type Fingerprints } from "../src/lib/upfinger";

const META: IconMetadata = {
  title: "Forward Motion and Fast Growth. The Vector Icon of Speed",
  description: "Arrow symbolising fast upward movement and success",
  tags: [...MANDATORY_TAGS, ...Array.from({ length: 33 }, (_, i) => `concept-${i}`)],
};

const SETTINGS: ExportSettings = { ...DEFAULT_EXPORT_SETTINGS };
const ALL = { svg: true, jpeg: true, eps: true };

function recordWith(settings: ExportSettings, meta: IconMetadata = META): ExportRecord {
  return buildExportRecord({
    pairId: "p", iconBase: "icon-a",
    source: { relPath: "pairs/icon-a_AI_v1.svg", version: 1, sha256: "sha-1" },
    settings, metadata: meta,
    outputs: {
      svg: { relPath: "e/a.svg", bytes: 1, sha256: "s", optimizer: null },
      jpeg: { relPath: "e/a.jpg", bytes: 1, sha256: "j", width: 3886, height: 3886, mpx: 15.1, quality: settings.jpegQuality },
      eps: null,
    },
    state: "processed", failure: null, committedAt: "2026-10-07T10:00:00.000Z",
  });
}

function prints(settings: ExportSettings, meta: IconMetadata = META, sha = "sha-1"): Fingerprints {
  return fingerprintsOf({ sourceSha: sha, settings, metadata: meta });
}

describe("upfinger — fingerprints", () => {
  it("are deterministic and separated per concern", () => {
    const f = prints(SETTINGS);
    expect(f.source).toBe("v1:sha-1");
    expect(f.visual).toContain("2.2");        // strokePt
    expect(f.visual).toContain("square");     // artboard
    expect(f.raster).toContain("15.1");       // mpx
    expect(f.raster).toContain("0.92");       // quality
    expect(f.flags).toContain("true|false");  // optimizeSvg|includeEps
    expect(f.metadata).toContain(META.tags[9]);
    expect(prints(SETTINGS)).toEqual(prints(SETTINGS));
  });
});

describe("upfinger — the minimal honest plan", () => {
  it("no record → full export", () => {
    const plan = planReexport({ record: null, current: prints(SETTINGS), outputs: { svg: false, jpeg: false, eps: false }, includeEps: true });
    expect(plan).toMatchObject({ prepare: true, metadata: "generate", svg: "rebuild", jpeg: "rebuild", eps: "build" });
    expect(plan.reasons).toHaveLength(1);
  });

  it("nothing changed and all outputs present → everything keeps", () => {
    const plan = planReexport({ record: recordWith(SETTINGS), current: prints(SETTINGS), outputs: ALL, includeEps: false });
    expect(plan).toMatchObject({ prepare: false, metadata: "reuse", svg: "keep", jpeg: "keep", eps: "skip" });
    expect(plan.reasons).toEqual([]);
  });

  it("source change → everything rebuilds and metadata is reconfirmed", () => {
    const plan = planReexport({ record: recordWith(SETTINGS), current: prints(SETTINGS, META, "sha-2"), outputs: ALL, includeEps: true });
    expect(plan).toMatchObject({ prepare: true, metadata: "reconfirm", svg: "rebuild", jpeg: "rebuild", eps: "build" });
    expect(plan.reasons[0]).toContain("source");
  });

  it("visual change → outputs rebuild, metadata kept (reuse)", () => {
    const plan = planReexport({
      record: recordWith(SETTINGS),
      current: prints({ ...SETTINGS, strokePt: 4 }),
      outputs: ALL, includeEps: true,
    });
    expect(plan).toMatchObject({ prepare: true, metadata: "reuse", svg: "rebuild", jpeg: "rebuild", eps: "build" });
  });

  it("metadata-only change → re-embed into the existing JPEG, no raster", () => {
    const edited: IconMetadata = { ...META, description: "A rising arrow showing quick progress forward" };
    const withEps: ExportSettings = { ...SETTINGS, includeEps: true };
    const plan = planReexport({ record: recordWith(withEps), current: prints(withEps, edited), outputs: ALL, includeEps: true });
    expect(plan).toMatchObject({ prepare: true, metadata: "reuse", svg: "rebuild", jpeg: "reembed", eps: "keep" });
  });

  it("quality-only change → JPEG re-encode only", () => {
    const plan = planReexport({
      record: recordWith(SETTINGS),
      current: prints({ ...SETTINGS, jpegQuality: 0.95 }),
      outputs: ALL, includeEps: false,
    });
    expect(plan).toMatchObject({ prepare: false, svg: "keep", jpeg: "rebuild" });
  });

  it("R07: a target-MP change invalidates the SVG and EPS geometry, not just the JPEG", () => {
    const plan = planReexport({
      record: recordWith({ ...SETTINGS, includeEps: true }),
      current: prints({ ...SETTINGS, includeEps: true, jpegMpx: 10 }),
      outputs: ALL, includeEps: true,
    });
    expect(plan).toMatchObject({ prepare: true, svg: "rebuild", jpeg: "rebuild", eps: "build" });
    expect(plan.reasons).toContain("the target raster size changed (physical stroke)");
  });

  it("R07: a quality-only change leaves the SVG and EPS untouched", () => {
    const plan = planReexport({
      record: recordWith({ ...SETTINGS, includeEps: true }),
      current: prints({ ...SETTINGS, includeEps: true, jpegQuality: 0.95 }),
      outputs: ALL, includeEps: true,
    });
    expect(plan).toMatchObject({ prepare: false, svg: "keep", eps: "keep" });
  });

  it("flag changes touch only the affected output", () => {
    const optimizePlan = planReexport({
      record: recordWith(SETTINGS),
      current: prints({ ...SETTINGS, optimizeSvg: false }),
      outputs: ALL, includeEps: false,
    });
    expect(optimizePlan).toMatchObject({ svg: "rebuild", jpeg: "keep", eps: "skip" });
    const epsPlan = planReexport({
      record: recordWith(SETTINGS),
      current: prints(SETTINGS),
      outputs: ALL, includeEps: true, // record has includeEps false
    });
    expect(epsPlan).toMatchObject({ svg: "keep", jpeg: "keep", eps: "build" });
  });

  it("missing outputs rebuild only what is missing", () => {
    const plan = planReexport({ record: recordWith(SETTINGS), current: prints(SETTINGS), outputs: { svg: true, jpeg: false, eps: false }, includeEps: false });
    expect(plan).toMatchObject({ svg: "keep", jpeg: "rebuild", eps: "skip" });
  });

  it("names every reason that drove the plan", () => {
    const edited: IconMetadata = { ...META, description: "A rising arrow showing quick progress forward" };
    const withEps: ExportSettings = { ...SETTINGS, includeEps: true };
    const plan = planReexport({
      record: recordWith(withEps),
      current: prints({ ...withEps, strokePt: 4, jpegQuality: 0.95 }, edited, "sha-9"),
      outputs: ALL, includeEps: true,
    });
    expect(plan.reasons).toHaveLength(4); // source + visual + metadata + raster
    expect(plan.svg).toBe("rebuild");
    expect(plan.jpeg).toBe("rebuild"); // source+visual+raster override the re-embed shortcut
  });
});
