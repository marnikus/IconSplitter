// JPEG XMP + IPTC-IIM metadata; pixel data is preserved, APP1/APP13 replaced.

import { sameMetadata } from "./rights";
import { joinBytes, utf8 } from "./metadatabytes";
import type { IconMetadata } from "./meta";
import { buildXmpPacket, readXmpPacket } from "./xmp";
import { embedIptcInJpeg, readJpegIptc } from "./jpegiptc";
import { sameLegacyMetadata } from "./iptc";
import { jpegSegments, jpegSegment, hasBytesPrefix, type JpegSegment } from "./jpegmarkers";

export { buildXmpPacket } from "./xmp";

const SOI = [0xff, 0xd8];
const EOI = [0xff, 0xd9];
const APP1 = 0xe1;
const XMP_ID = "http://ns.adobe.com/xap/1.0/\0";

export interface JpegDimensions {
  width: number;
  height: number;
}

export interface JpegVerification {
  ok: boolean;
  errors: string[];
  width: number | null;
  height: number | null;
}

/** The JPEG with XMP APP1 and IPTC APP13 embedded (idempotent; input untouched). */
export function embedXmpMetadata(jpeg: Uint8Array, meta: IconMetadata): Uint8Array {
  const withoutXmp = stripXmp(embedIptcInJpeg(jpeg, meta));
  const payload = joinBytes(utf8(XMP_ID), utf8(buildXmpPacket(meta)));
  const segment = jpegSegment(APP1, payload);
  return joinBytes(joinBytes(new Uint8Array(SOI), segment), withoutXmp.slice(2));
}

/** The embedded metadata read back; null when no valid XMP packet is present. */
export function readXmpMetadata(jpeg: Uint8Array): IconMetadata | null {
  const xml = xmpPayload(jpeg);
  return xml === null ? null : readXmpPacket(xml);
}

/** The decoded dimensions from the SOF segment (baseline or progressive). */
export function readJpegDimensions(jpeg: Uint8Array): JpegDimensions | null {
  for (const seg of segments(jpeg)) {
    if (seg.marker < 0xc0 || seg.marker > 0xcf || seg.marker === 0xc4 || seg.marker === 0xc8 || seg.marker === 0xcc) continue;
    if (seg.data.length < 5) continue;
    return { height: (seg.data[1] << 8) | seg.data[2], width: (seg.data[3] << 8) | seg.data[4] };
  }
  return null;
}

/** Full verification: SOI/EOI, decoded dimensions, XMP and IPTC readback equals. */
export function verifyJpeg(jpeg: Uint8Array, expected: { width: number; height: number; metadata: IconMetadata }): JpegVerification {
  const errors: string[] = [];
  checkFrame(jpeg, errors);
  const dims = checkDimensions(jpeg, expected, errors);
  checkMetadata(jpeg, expected, errors);
  if (!sameLegacyMetadata(readJpegIptc(jpeg), expected.metadata)) errors.push("IPTC metadata does not match the accepted fields");
  return { ok: errors.length === 0, errors, width: dims?.width ?? null, height: dims?.height ?? null };
}

function checkFrame(jpeg: Uint8Array, errors: string[]): void {
  if (jpeg.length < 4 || jpeg[0] !== SOI[0] || jpeg[1] !== SOI[1]) errors.push("missing SOI marker");
  if (jpeg.length < 2 || jpeg[jpeg.length - 2] !== EOI[0] || jpeg[jpeg.length - 1] !== EOI[1]) errors.push("missing EOI marker");
}

function checkDimensions(jpeg: Uint8Array, expected: { width: number; height: number }, errors: string[]): JpegDimensions | null {
  const dims = readJpegDimensions(jpeg);
  if (dims === null) errors.push("no SOF segment — not a decodable JPEG");
  else if (dims.width !== expected.width || dims.height !== expected.height) {
    errors.push(`dimensions ${dims.width}x${dims.height} do not match ${expected.width}x${expected.height}`);
  }
  return dims;
}

function checkMetadata(jpeg: Uint8Array, expected: { metadata: IconMetadata }, errors: string[]): void {
  const meta = readXmpMetadata(jpeg);
  if (meta === null) {
    errors.push("no XMP metadata found");
    return;
  }
  const same = sameMetadata(meta, expected.metadata);
  if (!same) errors.push("XMP metadata does not match the accepted fields");
}

// --- segment plumbing ---------------------------------------------------------

function segments(jpeg: Uint8Array): JpegSegment[] {
  try { return jpegSegments(jpeg); } catch { return []; }
}

/** The XMP APP1 payload, or null; the first XMP packet wins. */
function xmpPayload(jpeg: Uint8Array): string | null {
  for (const seg of segments(jpeg)) {
    if (seg.marker !== APP1) continue;
    const id = utf8(XMP_ID);
    if (seg.data.length <= id.length) continue;
    if (!id.every((byte, i) => seg.data[i] === byte)) continue;
    return new TextDecoder().decode(seg.data.slice(id.length));
  }
  return null;
}

/** The JPEG without any XMP APP1 segment (for idempotent re-embedding). */
function stripXmp(jpeg: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [jpeg.slice(0, 2)];
  let at = 2;
  for (const seg of jpegSegments(jpeg)) {
    parts.push(jpeg.slice(at, seg.start));
    if (seg.marker !== APP1 || !hasBytesPrefix(seg.data, utf8(XMP_ID))) parts.push(jpeg.slice(seg.start, seg.end));
    at = seg.end;
  }
  parts.push(jpeg.slice(at));
  return joinBytes(...parts);
}
