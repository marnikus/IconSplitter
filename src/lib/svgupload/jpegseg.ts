// jpegseg.ts — metadata inside a JPEG (design §11/§12; research note 4).
// Why byte surgery: `canvas.toBlob` writes a bare JFIF file, and no browser API
// adds XMP or IPTC. This module inserts the two segments a stock marketplace
// reads — APP1 with an XMP packet, APP13 with the Photoshop IRB holding IPTC-IIM
// — and reads them back so the exporter can VERIFY the values rather than assume
// them. Text is written as UTF-8 in both containers (the modern IPTC practice),
// the image data is never touched, and a file that is not a JPEG is refused
// instead of corrupted.

export interface JpegMeta {
  title: string;
  description: string;
  tags: string[];
}

export interface Segment {
  /** Marker byte without the 0xFF, e.g. 0xe1 for APP1. */
  marker: number;
  /** Index of the 0xFF that starts the marker. */
  start: number;
  /** Index just past the segment payload. */
  end: number;
}

export type InsertOut = { ok: true; bytes: Uint8Array } | { ok: false; reason: string };

const SOI = 0xd8;
const SOS = 0xda;
const APP1 = 0xe1;
const APP13 = 0xed;
const XMP_ID = "http://ns.adobe.com/xap/1.0/\u0000";
const PHOTOSHOP_ID = "Photoshop 3.0\u0000";
/** IPTC-IIM dataset ids inside the Photoshop resource block. */
const IPTC_RESOURCE = 0x0404;

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === SOI;
}

/** Every header segment up to (not including) the start of scan. */
export function scanSegments(bytes: Uint8Array): Segment[] {
  const out: Segment[] = [];
  let at = 2;
  while (at + 3 < bytes.length) {
    if (bytes[at] !== 0xff) break;
    const marker = bytes[at + 1];
    if (marker === SOS || marker === SOI || marker === 0xd9) break;
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    const end = at + 2 + length;
    if (length < 2 || end > bytes.length) break;
    out.push({ marker, start: at, end });
    at = end;
  }
  return out;
}

/** Width/height from the frame header (SOFn), or null when there is none. */
export function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  for (const seg of scanSegments(bytes)) {
    if (!isFrameHeader(seg.marker)) continue;
    const base = seg.start + 4; // marker(2) + length(2) + precision(1)
    const height = (bytes[base + 1] << 8) | bytes[base + 2];
    const width = (bytes[base + 3] << 8) | bytes[base + 4];
    return { width, height };
  }
  return null;
}

