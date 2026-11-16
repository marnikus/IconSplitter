// JPEG APP13 Photoshop 3.0 carrier; no changes to image/EXIF/ICC/other IRBs.
import type { IconMetadata } from "./meta";
import { hasBytesPrefix, jpegSegment, jpegSegments } from "./jpegmarkers";
import { joinBytes, utf8 } from "./metadatabytes";
import { iptcResource, PHOTOSHOP_ID, photoshopResources, readPhotoshopIptc } from "./photoshop";
const ID = utf8(PHOTOSHOP_ID);
export function embedIptcInJpeg(jpeg: Uint8Array, meta: IconMetadata): Uint8Array {
  const parts = [jpeg.slice(0, 2), jpegSegment(237, joinBytes(ID, iptcResource(meta)))];
  let at = 2;
  for (const seg of jpegSegments(jpeg)) {
    parts.push(jpeg.slice(at, seg.start));
    if (seg.marker === 237 && hasBytesPrefix(seg.data, ID)) {
      const keep = photoshopResources(seg.data.slice(ID.length)).filter((r) => r.id !== 0x0404 && r.id !== 0x0425);
      if (keep.length > 0) parts.push(jpegSegment(237, joinBytes(ID, ...keep.map((r) => r.raw))));
    } else parts.push(jpeg.slice(seg.start, seg.end));
    at = seg.end;
  }
  parts.push(jpeg.slice(at));
  return joinBytes(...parts);
}
export function readJpegIptc(jpeg: Uint8Array): IconMetadata | null {
  try {
    const resources = jpegSegments(jpeg).filter((s) => s.marker === 237 && hasBytesPrefix(s.data, ID));
    return readPhotoshopIptc(joinBytes(...resources.map((s) => s.data.slice(ID.length))));
  } catch { return null; }
}
