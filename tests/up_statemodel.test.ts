// up_statemodel.test.ts — the upload tab's model + reducer (design §5/§9),
// pure by contract: scan replaces rows but never orphans overrides or checks,
// "apply to selected" touches exactly the selected ids, editing defaults never
// erases overrides, and the filter/checked/effective helpers keep the table
// honest. Deleting statemodel fails every assertion here.
import { describe, expect, it } from "vitest";
import { DEFAULT_EXPORT_SETTINGS, type ExportOverride } from "../src/lib/upsettings";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upmeta";
import {
  INITIAL_UPLOAD_MODEL, acceptMetadata, checkedIds, effectiveFor, uploadReducer, visibleRows,
  type UploadModel,
} from "../src/upload/statemodel";
import type { UploadRowSource } from "../src/upload/sources";

function row(id: string, over: Partial<UploadRowSource> = {}): UploadRowSource {
  return {
    id, iconBase: id, name: `${id}_AI.png`, dirPath: "pairs", metaPath: `pairs/${id}_AI.svg.json`,
    version: 1, svgName: `${id}_AI_v1.svg`, svgRelPath: `pairs/${id}_AI_v1.svg`, svgFingerprint: "40:3300", contentSha: `sha-${id}`,
    warnings: [], exportState: "discovered", record: null, recovery: null, ...over,
  };
}

const META: IconMetadata = {
  title: "Forward Motion and Fast Growth. The Vector Icon of Speed",
  description: "Arrow symbolising fast upward movement and success",
  tags: [...MANDATORY_TAGS, ...Array.from({ length: 33 }, (_, i) => `c${i}`)],
};

function modelWith(rows: UploadRowSource[], over: { overrides?: Record<string, ExportOverride>; checked?: string[] } = {}): UploadModel {
  let m = uploadReducer(INITIAL_UPLOAD_MODEL, { type: "scan", rows });
  for (const [id, fields] of Object.entries(over.overrides ?? {})) m = uploadReducer(m, { type: "apply-override", ids: [id], fields });
  for (const id of over.checked ?? []) m = uploadReducer(m, { type: "toggle", id });
  return m;
}

describe("statemodel — scan", () => {
  it("replaces rows and keeps overrides/checks only for surviving ids", () => {
    const m0 = modelWith([row("a"), row("b")], { overrides: { a: { strokePt: 3 } }, checked: ["a"] });
    const m1 = uploadReducer(m0, { type: "scan", rows: [row("b"), row("c")] });
    expect(m1.rows.map((r) => r.source.id)).toEqual(["b", "c"]);
    expect(m1.overrides).toEqual({}); // a is gone; b had none
    expect(m1.checked).toEqual({});
    expect(m1.rows[0].metaState).toBe("empty");
  });

  it("keeps an override across a rescan when the icon survives", () => {
    const m0 = modelWith([row("a")], { overrides: { a: { strokePt: 3 } } });
    const m1 = uploadReducer(m0, { type: "scan", rows: [row("a")] });
    expect(m1.overrides.a).toEqual({ strokePt: 3 });
  });
});

describe("statemodel — settings (design §5)", () => {
  it("apply-override touches exactly the selected ids", () => {
    const m0 = modelWith([row("a"), row("b"), row("c")]);
    const m1 = uploadReducer(m0, { type: "apply-override", ids: ["a", "c"], fields: { jpegQuality: 0.95 } });
    expect(m1.overrides.a).toEqual({ jpegQuality: 0.95 });
    expect(m1.overrides.c).toEqual({ jpegQuality: 0.95 });
    expect(m1.overrides.b).toBeUndefined();
  });

  it("editing a global default never erases an override", () => {
    const m0 = modelWith([row("a")], { overrides: { a: { strokePt: 3 } } });
    const m1 = uploadReducer(m0, { type: "set-defaults", settings: { ...DEFAULT_EXPORT_SETTINGS, strokePt: 5 } });
    expect(m1.overrides.a).toEqual({ strokePt: 3 });
    expect(m1.defaults.strokePt).toBe(5);
  });

  it("effective = defaults overridden per field; clear-override restores inheritance", () => {
    const m0 = modelWith([row("a"), row("b")], { overrides: { a: { strokePt: 3, optimizeSvg: false } } });
    expect(effectiveFor(m0, "a")).toEqual({ ...DEFAULT_EXPORT_SETTINGS, strokePt: 3, optimizeSvg: false });
    expect(effectiveFor(m0, "b")).toEqual(DEFAULT_EXPORT_SETTINGS);
    const m1 = uploadReducer(m0, { type: "clear-override", id: "a" });
    expect(effectiveFor(m1, "a")).toEqual(DEFAULT_EXPORT_SETTINGS);
  });

  it("check-all and checkedIds stay in sync with the current scan", () => {
    const m0 = modelWith([row("a"), row("b")]);
    const m1 = uploadReducer(m0, { type: "check-all", ids: ["a", "b"], on: true });
    expect(checkedIds(m1)).toEqual(["a", "b"]);
    const m2 = uploadReducer(m1, { type: "toggle", id: "a" });
    expect(checkedIds(m2)).toEqual(["b"]);
  });
});

describe("statemodel — filters and metadata", () => {
  it("the filter shows exactly its slice", () => {
    const m = modelWith([
      row("clean", { exportState: "processed" }),
      row("todo", { exportState: "discovered" }),
      row("warned", { warnings: ["chosen-svg-missing"] }),
      row("half", { exportState: "partial" }),
    ]);
    expect(visibleRows(m).map((r) => r.source.id)).toEqual(["clean", "todo", "warned", "half"]);
    expect(visibleRows({ ...m, filter: "processed" }).map((r) => r.source.id)).toEqual(["clean"]);
    expect(visibleRows({ ...m, filter: "todo" }).map((r) => r.source.id)).toEqual(["todo", "warned", "half"]);
    expect(visibleRows({ ...m, filter: "problems" }).map((r) => r.source.id)).toEqual(["warned", "half"]);
  });

  it("accepts metadata only when it passes the ONE validation rule", () => {
    const m0 = modelWith([row("a")]);
    const m1 = acceptMetadata(m0, "a", META);
    expect(m1.rows[0].metaState).toBe("accepted");
    expect(m1.rows[0].metadata).toEqual(META);
    const bad = acceptMetadata(m0, "a", { ...META, tags: MANDATORY_TAGS.slice() });
    expect(bad.rows[0].metaState).toBe("empty");
    expect(bad.toast).toContain("validation");
  });

  it("meta-pending marks the running ids without touching the others", () => {
    const m0 = modelWith([row("a"), row("b")]);
    const m1 = uploadReducer(m0, { type: "meta-pending", ids: ["a"] });
    expect(m1.rows[0].metaState).toBe("pending");
    expect(m1.rows[1].metaState).toBe("empty");
  });

  it("export-state updates one row and can carry the record", () => {
    const m0 = modelWith([row("a"), row("b")]);
    const m1 = uploadReducer(m0, { type: "export-state", id: "b", state: "processed" });
    expect(m1.rows[1].source.exportState).toBe("processed");
    expect(m1.rows[0].source.exportState).toBe("discovered");
  });

  it("progress and toast are plain fields", () => {
    const m1 = uploadReducer(INITIAL_UPLOAD_MODEL, { type: "set-progress", progress: { done: 1, total: 3, active: ["a"] } });
    expect(m1.progress).toEqual({ done: 1, total: 3, active: ["a"] });
    const m2 = uploadReducer(m1, { type: "toast", message: "exported 3 icons" });
    expect(m2.toast).toBe("exported 3 icons");
  });
});
