// Photoshop Image Resource Blocks. Preserve non-IPTC resources byte-for-byte.
import type { IconMetadata } from "./meta";
import { buildIptc, readIptc } from "./iptc";
import { bigEndian, joinBytes, readBigEndian, utf8 } from "./metadatabytes";

export const PHOTOSHOP_ID = "Photoshop 3.0\0";
const SIGNATURE = utf8("8BIM");
interface Resource { id: number; data: Uint8Array; raw: Uint8Array }
export function iptcResource(meta: IconMetadata): Uint8Array {
  return photoshopResource(0x0404, buildIptc(meta));
}
export function photoshopResource(id: number, data: Uint8Array): Uint8Array {
  return joinBytes(SIGNATURE, bigEndian(id, 2), new Uint8Array(2), bigEndian(data.length, 4), data, new Uint8Array(data.length % 2));
}
export function photoshopResources(bytes: Uint8Array): Resource[] {
  const resources: Resource[] = [];
  let at = 0;
  while (at < bytes.length) {
    if (!SIGNATURE.every((b, i) => bytes[at + i] === b)) throw new Error("invalid Photoshop resource signature");
    const start = at;
    const id = readBigEndian(bytes, at + 4, 2);
    const nameSize = bytes[at + 6] + 1;
    at += 6 + nameSize + nameSize % 2;
    const size = readBigEndian(bytes, at, 4);
    at += 4;
    const end = at + size;
    if (end + size % 2 > bytes.length) throw new Error("truncated Photoshop resource");
    resources.push({ id, data: bytes.slice(at, end), raw: bytes.slice(start, end + size % 2) });
    at = end + size % 2;
  }
  return resources;
}
export function readPhotoshopIptc(bytes: Uint8Array): IconMetadata | null {
  try {
    const iptc = photoshopResources(bytes).filter((r) => r.id === 0x0404);
    return iptc.length === 1 ? readIptc(iptc[0].data) : null;
  } catch { return null; }
}
