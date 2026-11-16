// Embed XMP in a PNG iTXt chunk without changing pixel chunks.
import { buildXmpPacket } from "../upload/xmp";
import type { IconMetadata } from "../upload/meta";

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const KEYWORD = "XML:com.adobe.xmp";
const encoder = new TextEncoder();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodePngRecord(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(encoder.encode(type), 4);
  out.set(data, 8);
  view.setUint32(data.length + 8, crc32(out.subarray(4, data.length + 8)));
  return out;
}

function isOldXmp(type: string, data: Uint8Array): boolean {
  if (!["iTXt", "tEXt", "zTXt"].includes(type)) return false;
  const prefix = encoder.encode(`${KEYWORD}\0`);
  return prefix.every((byte, i) => data[i] === byte);
}

function readPngRecord(bytes: Uint8Array, offset: number) {
  const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
  const end = offset + length + 12;
  if (end > bytes.length) throw new Error("truncated PNG chunk");
  const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
  if (offset === 8 && (type !== "IHDR" || length !== 13)) throw new Error("invalid PNG header");
  if (type === "IEND" && length !== 0) throw new Error("invalid PNG end chunk");
  const expected = new DataView(bytes.buffer, bytes.byteOffset + end - 4, 4).getUint32(0);
  if (crc32(bytes.subarray(offset + 4, end - 4)) !== expected) throw new Error("invalid PNG chunk checksum");
  return { end, type, data: bytes.subarray(offset + 8, end - 4), raw: bytes.subarray(offset, end) };
}

export function embedPngXmp(bytes: Uint8Array, meta: IconMetadata): Uint8Array {
  if (!SIGNATURE.every((v, i) => bytes[i] === v)) throw new Error("not a PNG image");
  const records: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;
  let ended = false;
  while (offset + 12 <= bytes.length) {
    const record = readPngRecord(bytes, offset);
    if (record.type === "IEND") {
      records.push(encodePngRecord("iTXt", encoder.encode(`${KEYWORD}\0\0\0\0\0${buildXmpPacket(meta)}`)));
      ended = true;
    }
    if (!isOldXmp(record.type, record.data)) records.push(record.raw);
    offset = record.end;
    if (ended) break;
  }
  if (!ended || offset !== bytes.length) throw new Error("invalid PNG end chunk");
  const out = new Uint8Array(records.reduce((n, record) => n + record.length, 0));
  let at = 0;
  for (const record of records) { out.set(record, at); at += record.length; }
  return out;
}
