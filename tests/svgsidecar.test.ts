// svgsidecar.test.ts — per-file sidecar schema: tolerant parse, version
// numbering that never reuses a number, latest-valid selection, review state.
import { describe, expect, it } from "vitest";
import {
  addVersion, emptySidecar, latestValid, nextVersion, parseSidecar,
  reviewOf, serializeSidecar, type SvgVersionRec,
} from "../src/lib/svgsidecar";

const rec = (version: number, over: Partial<SvgVersionRec> = {}): SvgVersionRec => ({
  version, file: `x_AI.v${version}.svg`, createdAt: "2026-10-01T10:00:00.000Z",
  prompt: "p", provider: "requesty", model: "openai/gpt-6.1-sol",
  batchId: null, requestId: null, position: null, compositeHash: null,
  tokensIn: null, tokensOut: null, tokensTotal: null, cost: null, costKind: null,
  validationOk: true, validationWarnings: [], review: "pending",
  status: "generated", safeError: null, ...over,
});

describe("parse / serialize", () => {
  it("round-trips a sidecar", () => {
    const s = addVersion(emptySidecar("id1", "coastal/x_AI.png", "fp1"), rec(1));
    const back = parseSidecar(serializeSidecar(s));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.sidecar.versions).toHaveLength(1);
  });

  it("missing sidecar means not generated, corrupt means warn not crash", () => {
    expect(parseSidecar("").ok).toBe(false);
    expect(parseSidecar("{not json").ok).toBe(false);
    expect(parseSidecar('{"versions":"nope"}').ok).toBe(false);
  });

  it("keeps good versions and drops foreign garbage fields", () => {
    const good = rec(1);
    const text = JSON.stringify({ v: 1, sourceId: "id1", sourcePath: "p", fingerprint: "fp", versions: [good, { version: "x" }] });
    const back = parseSidecar(text);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.sidecar.versions.map((v) => v.version)).toEqual([1]);
  });
});

describe("versions", () => {
  it("next version is always one past the highest, even after declines", () => {
    let s = emptySidecar("id1", "p", "fp");
    s = addVersion(s, rec(1));
    s = addVersion(s, rec(2, { status: "failed", validationOk: false }));
    expect(nextVersion(s)).toBe(3);
  });

  it("latestValid skips failed and interrupted versions", () => {
    let s = emptySidecar("id1", "p", "fp");
    s = addVersion(s, rec(1));
    s = addVersion(s, rec(2, { status: "failed", validationOk: false }));
    s = addVersion(s, rec(3, { status: "interrupted" }));
    expect(latestValid(s)?.version).toBe(1);
  });

  it("review follows the newest valid version and can change", () => {
    let s = emptySidecar("id1", "p", "fp");
    s = addVersion(s, rec(1));
    expect(reviewOf(s)).toBe("pending");
    s = addVersion(s, { ...rec(1), review: "approved" });
    expect(reviewOf(s)).toBe("approved");
  });

  it("an empty sidecar has no version and no review", () => {
    const s = emptySidecar("id1", "p", "fp");
    expect(latestValid(s)).toBeNull();
    expect(reviewOf(s)).toBeNull();
    expect(nextVersion(s)).toBe(1);
  });
});
