// pairfile.test.ts — reading a pair file (I-41/I-42): a v2 file as it is, a
// legacy v1 sidecar as this pair's file with its versions kept and the pair
// derived from the stored AI face, junk refused without throwing, and a
// half-damaged version list keeping every record that still parses.
import { describe, expect, it } from "vitest";
import { pairId } from "../src/lib/pairing";
import { parsePairMeta, pairMetaFromLegacy } from "../src/lib/pairfile";
import { newPairMeta, serializePairMeta, type PairMeta, type PairSide } from "../src/lib/pairmeta";
import type { SvgVersion } from "../src/lib/svgfile";

const SIDE_AI: PairSide = { relPath: "a/icon_AI.png", name: "icon_AI.png", fingerprint: "20:300" };
const SIDE_SRC: PairSide = { relPath: "a/icon.png", name: "icon.png", fingerprint: "12:200" };

function version(n: number, extra: Partial<SvgVersion> = {}): SvgVersion {
  return {
    version: n, svgPath: `a/icon_AI${n === 1 ? "" : `_v${n}`}.svg`, status: "generated", review: "pending",
    prompt: "make an icon", provider: "requesty", model: "openai/gpt-5",
    requestedAt: "2026-10-05T10:00:00.000Z", completedAt: "2026-10-05T10:00:09.000Z",
    usage: { input: 3100, output: 5200, total: 8300 },
    cost: { actual: 0.0123, estimated: null, currency: "USD", pricing: "requesty-2026-08-01", basis: "provider" },
    validation: { ok: true, errors: [], warnings: [], icons: 1 },
    batch: null, error: null, requestId: "req_1", ...extra,
  };
}

function meta(extra: Partial<PairMeta> = {}): PairMeta {
  const m = newPairMeta({
    id: pairId("a", "icon", ""), base: "icon", suffix: "", dirPath: "a",
    ai: SIDE_AI, source: SIDE_SRC,
  });
  return { ...m, ...extra };
}

describe("the pair file's model", () => {
  it("round-trips every field the four bullets name", () => {
    const written = { ...meta({ decision: "approved", reviewedAt: "2026-10-05T17:02:11.000Z" }), versions: [version(1, { review: "approved" })] };
    const back = parsePairMeta(serializePairMeta(written));
    expect(back.ok).toBe(true);
    expect(back.ok && back.meta).toEqual(written);
  });

  it("reads a legacy v1 file as this pair's file and keeps its versions", () => {
    const legacy = JSON.stringify({
      v: 1,
      source: { relPath: SIDE_AI.relPath, name: SIDE_AI.name, fingerprint: SIDE_AI.fingerprint },
      versions: [version(1, { review: "approved" })],
    });
    const back = parsePairMeta(legacy);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.meta.versions).toHaveLength(1);
    expect(back.meta.versions[0].review).toBe("approved");
    expect(back.meta.ai).toEqual(SIDE_AI);
    expect(back.meta.id).toBe(pairId("a", "icon", ""));
    expect(back.meta.decision).toBeNull(); // an old file never claims a pair approval
  });

  it("derives the pair from the AI name alone (a batch piece keeps its suffix)", () => {
    const legacy = JSON.stringify({
      v: 1,
      source: { relPath: "out/split_01/icon-sheet_AI_01.png", name: "icon-sheet_AI_01.png", fingerprint: "9:9" },
      versions: [],
    });
    const back = parsePairMeta(legacy);
    expect(back.ok && back.meta).not.toBeNull();
    if (!back.ok) return;
    expect(back.meta.base).toBe("icon-sheet");
    expect(back.meta.suffix).toBe("_01");
    expect(back.meta.dirPath).toBe("out/split_01");
    expect(back.meta.id).toBe(pairId("out/split_01", "icon-sheet", "_01"));
  });

  it("exposes the legacy reader the store uses, with the same answer", () => {
    const legacy = { v: 1, source: { relPath: "a/icon_AI.png", name: "icon_AI.png", fingerprint: "20:300" }, versions: [] };
    expect(pairMetaFromLegacy(legacy).ok && pairMetaFromLegacy(legacy).ok ? (pairMetaFromLegacy(legacy) as { ok: true; meta: PairMeta }).meta.base : "").toBe("icon");
  });

  it("refuses junk and a wrong version without throwing", () => {
    expect(parsePairMeta("{ not json").ok).toBe(false);
    expect(parsePairMeta(JSON.stringify({ v: 99, versions: [] })).ok).toBe(false);
    expect(parsePairMeta(JSON.stringify({ v: 2, versions: "no" })).ok).toBe(false);
    expect(parsePairMeta(JSON.stringify({ v: 2, pair: {}, versions: [] })).ok).toBe(false);
  });

  it("keeps a half-damaged file's good versions instead of losing all of them", () => {
    const raw = JSON.parse(serializePairMeta(meta()));
    raw.decision = "approved";
    raw.versions = [version(1, { review: "approved" }), { version: "x" }, { no: true }];
    const back = parsePairMeta(JSON.stringify(raw));
    expect(back.ok).toBe(true);
    expect(back.ok && back.meta.versions).toHaveLength(1);
    expect(back.ok && back.meta.decision).toBe("approved");
  });

  it("treats an unknown decision as no decision, never as approved", () => {
    const raw = JSON.parse(serializePairMeta(meta()));
    raw.decision = "maybe";
    const back = parsePairMeta(JSON.stringify(raw));
    expect(back.ok && back.meta.decision).toBeNull();
  });
});

describe("a pair file reads back as a decision even after a move", () => {
  it("uses the stored pair id, not the path, so a renamed folder keeps its approval", () => {
    const moved = JSON.parse(serializePairMeta({ ...meta({ decision: "approved", reviewedAt: "t" }), dirPath: "old/a" }));
    const back = parsePairMeta(JSON.stringify(moved));
    expect(back.ok && back.meta.decision).toBe("approved");
    expect(back.ok && back.meta.id).toBe(pairId("a", "icon", ""));
  });
});
