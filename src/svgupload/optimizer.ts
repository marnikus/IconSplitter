// optimizer.ts — the SVGO call itself (design §11; research 3). The POLICY lives
// in lib/svgupload/optimize (pure); this file is the thin half that imports the
// official browser build of SVGO, runs the pinned config, and proves the result
// is the same picture: the signature is taken before and after, and a difference
// is reported instead of accepted. An optimizer that would change the artwork is
// an optimizer the export refuses — the original document is written instead.

import { optimize, VERSION } from "svgo/browser";
import { byteLength, compareSignatures, optimizeConfig, svgSignature, type Diff } from "../lib/svgupload/optimize";

export interface OptimizeOut {
  svg: string;
  applied: boolean;
  /** SVGO's own version string, recorded in export.json. */
  version: string;
  bytesBefore: number;
  bytesAfter: number;
  /** Empty when the result is byte-for-byte the same picture. */
  differences: Diff[];
  warnings: string[];
}

/** Optimises the export copy when asked; NEVER touches the approved source. */
export function optimizeSvg(code: string, enabled: boolean): OptimizeOut {
  const before = byteLength(code);
  if (!enabled) return unchanged(code, before, false, []);
  try {
    // The config is plain data built by the pure policy module; SVGO's own types
    // describe its Node build, so the browser call takes the documented shape.
    const result = optimize(code, { ...optimizeConfig(), path: "export.svg" } as unknown as Parameters<typeof optimize>[1]);
    const differences = compareSignatures(svgSignature(code), svgSignature(result.data));
    const keep = differences.length === 0;
    return {
      svg: keep ? result.data : code,
      applied: keep,
      version: VERSION,
      bytesBefore: before,
      bytesAfter: keep ? byteLength(result.data) : before,
      differences,
      warnings: keep ? [] : ["SVGO would have changed the artwork, so the unoptimised copy was written instead."],
    };
  } catch (error) {
    return unchanged(code, before, false, [`SVGO could not read the document (${messageOf(error)}) — the unoptimised copy was written.`]);
  }
}

function unchanged(code: string, bytes: number, applied: boolean, warnings: string[]): OptimizeOut {
  return { svg: code, applied, version: VERSION, bytesBefore: bytes, bytesAfter: bytes, differences: [], warnings };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
