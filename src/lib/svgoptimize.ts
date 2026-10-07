// svgoptimize.ts — SVGO on the export COPY (RULE 3/15). Owns: the pinned SVGO
// configuration, running it on a string, and the equivalence evidence that
// decides whether the optimised copy may be used at all.
//
// Order matters and is enforced by the pipeline, not by hope: the export is
// optimised BEFORE the metadata is embedded, so no optimiser pass can touch an
// accepted title. The config keeps everything the brief names — viewBox,
// geometry, colours, strokes, ids and transforms — and refuses the two plugins
// that could change how the artwork LOOKS (shape→path, path merging).
//
// `SVGO_VERSION` is recorded in `export.json` with the config, so a package can
// always say which optimiser produced it.

import { optimize } from "svgo/browser";
import { documentBounds } from "./uploadbounds";

export const SVGO_VERSION = "svgo@4.1.0";

/**
 * The configuration, in one place, as data (it is recorded verbatim).
 *
 * Two svgo rules shape it, both found by running it:
 *  - `overrides` may only name plugins the preset actually owns; anything else
 *    only earns a console warning. `removeViewBox` is NOT a preset member in
 *    svgo 4 (nothing removes a viewBox by default) and `removeTitle` is a
 *    standalone plugin whose `fn` ignores its params.
 *  - svgo 4 dropped the old `active: false` flag: listing a standalone plugin
 *    at all RUNS it. So "keep <title>" is expressed by not listing it, and the
 *    cheaper, explicit `removeDesc: false` override keeps the description.
 */
export const SVGO_CONFIG = {
  multipass: false,
  floatPrecision: 3,
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          cleanupIds: false, // url(#id) references must not move
          convertShapeToPath: false, // shape type is part of the stroke contract
          mergePaths: false, // merging can change fill-rule appearance
          removeMetadata: false, // embedded metadata is the payload
          removeDesc: false, // <title>/<desc> carry the accepted metadata
          removeHiddenElems: false, // "hidden" here can mean "clipped", not "gone"
        },
      },
    },
  ],
} as const;

export interface OptimizeResult {
  ok: boolean;
  /** The optimised document, or the input unchanged when optimisation failed. */
  code: string;
  error: string | null;
  beforeBytes: number;
  afterBytes: number;
  version: string;
}

/**
 * Runs SVGO once. A failure is NOT fatal: the unoptimised copy is returned with
 * the reason, because a package with a slightly larger SVG is worth more than a
 * package that does not exist.
 */
export function optimizeSvg(code: string): OptimizeResult {
  try {
    const result = optimize(
      code,
      SVGO_CONFIG as unknown as Parameters<typeof optimize>[1],
    );
    const out = typeof result.data === "string" ? result.data : "";
    if (out.trim() === "") throw new Error("the optimiser returned nothing");
    return {
      ok: true,
      code: out,
      error: null,
      beforeBytes: byteLength(code),
      afterBytes: byteLength(out),
      version: SVGO_VERSION,
    };
  } catch (error) {
    return {
      ok: false,
      code,
      error: error instanceof Error ? error.message : "optimisation failed",
      beforeBytes: byteLength(code),
      afterBytes: byteLength(code),
      version: SVGO_VERSION,
    };
  }
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export interface StructureCheck {
  ok: boolean;
  differences: string[];
  /** The numbers the record cites as optimisation evidence. */
  evidence: { elements: number; paths: number; strokeWidths: string[] };
}

/**
 * Structural equivalence of two SVG documents: the element census, the stroke
 * declarations and — the part that really matters — the geometry. The bounds
 * are measured with the same code the artboard used, so any change that moves
 * the artwork is caught here instead of being discovered on a website.
 */
export function compareStructures(
  before: string,
  after: string,
  tolerance = 0.01,
): StructureCheck {
  const a = census(before);
  const b = census(after);
  const differences = [
    // A collapsed <g> is a legitimate optimisation, so the census counts what is
    // DRAWN (shapes), not how many wrapper elements survived.
    ...diff("shapes", a.shapes, b.shapes),
    ...diff("fills", a.fills, b.fills),
    ...diff("strokes", a.strokes, b.strokes),
    ...boundsDiff(before, after, tolerance),
  ];
  return {
    ok: differences.length === 0,
    differences,
    evidence: {
      elements: b.elements,
      paths: b.shapes,
      strokeWidths: b.strokeWidths,
    },
  };
}

interface Census {
  elements: number;
  shapes: number;
  fills: number;
  strokes: number;
  strokeWidths: string[];
}

function census(code: string): Census {
  const doc = new DOMParser().parseFromString(code, "image/svg+xml");
  const all = Array.from(doc.getElementsByTagName("*"));
  const value = (name: string) =>
    all
      .map((el) => (el.getAttribute(name) ?? "").trim())
      .filter((v) => v !== "" && v !== "none");
  return {
    elements: all.length,
    shapes: all.filter((el) =>
      [
        "path",
        "rect",
        "circle",
        "ellipse",
        "line",
        "polyline",
        "polygon",
      ].includes(el.nodeName.toLowerCase()),
    ).length,
    fills: new Set(value("fill")).size,
    strokes: new Set(value("stroke")).size,
    strokeWidths: [...new Set(value("stroke-width"))].sort(),
  };
}

function diff(label: string, a: number, b: number): string[] {
  return a === b ? [] : [`${label}: ${a} → ${b}`];
}

/** The measured ink box of both documents must agree within the tolerance. */
function boundsDiff(
  before: string,
  after: string,
  tolerance: number,
): string[] {
  const a = documentBounds(before).bounds?.box ?? null;
  const b = documentBounds(after).bounds?.box ?? null;
  if (a === null || b === null)
    return a === b ? [] : ["geometry could not be measured on both sides"];
  const deltas = [a.x - b.x, a.y - b.y, a.w - b.w, a.h - b.h].map(Math.abs);
  return deltas.every((d) => d <= tolerance)
    ? []
    : [`geometry moved: ${deltas.map((d) => d.toFixed(4)).join(", ")}`];
}
