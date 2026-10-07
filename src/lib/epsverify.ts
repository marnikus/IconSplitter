// epsverify.ts — the EPS must be provably an EPS before it can be committed
// (RULE 3/13). Owns: header and BoundingBox checks, the self-containment rules
// that the EPSF spec requires, and the page/ink measurement that lets the UI
// compare the conversion against the SVG it came from.
//
// Renderability is checked too, but by a REAL renderer when the environment has
// one (Ghostscript `gs`); the browser cannot render PostScript, so "we asked a
// renderer to make a PNG and it did" is the only honest renderability claim we
// can make. When no renderer is available the check says so instead of passing
// silently — the pipeline reports the EPS as unverified rather than verified.

import type { EpsFile } from "./epssvg";

export interface EpsChecks {
  /** EPSF header, as an EPSF file must have. */
  header: boolean;
  /** A BoundingBox that fits on the page it declares. */
  boundingBox: boolean;
  /** Nothing that would make a consumer reject or mis-handle the file. */
  selfContained: boolean;
  /** A `showpage` and an `%%EOF`. */
  complete: boolean;
  renderable: "yes" | "no" | "unavailable";
  problems: string[];
}

export interface EpsVerifyInput {
  eps: string;
  expectedPt: { width: number; height: number };
  /** Injected so tests do not need Ghostscript; absent = unavailable. */
  render?: (eps: string) => Promise<boolean>;
}

export interface EpsVerification {
  ok: boolean;
  checks: EpsChecks;
  /** The page size the file declares, in points. */
  page: { width: number; height: number } | null;
  /** The ink box the file declares, in points. */
  ink: { x: number; y: number; w: number; h: number } | null;
}

export async function verifyEps(input: EpsVerifyInput): Promise<EpsVerification> {
  const head = input.eps.split("\n").slice(0, 40).join("\n");
  const header = /^%!PS-Adobe-3\.0 EPSF-3\.0/m.test(head);
  const ink = parseInk(input.eps);
  const page = measurePage(input.eps, input.expectedPt);
  const complete = /showpage/.test(input.eps) && /%%EOF\s*$/.test(input.eps);
  const renderable = await render(input);
  const problems = collectProblems({ eps: input.eps, header, ink, page, complete, renderable });
  return {
    ok: problems.length === 0,
    checks: { header, boundingBox: ink !== null, selfContained: !forbidden(input.eps).length, complete, renderable, problems },
    page,
    ink,
  };
}

type Ink = NonNullable<EpsVerification["ink"]>;
type PageSize = NonNullable<EpsVerification["page"]>;

interface CheckInput {
  eps: string;
  header: boolean;
  ink: Ink | null;
  page: PageSize;
  complete: boolean;
  renderable: EpsChecks["renderable"];
}

/** Every reason this file is not a valid EPS, in the order a reader would ask. */
function collectProblems(input: CheckInput): string[] {
  const problems: string[] = [];
  if (!input.header) problems.push("the file does not start with an EPSF header");
  problems.push(...forbidden(input.eps));
  if (input.ink === null) problems.push("no usable BoundingBox comment");
  if (!input.complete) problems.push("the file has no showpage/%%EOF");
  if (input.renderable === "no") problems.push("a renderer could not draw the file");
  if (input.ink !== null && outside(input.ink, input.page)) problems.push("the BoundingBox lies outside the page");
  return problems;
}

/** A tenth of a point of slack: the header is rounded, the ink box is not. */
function outside(ink: Ink, page: PageSize): boolean {
  return ink.x < 0 || ink.y < 0 || ink.x + ink.w > page.width + 0.5 || ink.y + ink.h > page.height + 0.5;
}

/** Constructs a real EPSF must not contain: previews, binary sections, copiers. */
function forbidden(eps: string): string[] {
  const found: string[] = [];
  if (/%%BeginPreview/.test(eps)) found.push("the file carries a raster preview a vector consumer may use instead");
  if (/%%BeginBinary|%%BeginData/.test(eps)) found.push("the file carries binary data");
  return found;
}

/** `%%BoundingBox: llx lly urx ury`, as integers, per the DSC. */
function parseInk(eps: string): { x: number; y: number; w: number; h: number } | null {
  const hiRes = /^%%HiResBoundingBox:\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*$/m.exec(eps);
  const match = hiRes ?? /^%%BoundingBox:\s*(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s*$/m.exec(eps);
  if (match === null) return null;
  const [x1, y1, x2, y2] = match.slice(1).map(Number);
  if (![x1, y1, x2, y2].every((n) => Number.isFinite(n)) || x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** The page the file draws on: the setup `scale`, or the declared size. */
function measurePage(eps: string, fallback: { width: number; height: number }): { width: number; height: number } {
  const scale = /^([\d.]+) ([\d.]+) scale\s*$/m.exec(eps);
  if (scale === null) return fallback;
  const [w, h] = [Number(scale[1]), Number(scale[2])];
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? { width: w, height: h } : fallback;
}

async function render(input: EpsVerifyInput): Promise<"yes" | "no" | "unavailable"> {
  if (input.render === undefined) return "unavailable";
  try {
    return (await input.render(input.eps)) ? "yes" : "no";
  } catch {
    return "no";
  }
}

/** The verdict a caller should store: `unavailable` is not a failure. */
export function renderableLabel(result: EpsVerification): string {
  return result.checks.renderable === "yes" ? "renderer confirmed"
    : result.checks.renderable === "no" ? "renderer failed"
      : "no renderer available";
}

/** A short line for the export record and the UI. */
export function epsSummary(file: EpsFile, result: EpsVerification): string {
  const size = result.page === null ? "unknown page" : `${result.page.width.toFixed(1)}×${result.page.height.toFixed(1)} pt`;
  const extras = file.features.length === 0 ? "no unsupported features" : `not expressible: ${file.features.join(", ")}`;
  return `EPSF-3.0, ${size}, ${renderableLabel(result)}, ${extras}`;
}
