// pairmeta.test.ts — the pair file's model (I-41): a decision never touches the
// SVG history (and vice versa), the file is located from the pair beside it,
// and a file read at another pick level is re-seated onto the picked root
// (I-46). Reading is tests/pairfile.test.ts, the merge tests/pairmerge.test.ts.
import { describe, expect, it } from "vitest";
import { pairId, type ReviewPair } from "../src/lib/pairing";
import type { Decision } from "../src/lib/reviewfilter";
import { NO_COST, type SvgVersion } from "../src/lib/svgfile";
import {
  metaFileName, metaPathFor, newPairMeta, rebasePairMeta,
  withDecision, type PairMeta, type PairSide,
} from "../src/lib/pairmeta";
import { toRecord } from "../src/lib/pairmerge";

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

describe("rebasePairMeta — the file's seat beats its stored strings (bug-1)", () => {
  const OUTPUT = "2026-10/2026-10-05_18-45-20/icon-sheet_AI/split_01";
  const STAMP = "icon-sheet_AI/split_01";

  /** Approval written while `_split_output` was picked, now read with the stamp picked. */
  function framedForOutput(): PairMeta {
    return withDecision(newPairMeta({
      id: pairId(OUTPUT, "icon-sheet", "_01"), base: "icon-sheet", suffix: "_01", dirPath: OUTPUT,
      ai: { relPath: `${OUTPUT}/icon-sheet_AI_01.png`, name: "icon-sheet_AI_01.png", fingerprint: "20:960" },
      source: { relPath: `${OUTPUT}/icon-sheet.png`, name: "icon-sheet.png", fingerprint: "12:900" },
    }), "approved", "2026-10-05T17:02:11.000Z");
  }

  it("re-derives the identity and every root-relative path from where the file sits", () => {
    const back = rebasePairMeta(framedForOutput(), `${STAMP}/icon-sheet_AI_01.svg.json`);
    expect(back.id).toBe(pairId(STAMP, "icon-sheet", "_01"));
    expect(back.dirPath).toBe(STAMP);
    expect(back.ai.relPath).toBe(`${STAMP}/icon-sheet_AI_01.png`);
    expect(back.source?.relPath).toBe(`${STAMP}/icon-sheet.png`);
    expect(back.base).toBe("icon-sheet");
    expect(back.suffix).toBe("_01");
    expect(back.ai.name).toBe("icon-sheet_AI_01.png");
    expect(back.ai.fingerprint).toBe("20:960");
    expect(back.source?.fingerprint).toBe("12:900");
    expect(back.decision).toBe("approved");
  });

  it("re-seats version svg paths beside the file and leaves the audit fields alone", () => {
    const m: PairMeta = {
      ...framedForOutput(),
      versions: [version(1, { svgPath: `${OUTPUT}/icon-sheet_AI_01.svg`, review: "approved" })],
    };
    const back = rebasePairMeta(m, `${STAMP}/icon-sheet_AI_01.svg.json`);
    expect(back.versions[0].svgPath).toBe(`${STAMP}/icon-sheet_AI_01.svg`);
    expect(back.versions[0].review).toBe("approved");
    expect(back.versions[0].requestId).toBe("req_1");
  });

  it("derives the id from the intact content when the file's own name was renamed", () => {
    const back = rebasePairMeta(framedForOutput(), `${STAMP}/notes.svg.json`);
    expect(back.id).toBe(pairId(STAMP, "icon-sheet", "_01"));
    expect(back.dirPath).toBe(STAMP);
    expect(back.ai.relPath).toBe(`${STAMP}/icon-sheet_AI_01.png`);
  });

  it("leaves an empty svg path and a name-only face exactly as they were", () => {
    const m = framedForOutput();
    const emptied: PairMeta = {
      ...m, ai: { ...m.ai, relPath: "" }, versions: [version(1, { svgPath: "" })],
    };
    const back = rebasePairMeta(emptied, `${STAMP}/icon-sheet_AI_01.svg.json`);
    expect(back.ai.relPath).toBe("");
    expect(back.ai.name).toBe("icon-sheet_AI_01.png");
    expect(back.versions[0].svgPath).toBe("");
    expect(back.id).toBe(pairId(STAMP, "icon-sheet", "_01"));
  });

  it("is a no-op for a file read at the level it was written", () => {
    const m = framedForOutput();
    expect(rebasePairMeta(m, `${OUTPUT}/icon-sheet_AI_01.svg.json`)).toEqual(m);
  });
});
