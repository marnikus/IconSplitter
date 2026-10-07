// optimizer.ts — the SVGO call itself (design §11; research 3; merge report §3.1).
// The POLICY lives in lib/svgupload/optimize (pure); this file is the thin half
// that imports the official browser build of SVGO and decides what may be kept:
//
//   · with a renderer available, the FULL preset runs and the two documents are
//     compared at 256×256 — the optimisation is kept only when the pixels match
//     within the budget, so convertPathData and friends may work without the tab
//     ever publishing a picture nobody looked at. That is the base branch's
//     pattern, and it is the reason the delivery attempt exists at all.
//   · with no renderer (an environment without a canvas) only the two plugins
//     that cannot change a pixel run, and the comparison stays structural.
//
// Either way a refusal writes the UNOPTIMISED copy and says why; the approved
// source is never touched, and nothing here ever falls back to "the optimizer
// said so".

import { optimize, VERSION } from "svgo/browser";
import {
  byteLength, COMPARE, compareSignatures, deliveryConfig, optimizeConfig, rendersMatch, structuralIssues,
  svgSignature, type Diff,
} from "../lib/svgupload/optimize";

/** Which policy produced the bytes, recorded alongside SVGO's own version. */
export type OptimizeMode = "delivery" | "conservative" | "off";

/** Renders one document to RGBA pixels; null when the environment cannot. */
export type PixelRender = (svg: string) => Promise<Uint8Array | null>;

export interface OptimizeOut {
  svg: string;
  applied: boolean;
  mode: OptimizeMode;
  /** SVGO's own version string, recorded in export.json. */
  version: string;
  bytesBefore: number;
  bytesAfter: number;
  /** Signature differences; empty when the kept copy is the same picture. */
  differences: Diff[];
  warnings: string[];
}

/** Optimises the export copy when asked; NEVER touches the approved source. */
export async function optimizeSvg(code: string, enabled: boolean, pixels?: PixelRender): Promise<OptimizeOut> {
  const before = byteLength(code);
  if (!enabled) return kept(code, before, { mode: "off" });
  if (pixels === undefined) return conservative(code, before);
  return await delivery(code, before, pixels);
}

/** The full preset behind the appearance gate — the report's §3.1 pattern. */
async function delivery(code: string, before: number, pixels: PixelRender): Promise<OptimizeOut> {
  const result = run(code, deliveryConfig());
  if (result === null) return kept(code, before, { mode: "delivery", warnings: ["SVGO could not read the document — the unoptimised copy was written."] });
  const issues = structuralIssues(code, result);
  if (issues.length > 0) return refused(code, before, `SVGO changed the document's frame (${issues.join(", ")})`);
  const after = byteLength(result);
  if (after >= before) return refused(code, before, "SVGO found nothing to shrink");
  const same = await rendersMatch(await pixels(code), await pixels(result), COMPARE);
  if (!same) return refused(code, before, "SVGO would have changed the artwork");
  return { svg: result, applied: true, mode: "delivery", version: VERSION, bytesBefore: before, bytesAfter: after, differences: [], warnings: [] };
}

/** No renderer: only the plugins that cannot change a pixel are allowed to run. */
function conservative(code: string, before: number): OptimizeOut {
  const result = run(code, optimizeConfig());
  if (result === null) return kept(code, before, { mode: "conservative", warnings: ["SVGO could not read the document — the unoptimised copy was written."] });
  const differences = compareSignatures(svgSignature(code), svgSignature(result));
  if (differences.length > 0) {
    return kept(code, before, { mode: "conservative", differences, warnings: ["SVGO would have changed the artwork, so the unoptimised copy was written instead."] });
  }
  return { svg: result, applied: true, mode: "conservative", version: VERSION, bytesBefore: before, bytesAfter: byteLength(result), differences, warnings: [] };
}

/** Runs one SVGO configuration; null when SVGO itself throws. */
function run(code: string, config: unknown): string | null {
  try {
    // The config is plain data built by the pure policy module; SVGO's own types
    // describe its Node build, so the browser call takes the documented shape.
    return optimize(code, { ...(config as object), path: "export.svg" } as unknown as Parameters<typeof optimize>[1]).data;
  } catch {
    return null;
  }
}

/** The unoptimised copy, with the reason stated in the caller's own words. */
function refused(code: string, before: number, why: string): OptimizeOut {
  return kept(code, before, { mode: "delivery", warnings: [`${why}, so the unoptimised copy was written.`] });
}

/** The unoptimised copy, with whatever the caller wants said about it. */
function kept(code: string, bytes: number, out: { mode: OptimizeMode; differences?: Diff[]; warnings?: string[] }): OptimizeOut {
  return {
    svg: code, applied: false, mode: out.mode, version: VERSION,
    bytesBefore: bytes, bytesAfter: bytes, differences: out.differences ?? [], warnings: out.warnings ?? [],
  };
}
