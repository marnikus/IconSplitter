// generateflow.test.ts — folding batch outcomes into sidecars and file writes
// (pure; the IO layer applies the plan): versions bump, invalid never writes a
// file, failures keep history, review starts pending, usage recorded as actual
// only when the provider reported it.
import { describe, expect, it } from "vitest";
import { planOutcomes, type PlanSource } from "../src/svggen/generateflow";
import type { ItemOutcome } from "../src/lib/svgbatch";
import { emptySidecar, type Sidecar } from "../src/lib/svgsidecar";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><g><path d="M1 1h2"/></g></svg>';

const source = (id: string): PlanSource => ({
  pairId: id, relDir: "coastal", aiName: `${id}_AI.png`, fingerprint: `fp-${id}`,
});

function outcome(id: string, kind: ItemOutcome["kind"], over: Partial<ItemOutcome> = {}): ItemOutcome {
  return { position: 1, sourceId: id, kind, svg: kind === "saved" ? SVG : null, validation: null, reasons: kind === "invalid" ? ["no viewBox"] : [], ...over };
}

const meta = { batchId: "b1", requestId: "r1", prompt: "p", provider: "requesty", model: "openai/gpt-6.1-sol", compositeHash: "h", nowIso: "2026-10-01T12:00:00.000Z" };
const usage = { tokensIn: 10, tokensOut: 5, tokensTotal: 15, cost: 0.02 };

describe("planOutcomes", () => {
  it("saved outcome writes v1 and a pending sidecar with actual usage", () => {
    const plan = planOutcomes({ sources: [source("one")], outcomes: [outcome("one", "saved")], usage, meta, prev: new Map() });
    const p = plan.get("one")!;
    expect(p.writeFile).toMatchObject({ name: "one_AI.v1.svg", text: SVG });
    expect(p.sidecar.versions).toHaveLength(1);
    expect(p.sidecar.versions[0]).toMatchObject({ review: "pending", status: "generated", cost: 0.02, costKind: "actual", position: 1 });
  });

  it("regeneration on an existing sidecar goes to v2 and keeps v1", () => {
    const prev = new Map<string, Sidecar>();
    const first = planOutcomes({ sources: [source("one")], outcomes: [outcome("one", "saved")], usage, meta, prev }).get("one")!.sidecar;
    prev.set("one", first);
    const second = planOutcomes({ sources: [source("one")], outcomes: [outcome("one", "saved")], usage, meta: { ...meta, requestId: "r2" }, prev }).get("one")!;
    expect(second.writeFile?.name).toBe("one_AI.v2.svg");
    expect(second.sidecar.versions.map((v) => v.version)).toEqual([1, 2]);
  });

  it("invalid and missing outcomes write no file but record the attempt", () => {
    const plan = planOutcomes({
      sources: [source("one"), source("two")],
      outcomes: [outcome("one", "invalid"), outcome("two", "missing")],
      usage, meta, prev: new Map(),
    });
    expect(plan.get("one")!.writeFile).toBeNull();
    expect(plan.get("one")!.sidecar.versions[0]).toMatchObject({ status: "failed", validationOk: false });
    expect(plan.get("two")!.writeFile).toBeNull();
    expect(plan.get("two")!.sidecar.versions).toHaveLength(0); // nothing attempted, nothing recorded
  });

  it("missing provider usage is stored as nulls, never invented", () => {
    const plan = planOutcomes({ sources: [source("one")], outcomes: [outcome("one", "saved")], usage: { tokensIn: null, tokensOut: null, tokensTotal: null, cost: null }, meta, prev: new Map() });
    const v = plan.get("one")!.sidecar.versions[0];
    expect(v.tokensTotal).toBeNull();
    expect(v.cost).toBeNull();
    expect(v.costKind).toBeNull();
  });

  it("existing unrelated versions survive (history preserved)", () => {
    const prior = emptySidecar("one", "coastal/one_AI.png", "fp-one");
    const prev = new Map([["one", prior]]);
    const plan = planOutcomes({ sources: [source("one")], outcomes: [outcome("one", "saved")], usage, meta, prev });
    expect(plan.get("one")!.sidecar.sourceId).toBe("one");
    expect(plan.get("one")!.writeFile?.name).toBe("one_AI.v1.svg");
  });
});