function isFrameHeader(marker: number): boolean {
  return (marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/** The XMP segment payload: the Adobe identifier, then the packet. */
export function buildXmp(meta: JpegMeta): Uint8Array {
  return utf8(`${XMP_ID}${xmpXml(meta)}`);
}

function xmpXml(meta: JpegMeta): string {
  const li = (values: readonly string[]): string => values.map((v) => `<rdf:li>${esc(v)}</rdf:li>`).join("");
  return [
    `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>`,
    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">`,
    `<rdf:Description>`,
    `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(meta.title)}</rdf:li></rdf:Alt></dc:title>`,
    `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${esc(meta.description)}</rdf:li></rdf:Alt></dc:description>`,
    `<dc:subject><rdf:Bag>${li(meta.tags)}</rdf:Bag></dc:subject>`,
    `</rdf:Description></rdf:RDF></x:xmpmeta>`,
    `<?xpacket end="w"?>`,
  ].join("");
}

/** The APP13 payload: Photoshop IRB wrapper around the IPTC-IIM datasets. */
export function buildIptc(meta: JpegMeta): Uint8Array {
  const iim = concat([
    dataset(2, 5, meta.title),
    dataset(2, 120, meta.description),
    ...meta.tags.map((tag) => dataset(2, 25, tag)),
  ]);
  const header = concat([utf8("8BIM"), be16(IPTC_RESOURCE), new Uint8Array([0, 0]), be32(iim.length)]);
  return concat([utf8(PHOTOSHOP_ID), header, iim, iim.length % 2 === 1 ? new Uint8Array([0]) : new Uint8Array(0)]);
}

function dataset(record: number, set: number, value: string): Uint8Array {
  const data = utf8(value);
  return concat([new Uint8Array([0x1c, record, set]), be16(data.length), data]);
}

/**
 * Writes the two segments into a JPEG. Our own segments are REPLACED (a second
 * export cannot stack duplicates), a foreign APP1 such as EXIF is preserved, and
 * they land after APP0/JFIF so readers that expect that order keep working.
 */
export function insertMetadata(jpeg: Uint8Array, meta: JpegMeta): InsertOut {
  if (!isJpeg(jpeg)) return { ok: false, reason: "The file is not a JPEG (no SOI marker)." };
  const kept = stripOurs(jpeg);
  const at = insertPoint(kept);
  const segments = concat([segment(APP1, buildXmp(meta)), segment(APP13, buildIptc(meta))]);
  return { ok: true, bytes: concat([kept.slice(0, at), segments, kept.slice(at)]) };
}

/** Drops our XMP/IPTC segments (identified by their signatures), keeps the rest. */
function stripOurs(jpeg: Uint8Array): Uint8Array {
  const segments = scanSegments(jpeg);
  const ours = segments.filter((s) => isOurs(jpeg, s));
  if (ours.length === 0) return jpeg;
  const parts: Uint8Array[] = [jpeg.slice(0, 2)];
  let at = 2;
  for (const seg of segments) {
    parts.push(jpeg.slice(at, ours.includes(seg) ? seg.start : seg.end));
    at = seg.end;
  }
  parts.push(jpeg.slice(at));
  return concat(parts);
}

function isOurs(jpeg: Uint8Array, seg: Segment): boolean {
  const body = utf8Decode(jpeg.slice(seg.start + 4, Math.min(seg.end, seg.start + 4 + 32)));
  return (seg.marker === APP1 && body.startsWith(XMP_ID)) || (seg.marker === APP13 && body.startsWith(PHOTOSHOP_ID));
}

/** After APP0/JFIF when there is one, otherwise directly after SOI. */
function insertPoint(jpeg: Uint8Array): number {
  const first = scanSegments(jpeg)[0];
  return first !== undefined && first.marker === 0xe0 ? first.end : 2;
}

function segment(marker: number, payload: Uint8Array): Uint8Array {
  return concat([new Uint8Array([0xff, marker]), be16(payload.length + 2), payload]);
}

/** Reads the values back out of a JPEG, tolerating either container. */
export function readMetadata(jpeg: Uint8Array): JpegMeta | null {
  const segments = scanSegments(jpeg);
  const xmp = segments.find((s) => s.marker === APP1 && isOurs(jpeg, s));
  const iptc = segments.find((s) => s.marker === APP13 && isOurs(jpeg, s));
  if (xmp === undefined && iptc === undefined) return null;
  return {
    title: xmp === undefined ? iptcValue(jpeg, iptc, 5) : xmpValue(jpeg, xmp, "title"),
    description: xmp === undefined ? iptcValue(jpeg, iptc, 120) : xmpValue(jpeg, xmp, "description"),
    tags: xmp === undefined ? iptcTags(jpeg, iptc) : xmpTags(jpeg, xmp),
  };
}

/** Whether the values a caller accepted are really the ones in the file now. */
export function verifyMetadata(jpeg: Uint8Array, meta: JpegMeta): { ok: boolean; errors: string[] } {
  const read = readMetadata(jpeg);
  if (read === null) return { ok: false, errors: ["The JPEG carries no readable metadata."] };
  const errors: string[] = [];
  if (read.title !== meta.title) errors.push(`The title in the file does not match the accepted title (found "${read.title}").`);
  if (read.description !== meta.description) errors.push("The description in the file does not match the accepted description.");
  if (read.tags.length !== meta.tags.length || read.tags.some((t, i) => t !== meta.tags[i])) {
    errors.push(`The tags in the file do not match the accepted list (found ${read.tags.length}).`);
  }
  return { ok: errors.length === 0, errors };
}

function segmentText(jpeg: Uint8Array, seg: Segment | undefined): string {
  if (seg === undefined) return "";
  return utf8Decode(jpeg.slice(seg.start + 4, seg.end));
}

function xmpValue(jpeg: Uint8Array, seg: Segment, field: "title" | "description"): string {
  const xml = segmentText(jpeg, seg);
  const block = new RegExp(`<dc:${field}>([\\s\\S]*?)</dc:${field}>`).exec(xml);
  if (block === null) return "";
  const li = /<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/.exec(block[1]);
  return li === null ? "" : unesc(li[1]);
}

function xmpTags(jpeg: Uint8Array, seg: Segment): string[] {
  const xml = segmentText(jpeg, seg);
  const block = /<dc:subject>([\s\S]*?)<\/dc:subject>/.exec(xml);
  if (block === null) return [];
  return [...block[1].matchAll(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/g)].map((m) => unesc(m[1]));
}

/** The IPTC-IIM datasets inside the Photoshop IRB, in written order. */
function iptcDatasets(jpeg: Uint8Array, seg: Segment | undefined): { set: number; value: string }[] {
  if (seg === undefined) return [];
  const body = jpeg.slice(seg.start + 4, seg.end);
  const start = PHOTOSHOP_ID.length + 4 + 2 + 4; // id + "8BIM" + pascal name + size
  const out: { set: number; value: string }[] = [];
  let at = start;
  while (at + 5 <= body.length && body[at] === 0x1c) {
    const set = body[at + 2];
    const length = (body[at + 3] << 8) | body[at + 4];
    out.push({ set, value: utf8Decode(body.slice(at + 5, at + 5 + length)) });
    at += 5 + length;
  }
  return out;
}

function iptcValue(jpeg: Uint8Array, seg: Segment | undefined, set: number): string {
  return iptcDatasets(jpeg, seg).find((d) => d.set === set)?.value ?? "";
}

function iptcTags(jpeg: Uint8Array, seg: Segment | undefined): string[] {
  return iptcDatasets(jpeg, seg).filter((d) => d.set === 25).map((d) => d.value);
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function unesc(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function be16(value: number): Uint8Array {
  return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
}

function be32(value: number): Uint8Array {
  return new Uint8Array([(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
