// upjpegmeta.ts — JPEG metadata segment surgery (prompt §11). Owns: inserting
// the XMP APP1 and the IPTC Photoshop APP13 segments after the existing header
// segments (EXIF/APP0 order preserved), stripping our own previous segments so
// re-embedding is idempotent (the metadata-only re-export path), reading them
// back, and parsing the frame dimensions out of SOF. The entropy-coded pixels
// are never touched — embedding is pure byte splicing, no re-encode.

const XMP_SIG = "http://ns.adobe.com/xap/1.0/\0";
const PS_SIG = "Photoshop 3.0\0";
const APP1 = 0xe1;
const APP13 = 0xed;
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

export interface JpegEmbed {
  xmp: string;
  iptc: Uint8Array;
}

interface Segment {
  marker: number;
  start: number;
  next: number;
}

/**
 * Embeds (or replaces — idempotently) the metadata segments. Null when the
 * bytes are not a JPEG or a payload cannot fit one segment (≤ 65 533 bytes).
 */
export function embedJpegMetadata(jpeg: Uint8Array, e: JpegEmbed): Uint8Array | null {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null;
  const app1 = appSegment(APP1, merge(sigBytes(XMP_SIG), utf8(e.xmp)));
  const app13 = appSegment(APP13, merge(sigBytes(PS_SIG), photoshopIrb(e.iptc)));
  if (app1 === null || app13 === null) return null;
  const header = splitHeader(jpeg);
  return merge(
    jpeg.subarray(0, 2),
    mergeAll(header.keep),
    app1,
    app13,
    jpeg.subarray(header.restAt),
  );
}

export interface JpegReadback {
  xmp: string | null;
  iptc: Uint8Array | null;
}

/** Reads OUR segments back: the XMP packet text and the raw IIM record. */
export function readJpegMetadata(jpeg: Uint8Array): JpegReadback {
  const out: JpegReadback = { xmp: null, iptc: null };
  let at = 2;
  while (at + 4 <= jpeg.length) {
    const seg = segmentAt(jpeg, at);
    if (seg === null) break;
    if (seg.marker === APP1 && out.xmp === null && hasSig(jpeg, seg, XMP_SIG)) {
      out.xmp = utf8Text(jpeg.subarray(seg.start + 4 + XMP_SIG.length, seg.next));
    } else if (seg.marker === APP13 && out.iptc === null && hasSig(jpeg, seg, PS_SIG)) {
      out.iptc = iptcFromIrb(jpeg.subarray(seg.start + 4 + PS_SIG.length, seg.next));
    }
    if (seg.marker === 0xda) break; // metadata never lives past SOS
    at = seg.next;
  }
  return out;
}

/** The frame dimensions from the first SOF marker, or null. */
export function jpegDimensions(jpeg: Uint8Array): { width: number; height: number } | null {
  let at = 2;
  while (at + 4 <= jpeg.length) {
    const seg = segmentAt(jpeg, at);
    if (seg === null) return null;
    if (SOF_MARKERS.has(seg.marker)) {
      const height = (jpeg[seg.start + 5] << 8) | jpeg[seg.start + 6];
      const width = (jpeg[seg.start + 7] << 8) | jpeg[seg.start + 8];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (seg.marker === 0xda) return null;
    at = seg.next;
  }
  return null;
}

/** Splits at the first non-APPn segment, dropping our own previous metadata. */
function splitHeader(jpeg: Uint8Array): { keep: Uint8Array[]; restAt: number } {
  const keep: Uint8Array[] = [];
  let at = 2;
  while (at + 4 <= jpeg.length) {
    const seg = segmentAt(jpeg, at);
    if (seg === null || !isAppMarker(seg.marker)) break;
    const ours = (seg.marker === APP1 && hasSig(jpeg, seg, XMP_SIG)) || (seg.marker === APP13 && hasSig(jpeg, seg, PS_SIG));
    if (!ours) keep.push(jpeg.subarray(seg.start, seg.next));
    at = seg.next;
  }
  return { keep, restAt: at };
}

function segmentAt(bytes: Uint8Array, at: number): Segment | null {
  if (at + 2 > bytes.length || bytes[at] !== 0xff) return null;
  const marker = bytes[at + 1];
  if (marker === 0xff || marker === 0x00 || marker === 0x01) return null;
  if (isStandalone(marker)) return { marker, start: at, next: at + 2 };
  if (at + 4 > bytes.length) return null;
  const len = (bytes[at + 2] << 8) | bytes[at + 3];
  if (len < 2 || at + 2 + len > bytes.length) return null;
  return { marker, start: at, next: at + 2 + len };
}

function isStandalone(marker: number): boolean {
  return marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01;
}

function isAppMarker(marker: number): boolean {
  return marker >= 0xe0 && marker <= 0xef;
}

function hasSig(jpeg: Uint8Array, seg: Segment, sig: string): boolean {
  const from = seg.start + 4;
  const sigBytesArr = sigBytes(sig);
  if (from + sigBytesArr.length > seg.next) return false;
  for (let i = 0; i < sigBytesArr.length; i++) {
    if (jpeg[from + i] !== sigBytesArr[i]) return false;
  }
  return true;
}

/** The Photoshop IRB wrapper around one 8BIM resource (0x0404 = IPTC-NAA). */
function photoshopIrb(iptc: Uint8Array): Uint8Array {
  const size = iptc.length;
  const pad = size % 2;
  const out = new Uint8Array(12 + size + pad);
  out.set(utf8("8BIM"), 0);
  out[4] = 0x04;
  out[5] = 0x04;
  out[8] = (size >> 24) & 0xff;
  out[9] = (size >> 16) & 0xff;
  out[10] = (size >> 8) & 0xff;
  out[11] = size & 0xff;
  out.set(iptc, 12);
  return out;
}

/** Extracts the 0x0404 resource data from an IRB, or null. */
function iptcFromIrb(irb: Uint8Array): Uint8Array | null {
  let at = 0;
  while (at + 12 <= irb.length) {
    if (utf8Text(irb.subarray(at, at + 4)) !== "8BIM") return null;
    const id = (irb[at + 4] << 8) | irb[at + 5];
    const nameLen = irb[at + 6];
    const dataAt = at + 6 + nameLen + 1 + (nameLen % 2 === 0 ? 1 : 0);
    const size = (irb[dataAt] << 24) | (irb[dataAt + 1] << 16) | (irb[dataAt + 2] << 8) | irb[dataAt + 3];
    if (id === 0x0404) return irb.subarray(dataAt + 4, dataAt + 4 + size);
    at = dataAt + 4 + size + (size % 2);
  }
  return null;
}

function appSegment(marker: number, payload: Uint8Array): Uint8Array | null {
  const len = payload.length + 2;
  if (len > 0xffff) return null;
  const out = new Uint8Array(2 + len);
  out[0] = 0xff;
  out[1] = marker;
  out[2] = (len >> 8) & 0xff;
  out[3] = len & 0xff;
  out.set(payload, 4);
  return out;
}

function sigBytes(sig: string): Uint8Array {
  return utf8(sig);
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function utf8Text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function merge(...parts: Uint8Array[]): Uint8Array {
  return mergeAll(parts);
}

function mergeAll(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
