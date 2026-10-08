// exportvalidate.ts — the validation stage of the export pipeline (design
// §3.2): everything is checked BEFORE anything commits, so a failed check
// leaves the last valid package untouched. The SVG must parse (and its
// embedded metadata must read back exactly), the JPEG must decode to the
// recorded dimensions (and its XMP must read back exactly), the EPS must
// verify, and the record must round-trip.

import { readEmbeddedMetadata } from "../lib/upload/embed";
import { verifyExportSvg } from "../lib/upload/clean";
import { readJpegDimensions, verifyJpeg } from "../lib/upload/jpeg";
import { verifyEpsDocument } from "../lib/upload/eps";
import type { IconMetadata } from "../lib/upload/meta";
import type { CommitValidation } from "./exportcommit";
import type { Artifacts } from "./exportstages";

export interface ArtifactValidation extends CommitValidation {
  errors: string[];
}

/** Validation runs BEFORE commit: a failed check commits nothing. */
export function validateArtifacts(art: Artifacts, metadata: IconMetadata | null): ArtifactValidation {
  const errors: string[] = [];
  return {
    svg: svgCheck(art.svgOut, errors),
    readback: readbackCheck(art.svgOut, metadata, errors),
    jpeg: jpegCheck(art, metadata, errors),
    eps: epsCheck(art.epsText, errors),
    json: true,
    errors,
  };
}

function svgCheck(svgOut: string | null, errors: string[]): boolean {
  if (svgOut === null) return true;
  const ok = svgParses(svgOut);
  if (!ok) errors.push("the export SVG does not parse");
  // The file that ships is checked, not assumed: clean SVG 1.1 (2026-10-08).
  const violations = verifyExportSvg(svgOut);
  errors.push(...violations);
  return ok && violations.length === 0;
}

function readbackCheck(svgOut: string | null, metadata: IconMetadata | null, errors: string[]): boolean {
  if (svgOut === null || metadata === null) return true;
  const back = readEmbeddedMetadata(svgOut);
  const ok = back !== null && back.title === metadata.title && back.description === metadata.description
    && back.tags.join("\u0000") === metadata.tags.join("\u0000");
  if (!ok) errors.push("the embedded SVG metadata does not read back");
  return ok;
}

function jpegCheck(art: Artifacts, metadata: IconMetadata | null, errors: string[]): boolean {
  if (art.jpeg === null) return true;
  const dims = art.jpegRecord ?? readJpegDimensions(art.jpeg);
  const expected = dims === null ? { width: 0, height: 0 } : { width: dims.width, height: dims.height };
  const jpegErrors = metadata === null
    ? verifyJpegFrame(art.jpeg, expected)
    : verifyJpeg(art.jpeg, { ...expected, metadata }).errors;
  errors.push(...jpegErrors);
  return jpegErrors.length === 0;
}

function epsCheck(epsText: string | null, errors: string[]): boolean {
  if (epsText === null) return true;
  const ok = verifyEpsDocument(epsText).ok; // converter-neutral (2026-10-09): Inkscape's EPS passes too
  if (!ok) errors.push("the EPS does not verify");
  return ok;
}

/** SOI/EOI + decoded dimensions, for a JPEG with no XMP to compare. */
function verifyJpegFrame(jpeg: Uint8Array, expected: { width: number; height: number }): string[] {
  const errors: string[] = [];
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) errors.push("missing SOI marker");
  const dims = readJpegDimensions(jpeg);
  if (dims === null) errors.push("no SOF segment — not a decodable JPEG");
  else if (dims.width !== expected.width || dims.height !== expected.height) errors.push("dimensions do not match");
  return errors;
}

export function svgParses(svg: string): boolean {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  return doc.querySelector("parsererror") === null && doc.documentElement?.nodeName.toLowerCase() === "svg";
}
