// epsio.ts — how an EPS output is actually produced (merge report §3.2, §9).
// The order is the point: the LOCAL writer runs FIRST, so the common case — a
// normal icon, no external service — gets a genuine EPSF-3.0 file written from
// the export copy's own geometry, offline. Only when the document is outside
// what the local writer can draw honestly (gradients, filters, text, opacity,
// markers, clipping, complex CSS, an empty scene) is the configured converter
// asked, and it is asked with the artboard's real size (the donor passed zero
// width/height — the report names that as a defect to fix, S60). With neither
// available the stage reports Partial and names what it refused to fake.
//
// This is the browser half of the EPS seam: it parses the SVG text the run just
// wrote and hands the scene to the pure writer in lib/svgupload/epswrite.

import { parseScene, type GeomScene } from "../lib/svgupload/geom/scene";
import { writeEps, type EpsRequest } from "../lib/svgupload/epswrite";
import { NO_CONVERTER_REASON, epsRequest, verifyEps, type EpsPlan } from "../lib/svgupload/eps";

/** Which half produced the bytes — recorded in the package's tool list. */
export type EpsVia = "local" | "converter";

export type EpsBytes = { ok: true; bytes: Uint8Array; via: EpsVia } | { ok: false; reason: string };

export interface EpsIo {
  plan: EpsPlan;
  request: EpsRequest;
  /** The document title for the PostScript header comment. */
  title: string;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
}

/** Writes the EPS locally when it can, else falls back to the converter. */
export async function epsBytes(svg: string, io: EpsIo): Promise<EpsBytes> {
  const local = localEps(svg, io.request, io.title);
  if (typeof local !== "string") return await fallback(local.error, svg, io);
  const bytes = new TextEncoder().encode(local);
  const check = verifyEps(bytes);
  return check.ok ? { ok: true, bytes, via: "local" } : { ok: false, reason: check.errors[0] };
}

/** The local file as text, or the reason the writer refused (named features). */
function localEps(svg: string, request: EpsRequest, title: string): string | { error: string } {
  const scene = parseSvgText(svg);
  if (scene === null) return { error: "the export copy is not a parsable SVG" };
  return writeEps({ scene, artboard: request.artboard, stroke: request.stroke, title });
}

/** The export copy's scene, or null when the DOM parser rejected the document. */
export function parseSvgText(svg: string): GeomScene | null {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (doc.querySelector("parsererror") !== null) return null;
  return parseScene(doc);
}

/** The configured converter, asked with the artboard's real size. */
async function fallback(localReason: string, svg: string, io: EpsIo): Promise<EpsBytes> {
  if (io.plan.converter === null) return { ok: false, reason: `${localReason}; ${NO_CONVERTER_REASON}` };
  const size = { width: io.request.artboard.w, height: io.request.artboard.h };
  const request = epsRequest(io.plan.converter, svg, size);
  try {
    const response = await io.fetchImpl(request.url, { ...request.init, signal: io.signal });
    if (!response.ok) return { ok: false, reason: `The EPS converter answered ${response.status}.` };
    return { ok: true, bytes: new Uint8Array(await response.arrayBuffer()), via: "converter" };
  } catch (error) {
    const why = error instanceof Error ? error.message : "unknown error";
    return { ok: false, reason: `The EPS converter could not be reached (${why}).` };
  }
}
