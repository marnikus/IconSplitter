// @vitest-environment node
// batchpreview.test.ts — pure lib for Batch merge preview

import { describe, expect, it } from "vitest";
import { clampMergeFrac, previewKey } from "../src/lib/batchpreview";

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
