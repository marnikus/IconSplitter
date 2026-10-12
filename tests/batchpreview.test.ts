// batchpreview.test.ts — pure lib for Batch merge preview

import { describe, expect, it } from "vitest";
import { clampMergeFrac, effectiveMerge, mergeForRow, previewKey } from "../src/lib/batchpreview";

describe("batchpreview lib", () => {
  it("clampMergeFrac valid 0..0.15 else null", () => {
    expect(clampMergeFrac(null)).toBeNull();
    expect(clampMergeFrac(0)).toBe(0);
    expect(clampMergeFrac(0.05)).toBe(0.05);
    expect(clampMergeFrac(0.15)).toBe(0.15);
    expect(clampMergeFrac(-0.01)).toBeNull();
    expect(clampMergeFrac(0.16)).toBeNull();
    expect(clampMergeFrac(NaN)).toBeNull();
    expect(clampMergeFrac(undefined as never)).toBeNull();
  });

  it("previewKey includes mergeFrac, padding, size, transparent", () => {
    const k1 = previewKey({ relPath: "a/b.png", mergeFrac: null, padding: 6, size: 0, transparent: false, mtime: 123 });
    const k2 = previewKey({ relPath: "a/b.png", mergeFrac: 0.05, padding: 6, size: 0, transparent: false, mtime: 123 });
    const k3 = previewKey({ relPath: "a/b.png", mergeFrac: null, padding: 10, size: 0, transparent: false, mtime: 123 });
    const k4 = previewKey({ relPath: "a/b.png", mergeFrac: null, padding: 6, size: 256, transparent: false, mtime: 123 });
    const k5 = previewKey({ relPath: "a/b.png", mergeFrac: null, padding: 6, size: 0, transparent: true, mtime: 123 });
    const k6 = previewKey({ relPath: "a/c.png", mergeFrac: null, padding: 6, size: 0, transparent: false, mtime: 123 });
    expect(k1).not.toBe(k2);
    expect(k1).not.toBe(k3);
    expect(k1).not.toBe(k4);
    expect(k1).not.toBe(k5);
    expect(k1).not.toBe(k6);
    expect(k1).toContain("a/b.png");
  });

  it("previewKey stable for same inputs", () => {
    const k1 = previewKey({ relPath: "x.png", mergeFrac: 0.05, padding: 6, size: 0, transparent: false });
    const k2 = previewKey({ relPath: "x.png", mergeFrac: 0.05, padding: 6, size: 0, transparent: false });
    expect(k1).toBe(k2);
  });
});

describe("batchpreview — the merge distance one row really uses", () => {
  it("effectiveMerge: an override wins, null override means auto", () => {
    expect(effectiveMerge(0.02, 0.05, true)).toBe(0.05);
    expect(effectiveMerge(0.02, null, true)).toBeNull();
    expect(effectiveMerge(0.02, undefined, false)).toBe(0.02);
    expect(effectiveMerge(null, 0.03, true)).toBe(0.03);
    expect(effectiveMerge(null, undefined, false)).toBeNull();
  });

  it("mergeForRow: an explicit value (the Apply click) beats map and global", () => {
    const merges = { "icon-a_ai.png": 0.08, "icon-b_ai.png": null };
    expect(mergeForRow(0.02, merges, "icon-a_AI.png", 0.05)).toBe(0.05);
    expect(mergeForRow(0.02, merges, "icon-a_AI.png", null)).toBeNull();
    expect(mergeForRow(0.02, merges, "untouched_AI.png", 0.1)).toBe(0.1);
  });

  it("mergeForRow: the map decides when no explicit value is given (case-insensitive key)", () => {
    const merges = { "icon-a_ai.png": 0.08, "icon-b_ai.png": null };
    expect(mergeForRow(0.02, merges, "Icon-A_AI.png")).toBe(0.08);
    expect(mergeForRow(0.02, merges, "ICON-B_AI.PNG")).toBeNull();
  });

  it("mergeForRow: no map entry falls back to the global distance", () => {
    expect(mergeForRow(0.02, {}, "icon-c_AI.png")).toBe(0.02);
    expect(mergeForRow(null, {}, "icon-c_AI.png")).toBeNull();
    expect(mergeForRow(0.02, {}, "icon-c_AI.png", undefined)).toBe(0.02);
  });
});
