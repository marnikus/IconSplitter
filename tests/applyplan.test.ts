// applyplan.test.ts — the write step of generation against in-memory folders:
// svg first then sidecar, a failed sidecar is reported (not fatal) and the svg
// stays on disk for retry (spec §10).
import { describe, expect, it } from "vitest";
import { applyPlan } from "../src/svggen/applyplan";
import type { PairPlan } from "../src/svggen/generateflow";
import { addVersion, emptySidecar, type SvgVersionRec } from "../src/lib/svgsidecar";
import { FakeDir } from "./helpers/fakefs";

const rec: SvgVersionRec = {
  version: 1, file: "one_AI.v1.svg", createdAt: "c", prompt: "p", provider: "requesty",
  model: "m", batchId: "b1", requestId: "r1", position: 1, compositeHash: null,
  tokensIn: 1, tokensOut: 1, tokensTotal: 2, cost: 0.01, costKind: "actual",
  validationOk: true, validationWarnings: [], review: "pending", status: "generated", safeError: null,
};

const plan = (over: Partial<PairPlan> = {}): PairPlan => ({
  pairId: "one", relDir: "coastal", aiName: "one_AI.png",
  sidecar: addVersion(emptySidecar("one", "coastal/one_AI.png", "fp"), rec),
  writeFile: { name: "one_AI.v1.svg", text: "<svg></svg>" },
  ...over,
});

describe("applyPlan", () => {
  it("writes the svg and the sidecar into the source folder", async () => {
    const root = new FakeDir("root");
    const out = await applyPlan(async (rel) => root.getDirectoryHandle(rel, { create: true }), [plan()]);
    expect(out.written).toEqual(["one"]);
    expect(out.sidecarErrors).toEqual([]);
    const dir = await root.getDirectoryHandle("coastal");
    expect(dir.children.has("one_AI.v1.svg")).toBe(true);
    expect(dir.children.has("one_AI.svg.json")).toBe(true);
  });

  it("a sidecar write failure keeps the svg and reports the pair for retry", async () => {
    const root = new FakeDir("root");
    const bad = new FakeDir("coastal");
    const realSave = bad.getFileHandle.bind(bad);
    bad.getFileHandle = async (n: string, opts?: { create?: boolean }) => {
      if (n.endsWith(".json") && opts?.create) throw new Error("disk full");
      return realSave(n, opts);
    };
    root.children.set("coastal", bad);
    const out = await applyPlan(async () => bad, [plan()]);
    expect(out.written).toEqual(["one"]);
    expect(out.sidecarErrors).toEqual(["one"]);
    expect(bad.children.has("one_AI.v1.svg")).toBe(true); // validated output retained
  });

  it("a plan without a file (failed/missing) still refreshes the sidecar", async () => {
    const root = new FakeDir("root");
    const out = await applyPlan(async (rel) => root.getDirectoryHandle(rel, { create: true }), [plan({ writeFile: null })]);
    expect(out.written).toEqual([]);
    expect(out.sidecarErrors).toEqual([]);
    const dir = await root.getDirectoryHandle("coastal");
    expect(dir.children.has("one_AI.svg.json")).toBe(true);
  });
});
