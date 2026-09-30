// TDD cycle 3 — statefile: per-reference JSON model (spec §2, §6).
// merge semantics, statuses, corrupt-payload rejection (RULE 13).
import { describe, expect, it } from "vitest";
import {
  blankState, markProcessed, mergeScan, parseState, serializeState,
} from "../src/lib/statefile";
import type { AiImageEntry } from "../src/lib/scan";

const img = (relPath: string, size = 10, mtime = 1, ref: string | null = "ref.png"): AiImageEntry => ({
  name: relPath.split("/").pop()!,
  relPath,
  dirPath: relPath.includes("/") ? relPath.split("/")[0] : "",
  size,
  mtime,
  ai: { base: "ref", variant: null, ext: ".png" },
  refRelPath: ref,
});

describe("mergeScan — JSON follows every scan (spec §6)", () => {
  it("new images arrive as unprocessed; existing keep their status", () => {
    const s0 = blankState("ref");
    const s1 = mergeScan(s0, [img("a_AI.png")], "t1");
    expect(s1.sources[0].status).toBe("unprocessed");
    const done = markProcessed(s1, "a_AI.png", "t2");
    const s2 = mergeScan(done, [img("a_AI.png"), img("b_AI.png")], "t3");
    const by = Object.fromEntries(s2.sources.map((r) => [r.relPath, r.status]));
    expect(by).toEqual({ "a_AI.png": "processed", "b_AI.png": "unprocessed" });
  });

  it("size or mtime change flips a record to 'changed'", () => {
    const s1 = mergeScan(blankState("ref"), [img("a_AI.png", 10, 1)], "t1");
    const s2 = mergeScan(s1, [img("a_AI.png", 99, 1)], "t2");
    expect(s2.sources[0].status).toBe("changed");
  });

  it("absent files are retained as 'missing', never dropped (history)", () => {
    const s1 = mergeScan(blankState("ref"), [img("a_AI.png"), img("b_AI.png")], "t1");
    const s2 = mergeScan(s1, [img("a_AI.png")], "t2");
    const rec = s2.sources.find((r) => r.relPath === "b_AI.png")!;
    expect(rec.status).toBe("missing");
    expect(s2.sources).toHaveLength(2);
  });

  it("a reappearing file becomes unprocessed again", () => {
    const s1 = mergeScan(blankState("ref"), [img("a_AI.png")], "t1");
    const s2 = mergeScan(s1, [], "t2");
    const s3 = mergeScan(s2, [img("a_AI.png")], "t3");
    expect(s3.sources[0].status).toBe("unprocessed");
  });

  it("records reference path and missing-reference warning", () => {
    const s = mergeScan(blankState("ref"), [img("a_AI.png", 1, 1, null)], "t1");
    expect(s.refRelPath).toBeNull();
    expect(s.refMissing).toBe(true);
  });
});

describe("serialize / parse — never persist what you cannot read back (RULE 13)", () => {
  it("round-trips a full state", () => {
    const s = mergeScan(blankState("ref"), [img("a_AI.png")], "t1");
    const back = parseState(serializeState(s))!;
    expect(back.base).toBe("ref");
    expect(back.sources).toHaveLength(1);
    expect(back.sources[0].relPath).toBe("a_AI.png");
  });

  it("rejects corrupt or malformed payloads with null", () => {
    expect(parseState("{oops")).toBeNull();
    expect(parseState('"hello"')).toBeNull();
    expect(parseState('{"base": 5}')).toBeNull();
    expect(parseState('{"base":"x","sources":"nope"}')).toBeNull();
  });

  it("drops invalid records but keeps valid ones", () => {
    const text = JSON.stringify({
      base: "ref", refPath: null, refMissing: false, updated: "t",
      sources: [{ relPath: "ok_AI.png", status: "unprocessed" }, { nonsense: true }, 42],
    });
    const s = parseState(text)!;
    expect(s.sources.map((r) => r.relPath)).toEqual(["ok_AI.png"]);
  });
});
