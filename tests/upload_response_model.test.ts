// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialModel, reduceState, type UploadAction, type UploadModel } from "../src/upload/statemodel";
import { DEFAULT_UPLOAD_SETTINGS, settingsFingerprint, type UploadSettings } from "../src/lib/upload/settings";
import { newExportRecord } from "../src/lib/upload/export";
import { parseGeminiConfig } from "../src/lib/upload/gemini";
import { DEFAULT_UPLOAD_PREFS } from "../src/upload/prefsstore";
import * as rowmodel from "../src/upload/rowmodel";
import { EMPTY_META, type UploadRow } from "../src/upload/types";
import { selectionLoad } from "./helpers/selectionload";

function committed(row: UploadRow, effective: UploadSettings = DEFAULT_UPLOAD_SETTINGS): UploadRow {
  const record = newExportRecord({
    pair: { id: row.source.id, base: row.source.base, suffix: "", dir: row.source.dirPath },
    source: { svgPath: row.source.svgPath, version: 1, approval: "approved", fingerprint: "sha256:fixture" },
    settings: { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, effective, fingerprint: settingsFingerprint(effective) },
    svgo: { enabled: false, version: "", config: "", beforeBytes: 0, afterBytes: 0, beforeHash: "", afterHash: "" }, epsEnabled: false,
  });
  record.status = "processed"; record.stage = "committed";
  return { ...row, record, sourceHash: "sha256:fixture", status: "processed", stale: false };
}
function modelOf(count = 100): UploadModel {
  return { ...initialModel({ settings: { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, applied: {} },
    gemini: parseGeminiConfig(null), prefs: DEFAULT_UPLOAD_PREFS, prompt: "", presets: [] }),
    rows: selectionLoad(count).upload.map((row) => committed(row)) };
}
afterEach(() => vi.restoreAllMocks());

describe("targeted Upload stale projection", () => {
  it.each(["meta", "run", "override", "overrides-patch"] as const)("projects only the changed id for %s", (kind) => {
    const m = modelOf(1000), id = m.rows[0].source.id;
    const actions: Record<typeof kind, UploadAction> = {
      meta: { type: "meta", id, meta: { ...EMPTY_META, state: "generated", metadata: { title: "Fixture title", description: "Fixture description", tags: [] } } },
      run: { type: "run", id, run: { status: "failed", error: "fixture failure" } },
      override: { type: "override", id, patch: { strokePx: 2 } },
      "overrides-patch": { type: "overrides-patch", overrides: { [id]: { strokePx: 2 } } },
    };
    const project = vi.spyOn(rowmodel, "staleOf");
    const next = reduceState(m, actions[kind]);
    expect(project.mock.calls.length).toBe(1);
    expect(next.rows[0]).not.toBe(m.rows[0]);
    expect(next.rows.slice(1).every((row, i) => row === m.rows[i + 1])).toBe(true);
    expect(m.rows.every((row) => !row.stale)).toBe(true);
  });

  it("applies/removes local pins and applied-only changes in one batch without touching other rows", () => {
    const m = modelOf(), [a, b, c] = m.rows.map((r) => r.source.id);
    m.overrides = { [a]: { strokePx: 2 }, [b]: { strokePx: 3 } };
    const project = vi.spyOn(rowmodel, "staleOf");
    const next = reduceState(m, { type: "overrides-patch", overrides: { [a]: {}, [b]: null, fresh: { strokePx: 7 } }, applied: { [c]: { shadowEnabled: true } } });
    expect(project.mock.calls.length).toBe(3);
    expect(next.overrides).toEqual({ fresh: { strokePx: 7 } });
    expect(m.overrides).toEqual({ [a]: { strokePx: 2 }, [b]: { strokePx: 3 } });
    expect(next.applied[c]).toEqual({ shadowEnabled: true });
    expect(next.rows[2].stale).toBe(true);
    expect(next.rows.slice(3)).toEqual(m.rows.slice(3));
  });

  it("does no stale work for empty patches and unknown row ids", () => {
    const m = modelOf(), project = vi.spyOn(rowmodel, "staleOf");
    const next = reduceState(m, { type: "overrides-patch", overrides: {}, applied: {} });
    const missing = reduceState(next, { type: "override", id: "missing", patch: { strokePx: 3 } });
    expect(project.mock.calls.length).toBe(0);
    expect(missing.overrides.missing).toEqual({ strokePx: 3 });
    expect(missing.rows.every((row, i) => row === m.rows[i])).toBe(true);
  });

  it("keeps applied decorations when metadata/run or defaults change, but local pins win", () => {
    const m = modelOf(2), [a, b] = m.rows.map((row) => row.source.id);
    m.applied = { [a]: { shadowEnabled: true }, [b]: { shadowEnabled: true } };
    m.overrides = { [b]: { shadowEnabled: false } };
    m.rows[0] = committed(m.rows[0], { ...DEFAULT_UPLOAD_SETTINGS, shadowEnabled: true });
    const meta = reduceState(m, { type: "meta", id: a, meta: EMPTY_META });
    expect(meta.rows[0].stale).toBe(false);
    const run = reduceState(meta, { type: "run", id: a, run: { status: "processed" } });
    expect(run.rows[0].stale).toBe(false);
    const global = reduceState(run, { type: "defaults", defaults: { ...m.defaults, shadowEnabled: true } });
    expect(global.rows.map((row) => row.stale)).toEqual([false, false]);
  });

  it("does not fingerprint pinned rows or equal nested defaults during global edits", () => {
    const m = modelOf(3), [a, b] = m.rows.map((row) => row.source.id);
    m.overrides = { [a]: { shadowEnabled: false } };
    m.applied = { [b]: { shadowEnabled: false } };
    const project = vi.spyOn(rowmodel, "staleOf");
    const next = reduceState(m, { type: "defaults", defaults: { ...m.defaults, shadowEnabled: true } });
    expect(project.mock.calls.length).toBe(1);
    expect(next.rows[0]).toBe(m.rows[0]); expect(next.rows[1]).toBe(m.rows[1]);
    expect(next.rows[2].stale).toBe(true);
    project.mockClear();
    const equal = reduceState(next, { type: "defaults", defaults: { ...next.defaults, artboard: { ...next.defaults.artboard } } });
    expect(project.mock.calls.length).toBe(0);
    expect(equal.rows.every((row, i) => row === next.rows[i])).toBe(true);
  });

  it("projects necessary global changes and preserves in-flight status", () => {
    const m = modelOf(2), id = m.rows[0].source.id;
    m.rows[0] = { ...m.rows[0], running: "metadata", status: "metadata" };
    const global = reduceState(m, { type: "defaults", defaults: { ...m.defaults, strokePx: 4 } });
    expect(global.rows.every((row) => row.stale)).toBe(true);
    expect(global.rows[0].status).toBe("metadata");
    const reset = reduceState(global, { type: "defaults", defaults: m.defaults });
    expect(reset.rows.every((row) => !row.stale)).toBe(true);
    expect(reset.rows[0].running).toBe("metadata");
    expect(reset.rows[1].status).toBe("processed");
    expect(reduceState(reset, { type: "run", id, run: { running: null, status: "processed" } }).rows[0].status).toBe("processed");
  });
});
