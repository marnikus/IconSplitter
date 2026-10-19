// pairmeta_ai.test.ts — v3 pair-meta with AI version history (2026-10-16).
// TDD: a v2 file without AI keys must still parse (defaulting aiVersions=[],
// aiPreferred=null), a v3 file round-trips, withAiVersion keeps SVG versions
// intact and replaces same-numbered AI versions, setAiPreferred writes
// additively.
import { describe, expect, it } from "vitest";
import { pairId } from "../src/lib/pairing";
import {
  newPairMeta, parsePairMeta, serializePairMeta,
  type PairMeta, type PairSide,
} from "../src/lib/pairmeta";
import { setAiPreferred, withAiVersion } from "../src/lib/aimeta";
import type { AiVersion } from "../src/lib/imgmodel";

const SIDE_AI: PairSide = { relPath: "a/icon_AI.png", name: "icon_AI.png", fingerprint: "20:300" };
const SIDE_SRC: PairSide = { relPath: "a/icon.png", name: "icon.png", fingerprint: "12:200" };

function aiVer(n: number, extra: Partial<AiVersion> = {}): AiVersion {
  return {
    version: n,
    imagePath: n === 1 ? SIDE_AI.relPath : `a/AI source regeneration versions/icon_AI_v${n}.png`,
    status: n === 1 ? "original" : "generated",
    review: "pending",
    prompt: n === 1 ? "" : "p",
    provider: n === 1 ? "" : "openai",
    model: n === 1 ? "" : "openai/gpt-image-2.5-sunburst",
    requestedAt: "2026-10-16T00:00:00Z",
    completedAt: "2026-10-16T00:00:05Z",
    usage: { input: null, output: null, total: null },
    cost: { actual: null, estimated: null, currency: "USD", pricing: "", basis: "none" },
    validation: { ok: n !== 1, errors: [], warnings: [], width: 1024, height: 1024, bytes: 1000 },
    batch: null, error: null, requestId: null, fromVersion: n <= 1 ? 0 : n - 1,
    ...extra,
  };
}

function fresh(): PairMeta {
  return newPairMeta({
    id: pairId("a", "icon", ""), base: "icon", suffix: "", dirPath: "a",
    ai: SIDE_AI, source: SIDE_SRC,
  });
}

describe("newPairMeta — defaults AI fields (additive, RULE 13)", () => {
  it("starts with empty aiVersions, aiPreferred null, and keeps the current wire version", () => {
    const m = fresh();
    expect(m.aiVersions).toEqual([]);
    expect(m.aiPreferred).toBeNull();
    expect(m.v).toBe(2);
  });
});

describe("parsePairMeta — v2 files default AI fields instead of failing", () => {
  it("reads a v2 JSON (without aiVersions) without crashing", () => {
    const v2 = JSON.stringify({
      v: 2,
      pair: { id: pairId("a", "icon", ""), base: "icon", suffix: "", dir: "a" },
      ai: SIDE_AI, source: SIDE_SRC,
      decision: null, reviewedAt: null, preferred: null, versions: [],
    });
    const out = parsePairMeta(v2);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.meta.aiVersions).toEqual([]);
    expect(out.meta.aiPreferred).toBeNull();
    expect(out.meta.v).toBe(2);
  });

  it("tolerates junk in aiVersions without crashing (drops bad records)", () => {
    const v2 = {
      v: 2,
      pair: { id: pairId("a", "icon", ""), base: "icon", suffix: "", dir: "a" },
      ai: SIDE_AI, source: SIDE_SRC,
      decision: null, reviewedAt: null, preferred: null, versions: [],
      aiVersions: [{ wrong: true }, aiVer(2)],
      aiPreferred: 2,
    };
    const out = parsePairMeta(JSON.stringify(v2));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.meta.aiVersions).toHaveLength(1);
    expect(out.meta.aiVersions[0].version).toBe(2);
    expect(out.meta.aiPreferred).toBe(2);
  });
});

describe("serializePairMeta / parsePairMeta round-trip (v3)", () => {
  it("preserves aiVersions and aiPreferred through a write/read cycle", () => {
    const m = { ...fresh(), aiVersions: [aiVer(2), aiVer(3, { review: "approved" })], aiPreferred: 3 };
    const back = parsePairMeta(serializePairMeta(m));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.meta.aiVersions).toHaveLength(2);
    expect(back.meta.aiVersions[1].review).toBe("approved");
    expect(back.meta.aiPreferred).toBe(3);
  });
});

describe("withAiVersion — additive, keeps SVG versions, replaces same-numbered AI", () => {
  it("appends a new AI version in sorted order", () => {
    const m = fresh();
    const m2 = withAiVersion(m, aiVer(2));
    expect(m2.aiVersions).toHaveLength(1);
    expect(m2.versions).toEqual([]);
    const m3 = withAiVersion(m2, aiVer(3));
    expect(m3.aiVersions.map((v) => v.version)).toEqual([2, 3]);
  });
  it("replaces an existing AI version at the same number (idempotent retry)", () => {
    const m2 = withAiVersion(fresh(), aiVer(2, { prompt: "first" }));
    const m2b = withAiVersion(m2, aiVer(2, { prompt: "second" }));
    expect(m2b.aiVersions).toHaveLength(1);
    expect(m2b.aiVersions[0].prompt).toBe("second");
  });
});

describe("setAiPreferred — writes a choice (I-74)", () => {
  it("sets aiPreferred without touching versions", () => {
    const m = withAiVersion(fresh(), aiVer(2));
    const picked = setAiPreferred(m, 2);
    expect(picked.aiPreferred).toBe(2);
    expect(picked.aiVersions).toHaveLength(1);
  });
  it("allows null to clear preference back to newest-valid", () => {
    const m2 = setAiPreferred(withAiVersion(fresh(), aiVer(2)), 2);
    expect(setAiPreferred(m2, null).aiPreferred).toBeNull();
  });
});
