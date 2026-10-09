// regensvg.test.ts — the v2 regeneration rule, pure (RULE 8/16): the settings
// shape and its parse/serialize pair, the v2 prompt text (preset + current SVG
// code + the same title contract the first generation uses), and the ONE
// splitter's solo rule — a re-generated icon travels alone, in pick order,
// while brand-new icons still batch at the user's size (design 2026-10-09 D1/D4).
import { describe, expect, it } from "vitest";
import {
  DEFAULT_REGEN_SETTINGS, parseRegenSettings, regenPrompt, serializeRegenSettings, type RegenSettings,
} from "../src/lib/regensvg";
import { planBatches, type BatchSource } from "../src/lib/svgbatch";

const src = (id: string, solo = false): BatchSource =>
  ({ sourceId: id, name: `${id}_AI`, relPath: `architecture/${id}_AI.png`, fingerprint: "20:1", solo });

describe("the settings (D1/D2)", () => {
  it("defaults to OFF with no preset", () => {
    expect(DEFAULT_REGEN_SETTINGS).toEqual({ enabled: false, preset: "" });
    expect(parseRegenSettings(null)).toEqual(DEFAULT_REGEN_SETTINGS);
    expect(parseRegenSettings("junk")).toEqual(DEFAULT_REGEN_SETTINGS);
    expect(parseRegenSettings({ enabled: "yes", preset: 3 })).toEqual(DEFAULT_REGEN_SETTINGS);
  });

  it("round-trips a stored choice and ignores a half-broken one", () => {
    const on: RegenSettings = { enabled: true, preset: "Strict stock rules" };
    expect(parseRegenSettings(JSON.parse(serializeRegenSettings(on)))).toEqual(on);
    // enabled survives only with a usable preset name alongside it
    expect(parseRegenSettings({ enabled: true, preset: "" })).toEqual({ enabled: true, preset: "" });
    expect(parseRegenSettings({ enabled: true })).toEqual({ enabled: true, preset: "" });
  });
});

describe("regenPrompt — the v2 text (design §1)", () => {
  const code = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><title>fog</title></svg>";
  const text = regenPrompt("Keep the stroke weight even.", code, "fog_architecture_AI");

  it("carries the preset's own words and the current SVG code", () => {
    expect(text).toContain("Keep the stroke weight even.");
    expect(text).toContain(code);
  });

  it("keeps the title contract the first generation uses, so matching works as always", () => {
    expect(text).toContain("Icon name (use it as the SVG <title>): fog_architecture_AI");
  });

  it("says the code is the icon's current version and the image is the reference", () => {
    expect(text.toLowerCase()).toContain("current");
    expect(text.toLowerCase()).toContain("reference image");
  });
});

describe("planBatches — re-generations go solo, in order (D4)", () => {
  const ids = (plans: ReturnType<typeof planBatches>) => plans.map((p) => p.items.map((i) => i.sourceId));

  it("still batches plain selections exactly as before", () => {
    expect(ids(planBatches([src("a"), src("b"), src("c")], 2))).toEqual([["a", "b"], ["c"]]);
  });

  it("gives every solo source its own request and keeps the pick order", () => {
    const plans = planBatches([src("a", true), src("b"), src("c"), src("d")], 2);
    expect(ids(plans)).toEqual([["a"], ["b", "c"], ["d"]]);
    expect(plans[0].items[0].solo).toBe(true);
  });

  it("two solos in a row are two requests, and a trailing open batch still flushes", () => {
    expect(ids(planBatches([src("a", true), src("b", true), src("c")], 4))).toEqual([["a"], ["b"], ["c"]]);
  });

  it("never lets a solo share a sheet with another icon, whatever the size", () => {
    for (const plan of planBatches([src("a"), src("b", true), src("c", true), src("d"), src("e")], 4)) {
      if (plan.items.some((i) => i.solo)) expect(plan.items).toHaveLength(1);
    }
  });
});
