// Diagnostic only: isolate override-map work, not filesystem, SVG geometry,
// restale cost or browser frames. The production reducer is never substituted.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { initialModel, reduceState } from "../src/upload/statemodel";
import { DEFAULT_UPLOAD_SETTINGS, type SettingsOverrides } from "../src/lib/upload/settings";
import { parseGeminiConfig } from "../src/lib/upload/gemini";
import { DEFAULT_UPLOAD_PREFS } from "../src/upload/prefsstore";

const reports: unknown[] = [];
afterAll(() => {
  const path = process.env.UPLOAD_RESPONSE_REDUCER_REPORT;
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(reports, null, 2));
});

function modelOf(count: number) {
  const overrides: Record<string, SettingsOverrides> = {};
  for (let i = 0; i < count; i++) overrides[`icon-${i}`] = { strokePx: 2 };
  return initialModel({
    settings: { defaults: DEFAULT_UPLOAD_SETTINGS, overrides, applied: {} },
    gemini: parseGeminiConfig(null), prefs: DEFAULT_UPLOAD_PREFS, prompt: "", presets: [],
  });
}

describe("Upload override-map reducer research", () => {
  it.each([100, 1000, 2000])("profiles bulk patch and reset of %i existing pins", (count) => {
    const model = modelOf(count);
    const patch = Object.fromEntries(Object.keys(model.overrides).map((id) => [id, { strokePx: 4 }]));
    const reset = Object.fromEntries(Object.keys(model.overrides).map((id) => [id, null]));
    const start = performance.now();
    const next = reduceState(model, { type: "overrides-patch", overrides: patch });
    const patchMs = performance.now() - start;
    const resetStart = performance.now();
    const cleared = reduceState(next, { type: "overrides-patch", overrides: reset });
    const resetMs = performance.now() - resetStart;
    expect(Object.keys(next.overrides)).toHaveLength(count);
    expect(Object.values(next.overrides).every((v) => v.strokePx === 4)).toBe(true);
    expect(Object.values(model.overrides).every((v) => v.strokePx === 2)).toBe(true);
    expect(cleared.overrides).toEqual({});
    expect(next.defaults).toBe(model.defaults);
    expect(next.applied).toEqual(model.applied);
    reports.push({ count, rows: 0, patchMs: +patchMs.toFixed(3), resetMs: +resetMs.toFixed(3) });
  });
});
