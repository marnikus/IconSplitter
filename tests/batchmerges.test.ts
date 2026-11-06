// batchmerges.test.ts — the per-preset store of per-item split decisions
// (row merges): round-trip, preset isolation, RULE 13 validation entry by
// entry, caps, and deletion. Pure localStorage — no DOM, no React.
import { beforeEach, describe, expect, it } from "vitest";
import { deleteRowMerges, loadRowMerges, MERGES_KEY, saveRowMerges } from "../src/lib/batchmerges";

beforeEach(() => {
  localStorage.clear();
});

describe("batchmerges — per-item split decisions per preset", () => {
  it("round-trips a map and keeps presets isolated", () => {
    saveRowMerges("Default", { "icon-a_ai.png": 0.05, "icon-b_ai.png": null });
    saveRowMerges("Wide", { "icon-a_ai.png": 0.1 });
    expect(loadRowMerges("Default")).toEqual({ "icon-a_ai.png": 0.05, "icon-b_ai.png": null });
    expect(loadRowMerges("Wide")).toEqual({ "icon-a_ai.png": 0.1 });
    expect(loadRowMerges("Missing")).toEqual({});
  });

  it("validates entry by entry (RULE 13): junk values and keys drop, null and 0…0.15 stay", () => {
    localStorage.setItem(MERGES_KEY, JSON.stringify({
      Default: { ok: 0.05, zero: 0, edge: 0.15, over: 0.150001, neg: -0.01, str: "x", "": 0.1, nul: null },
    }));
    expect(loadRowMerges("Default")).toEqual({ ok: 0.05, zero: 0, edge: 0.15, nul: null });
  });

  it("a foreign-shaped store degrades to empty — never throws", () => {
    localStorage.setItem(MERGES_KEY, "not json{");
    expect(loadRowMerges("Default")).toEqual({});
    localStorage.setItem(MERGES_KEY, JSON.stringify({ Default: "junk", Wide: { ok: 0.05 } }));
    expect(loadRowMerges("Default")).toEqual({});
    expect(loadRowMerges("Wide")).toEqual({ ok: 0.05 });
  });

  it("caps a preset's map at 500 rows and the store at 20 presets (oldest preset dropped)", () => {
    const big: Record<string, number | null> = {};
    for (let i = 0; i < 505; i++) big[`row${i}_ai.png`] = 0.05;
    saveRowMerges("Default", big);
    expect(Object.keys(loadRowMerges("Default"))).toHaveLength(500);
    for (let p = 0; p < 25; p++) saveRowMerges(`preset${p}`, { x: p });
    const store = JSON.parse(localStorage.getItem(MERGES_KEY) ?? "{}");
    expect(Object.keys(store)).toHaveLength(20);
    expect(store.preset24).toBeDefined();
    expect(store.preset0).toBeUndefined();
  });

  it("deleteRowMerges removes one preset's map and keeps the others; empty name is a no-op", () => {
    saveRowMerges("Default", { a: 0.05 });
    saveRowMerges("Wide", { a: 0.1 });
    deleteRowMerges("Default");
    expect(loadRowMerges("Default")).toEqual({});
    expect(loadRowMerges("Wide")).toEqual({ a: 0.1 });
    saveRowMerges("", { a: 0.05 }); // never written
    expect(JSON.parse(localStorage.getItem(MERGES_KEY) ?? "{}")[""]).toBeUndefined();
  });
});
