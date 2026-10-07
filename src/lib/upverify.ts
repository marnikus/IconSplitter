// upverify.ts — the semantic verification gate (report R06, RULE 15). Owns:
// answering "do the bytes we are about to commit carry exactly the accepted
// metadata?" — not "is a packet present?". The SVG <title>/<desc>/<metadata>
// and the JPEG's XMP APP1 and IPTC IIM APP13 are each parsed with the same
// readers the writers are tested against, and every field is compared. A
// mismatch is a hard failure that names the field; the commit never runs.

import { readSvgMetadata } from "./upprepare";
import { readJpegMetadata } from "./upjpegmeta";
import { parseIptcIim, xmpReadFields } from "./upmetaxml";
import type { IconMetadata } from "./upmeta";

export type VerifyResult = { ok: true } | { ok: false; reasons: string[] };

/** The gate the job's validate stage calls: accepted metadata ↔ final bytes. */
export function verifyMetadata(svgText: string, jpeg: Uint8Array, meta: IconMetadata): VerifyResult {
  const reasons = [...svgReasons(svgText, meta), ...jpegReasons(jpeg, meta)];
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

function svgReasons(svgText: string, meta: IconMetadata): string[] {
  const back = readSvgMetadata(svgText);
  if (back === null) return ["the SVG carries no readable title/desc/metadata block"];
  const out: string[] = [];
  if (back.title !== meta.title) out.push("the SVG title differs from the accepted metadata");
  if (back.description !== meta.description) out.push("the SVG description differs from the accepted metadata");
  if (back.tags.join("\u0000") !== meta.tags.join("\u0000")) out.push("the SVG keywords differ from the accepted metadata");
  return out;
}

function jpegReasons(jpeg: Uint8Array, meta: IconMetadata): string[] {
  const back = readJpegMetadata(jpeg);
  const out: string[] = [];
  if (back.xmp === null) out.push("the JPEG has no readable XMP packet");
  else out.push(...xmpReasons(back.xmp, meta));
  if (back.iptc === null) out.push("the JPEG has no readable IPTC packet");
  else out.push(...iimReasons(back.iptc, meta));
  return out;
}

function xmpReasons(xml: string, meta: IconMetadata): string[] {
  const fields = xmpReadFields(xml);
  if (fields === null) return ["the JPEG XMP packet does not parse"];
  const out: string[] = [];
  if (fields.title !== meta.title) out.push("the JPEG XMP title differs from the accepted metadata");
  if (fields.description !== meta.description) out.push("the JPEG XMP description differs from the accepted metadata");
  if (fields.subject.join("\u0000") !== meta.tags.join("\u0000")) out.push("the JPEG XMP keywords differ from the accepted metadata");
  return out;
}

function iimReasons(record: Uint8Array, meta: IconMetadata): string[] {
  const fields = parseIptcIim(record);
  const out: string[] = [];
  if (fields.title !== meta.title) out.push("the JPEG IPTC ObjectName (2:05) differs from the accepted metadata");
  if (fields.description !== meta.description) out.push("the JPEG IPTC caption differs from the accepted metadata");
  if (fields.keywords.join("\u0000") !== meta.tags.join("\u0000")) out.push("the JPEG IPTC keywords differ from the accepted metadata");
  return out;
}
