// pairmeta.test.ts — the one JSON per image pair (I-41/I-42), TDD: the model
// round-trips, a legacy v1 file keeps its versions and derives the pair it
// belongs to, a decision never touches the SVG history (and vice versa), and the
// record rules (pending owns no record) stay exactly as the Selection spec says.
import { describe, expect, it } from "vitest";
import { pairId, type ReviewPair } from "../src/lib/pairing";
import type { Decision } from "../src/lib/reviewfilter";
import { NO_COST, type SvgVersion } from "../src/lib/svgfile";
import {
  metaFileName, metaPathFor, newPairMeta, parsePairMeta, pairMetaFromLegacy, serializePairMeta,
  toRecord, withDecision, type PairMeta, type PairSide,
} from "../src/lib/pairmeta";
import { rebaseMeta } from "../src/lib/pairrebase";

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

function pair(over: Partial<ReviewPair> = {}): ReviewPair {
  return {
    pairId: pairId("a", "icon", ""), base: "icon", suffix: "", relDir: "a",
    source: { relPath: SIDE_SRC.relPath, size: 12, mtime: 200, error: null },
    ai: { relPath: SIDE_AI.relPath, size: 20, mtime: 300, error: null },
    created: 200, generated: 300, ...over,
  };
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

describe("the chosen version is part of the pair file (I-54)", () => {
  it("round-trips a choice and keeps the history and the decision intact", () => {
    const written = meta({ decision: "approved", reviewedAt: "2026-10-05T17:02:11.000Z", preferred: 1, versions: [version(1), version(2)] });
    const back = parsePairMeta(serializePairMeta(written));
    expect(back.ok).toBe(true);
    expect(back.ok && back.meta).toEqual(written); // nothing dropped, nothing invented
    expect(back.ok && back.meta.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(back.ok && back.meta.decision).toBe("approved");
  });

  it("defaults to null: a file that predates the field means nobody chose", () => {
    const raw = JSON.parse(serializePairMeta(meta({ versions: [version(1)] }))) as Record<string, unknown>;
    delete raw.preferred; // exactly what an older build wrote
    const back = parsePairMeta(JSON.stringify(raw));
    expect(back.ok && back.meta.preferred).toBeNull();
    expect(back.ok && back.meta.versions).toHaveLength(1);
  });

  it("refuses a nonsense preference instead of losing the file (RULE 13)", () => {
    const base = JSON.parse(serializePairMeta(meta({ versions: [version(1)] }))) as Record<string, unknown>;
    for (const bad of ["first", -1, 0, 1.5, {}]) {
      const back = parsePairMeta(JSON.stringify({ ...base, preferred: bad }));
      expect(back.ok).toBe(true); // the versions still parse...
      expect(back.ok && back.meta.preferred).toBeNull(); // ...and the choice is simply absent
    }
  });

  it("keeps v=2: an older build must not call a file with a choice corrupt (I-49)", () => {
    expect((JSON.parse(serializePairMeta(meta({ preferred: 2 }))) as { v: number }).v).toBe(2);
  });

  it("carries the choice across a rebase into another root (I-49)", () => {
    const moved = rebaseMeta(meta({ preferred: 2, versions: [version(1), version(2)] }), "copied");
    expect(moved.preferred).toBe(2);
    expect(moved.versions).toHaveLength(2);
  });
});

describe("a generated SVG follows the pair file between roots (I-49)", () => {
  it("re-points each generated version's svgPath at the file's own directory", () => {
    const moved = rebaseMeta(meta({ versions: [version(1), version(2)] }), "copied");
    expect(moved.versions.map((v) => v.svgPath)).toEqual([
      "copied/icon_AI.svg",
      "copied/icon_AI_v2.svg",
    ]);
  });

  it("keeps a failed version's empty path empty — there is no file to point at", () => {
    const moved = rebaseMeta(meta({ versions: [version(1), version(2, { status: "failed", svgPath: "" })] }), "copied");
    expect(moved.versions.map((v) => v.svgPath)).toEqual(["copied/icon_AI.svg", ""]);
  });

  it("leaves the paths alone when the file is read from the root that wrote it", () => {
    const moved = rebaseMeta(meta({ versions: [version(1), version(2)] }), "a");
    expect(moved.versions.map((v) => v.svgPath)).toEqual(["a/icon_AI.svg", "a/icon_AI_v2.svg"]);
  });

  it("reads a root-level pair file: the file name alone is the path", () => {
    const moved = rebaseMeta(meta({ versions: [version(1)] }), "");
    expect(moved.versions.map((v) => v.svgPath)).toEqual(["icon_AI.svg"]);
  });

  it("tolerates a hand-edited Windows-style path instead of carrying it over", () => {
    const moved = rebaseMeta(meta({ versions: [version(1, { svgPath: "a\\icon_AI.svg" })] }), "copied");
    expect(moved.versions.map((v) => v.svgPath)).toEqual(["copied/icon_AI.svg"]);
  });

  it("forgives a trailing slash and leaves a path with no file name alone", () => {
    const moved = rebaseMeta(meta({ versions: [
      version(1, { svgPath: "a/icon_AI.svg/" }),
      version(2, { svgPath: "/" }),
    ] }), "copied");
    expect(moved.versions.map((v) => v.svgPath)).toEqual(["copied/icon_AI.svg", "/"]);
  });
});

describe("the record rules are unchanged (I-13)", () => {
  it("a pending pair owns no record, even after being reviewed before", () => {
    expect(toRecord(meta({ decision: "pending", reviewedAt: "2026-10-05T17:02:11.000Z" }), pair())).toBeNull();
  });

  it("an approved pair's record names both faces and its timestamp", () => {
    const rec = toRecord(meta({ decision: "approved", reviewedAt: "2026-10-05T17:02:11.000Z" }), pair());
    expect(rec).toEqual({
      pair_id: pairId("a", "icon", ""), source: SIDE_SRC.relPath, ai_result: SIDE_AI.relPath,
      decision: "approved", reviewed_at: "2026-10-05T17:02:11.000Z",
    });
  });

  it("a record is built from the pair on disk, so nothing is invented", () => {
    const rec = toRecord(meta({ decision: "declined", reviewedAt: "2026-10-05T17:02:11.000Z" }), pair({ source: null }));
    expect(rec?.source).toBeNull();
    expect(rec?.ai_result).toBe(SIDE_AI.relPath);
  });
});

describe("one write carries both halves", () => {
  it("setting the decision keeps every version", () => {
    const with_svg = { ...meta(), versions: [version(1, { review: "approved" })] };
    const next = withDecision(with_svg, "declined" as Decision, "2026-10-05T17:02:11.000Z");
    expect(next.decision).toBe("declined");
    expect(next.versions).toHaveLength(1);
    expect(next.versions[0].cost).toEqual({ ...NO_COST, actual: 0.0123, pricing: "requesty-2026-08-01", basis: "provider" });
  });

  it("resetting to pending keeps the reviewed-at stamp out of the record", () => {
    const next = withDecision(meta({ decision: "approved", reviewedAt: "2026-10-05T17:02:11.000Z" }), "pending", "2026-10-05T17:03:00.000Z");
    expect(toRecord(next, pair())).toBeNull();
  });
});

describe("where the file lives", () => {
  it("is named after the AI image beside it", () => {
    expect(metaFileName("icon-sheet_AI_01.png")).toBe("icon-sheet_AI_01.svg.json");
    expect(metaPathFor(pair())).toBe("a/icon_AI.svg.json");
  });

  it("names the AI image a reference-only pair would have", () => {
    expect(metaPathFor(pair({ ai: null }))).toBe("a/icon_AI.svg.json");
    expect(metaPathFor(pair({ ai: null, suffix: "_01", base: "icon-sheet" }))).toBe("a/icon-sheet_AI_01.svg.json");
  });

  it("falls back to the pair id for the locator when there is no AI name at all", () => {
    const rec = toRecord(meta({ decision: "approved", reviewedAt: "x" }), pair({ ai: null, source: null }));
    expect(metaPathFor(pair({ ai: null, source: null }))).toBe(""); // nothing to name the file after
    expect(rec).toBeNull(); // and a pair with neither side is not a record either
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
