// Read header segments only: SOS and entropy-coded pixel bytes are never scanned.
import { bigEndian, joinBytes } from "./metadatabytes";
export interface JpegSegment { marker: number; data: Uint8Array; start: number; end: number }
export function jpegSegments(jpeg: Uint8Array): JpegSegment[] {
  if (jpeg[0] !== 255 || jpeg[1] !== 216) throw new Error("not a JPEG");
  const segments: JpegSegment[] = [];
  let at = 2;
  while (at < jpeg.length) {
    const seg = segmentAt(jpeg, at);
    if (seg === null) break;
    segments.push(seg);
    at = seg.end;
  }
  return segments;
}
/** Parse one marker, respecting fill bytes and standalone marker lengths. */
function segmentAt(jpeg: Uint8Array, start: number): JpegSegment | null {
  let at = start;
  if (jpeg[at++] !== 255) throw new Error("invalid JPEG header");
  while (jpeg[at] === 255) at++;
  const marker = jpeg[at++];
  if (marker === 218 || marker === 217) return null;
  if (standaloneMarker(marker)) return { marker, data: new Uint8Array(), start, end: at };
  if (marker < 192 || marker === 216) throw new Error("invalid JPEG marker");
  const length = (jpeg[at] << 8) | jpeg[at + 1];
  if (length < 2 || at + length > jpeg.length) throw new Error("truncated JPEG segment");
  return { marker, data: jpeg.slice(at + 2, at + length), start, end: at + length };
}
export function jpegSegment(marker: number, data: Uint8Array): Uint8Array {
  if (data.length > 65533) throw new Error("JPEG metadata segment exceeds 65533 bytes");
  return joinBytes(new Uint8Array([255, marker]), bigEndian(data.length + 2, 2), data);
}
export function hasBytesPrefix(data: Uint8Array, prefix: Uint8Array): boolean {
  return data.length >= prefix.length && prefix.every((b, i) => data[i] === b);
}

function standaloneMarker(marker: number): boolean {
  return marker === 1 || (marker >= 208 && marker <= 215);
}
