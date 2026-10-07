// RULE 8 — the export clean gate runs for real: the SVG must parse, carry a
// valid viewBox and version 1.1, and contain zero raster (<image>) elements.
// A failed check commits nothing (RULE 15, fail closed).
import { describe, expect, it } from "vitest";
import { validateArtifacts } from "../src/upload/exportvalidate";
import type { Artifacts } from "../src/upload/exportstages";

const NS = `xmlns="http://www.w3.org/2000/svg"`;
const CLEAN = `<svg ${NS} version="1.1" viewBox="0 0 512 512" width="512" height="512"><rect x="10" y="10" width="80" height="80" fill="#000"/></svg>`;

function art(svgOut: string | null): Artifacts {
  return {
    prepared: null, optimizedSvg: null, optimizeRecord: null,
    svgOut, jpeg: null, jpegRecord: null, epsText: null, epsFailure: null,
  };
}

describe("validateArtifacts — the SVG clean gate", () => {
  it("accepts a clean export SVG (parses, viewBox, version 1.1, no raster)", () => {
    const v = validateArtifacts(art(CLEAN), null);
    expect(v.svg).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it("passes through when no SVG was rebuilt (nothing to check)", () => {
    const v = validateArtifacts(art(null), null);
    expect(v.svg).toBe(true);
  });

  it("rejects a document that does not parse", () => {
    const v = validateArtifacts(art("this is not < xml"), null);
    expect(v.svg).toBe(false);
    expect(v.errors.join(" ")).toContain("does not parse");
  });

  it("rejects a missing or invalid viewBox", () => {
    const missing = `<svg ${NS} version="1.1" width="512" height="512"><rect x="1" y="1" width="4" height="4" fill="#000"/></svg>`;
    expect(validateArtifacts(art(missing), null).svg).toBe(false);
    expect(validateArtifacts(art(missing), null).errors.join(" ")).toContain("viewBox");
    const zero = `<svg ${NS} version="1.1" viewBox="0 0 0 0"><rect x="1" y="1" width="4" height="4" fill="#000"/></svg>`;
    expect(validateArtifacts(art(zero), null).svg).toBe(false);
  });

  it("rejects raster content (<image>)", () => {
    const src = `<svg ${NS} version="1.1" viewBox="0 0 24 24"><image href="data:image/png;base64,xxx" x="1" y="1" width="10" height="10"/></svg>`;
    const v = validateArtifacts(art(src), null);
    expect(v.svg).toBe(false);
    expect(v.errors.join(" ").toLowerCase()).toContain("image");
  });

  it("rejects a missing or non-1.1 version", () => {
    const missing = `<svg ${NS} viewBox="0 0 24 24"><rect x="1" y="1" width="4" height="4" fill="#000"/></svg>`;
    expect(validateArtifacts(art(missing), null).svg).toBe(false);
    const two = `<svg ${NS} version="2.0" viewBox="0 0 24 24"><rect x="1" y="1" width="4" height="4" fill="#000"/></svg>`;
    const v = validateArtifacts(art(two), null);
    expect(v.svg).toBe(false);
    expect(v.errors.join(" ")).toContain("1.1");
  });
});
