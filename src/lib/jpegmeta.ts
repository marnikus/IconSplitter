// jpegmeta.ts — metadata inside the exported JPEG, at the byte level
// (RULE 3/15/23). Owns: finding the JPEG's own segments, writing an XMP packet
// (APP1) and an IPTC IIM block (APP13, Photoshop 8BIM resource 0x0404), reading
// both back, and decoding the frame header. Why bytes and not a library:
// `canvas.toBlob` writes no metadata at all, and the brief requires the embedded
// values to be RE-READ from the produced file and compared — so the writer and
// the reader have to agree on the exact container, and that agreement is here.
//
// Both containers are written with the same values on purpose: some stock
// platforms read only IPTC, some read only XMP. A JPEG cannot carry alpha, so
// transparency was already flattened onto the configured colour before encoding.

import { isRecord } from "./isrecord";
import type { MetadataRecord } from "./uploadmeta";

const SOI = 0xd8;
const APP1 = 0xe1;
const APP13 = 0xed;
const SOS = 0xda;
const XMP_HEADER = "http://ns.adobe.com/xap/1.0/";
const PHOTOSHOP_HEADER = "Photoshop 3.0";
const IPTC_MARKER = 0x1c;

export interface JpegInfo {
  width: number;
  height: number;
  /** 1 = greyscale, 3 = YCbCr — a 4-component file would be CMYK-with-alpha. */
  components: number;
  hasXmp: boolean;
  hasIptc: boolean;
}

export interface JpegEmbedResult {
  ok: boolean;
  bytes: Uint8Array;
  error: string | null;
}

/** Frame header and container flags; null when this is not a readable JPEG. */
export function jpegInfo(bytes: Uint8Array): JpegInfo | null {
  if (!isJpeg(bytes)) return null;
  const info: JpegInfo = { width: 0, height: 0, components: 0, hasXmp: false, hasIptc: false };
  for (const segment of segments(bytes)) inspect(bytes, segment, info);
  return info.width > 0 && info.height > 0 ? info : null;
}

/** A valid JPEG starts with SOI; anything else is refused before it is parsed. */
function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === SOI;
}

/** What one segment contributes to the summary: a marker flag or the frame size. */
function inspect(bytes: Uint8Array, segment: Segment, info: JpegInfo): void {
  if (hasMarker(bytes, segment, APP1, XMP_HEADER)) info.hasXmp = true;
  if (hasMarker(bytes, segment, APP13, PHOTOSHOP_HEADER)) info.hasIptc = true;
  if (isFrame(segment.marker)) Object.assign(info, frameSize(bytes, segment));
}

function hasMarker(bytes: Uint8Array, segment: Segment, marker: number, header: string): boolean {
  return segment.marker === marker && matchHeader(bytes, segment, header);
}

/** Writes XMP + IPTC into the file, replacing any previous pair of both. */
export function embedJpegMetadata(bytes: Uint8Array, record: MetadataRecord): JpegEmbedResult {
  const info = jpegInfo(bytes);
  if (info === null) return { ok: false, bytes, error: "not a readable JPEG" };
  const body = stripMetadata(bytes);
  const head = [
    segment(APP1, concat([utf8(`${XMP_HEADER}\u0000`), utf8(xmpPacket(record))])),
    segment(APP13, concat([utf8(`${PHOTOSHOP_HEADER}\u0000`), photoshopBlock(record)])),
  ];
  return { ok: true, bytes: concat([bytes.subarray(0, 2), head[0], head[1], body]), error: null };
}

export interface JpegMetadata {
  title: string;
  description: string;
  keywords: string[];
}

/** Reads the three fields back out of the produced file (XMP first, IPTC next). */
export function readJpegMetadata(bytes: Uint8Array): JpegMetadata {
  const xmp = findPayload(bytes, APP1, XMP_HEADER);
  const iptc = readIptc(findPayload(bytes, APP13, PHOTOSHOP_HEADER));
  const xml = xmp === null ? null : readXmp(decode(xmp));
  return {
    title: xml?.title || iptc.title,
    description: xml?.description || iptc.description,
    keywords: (xml?.keywords.length ?? 0) > 0 ? (xml?.keywords ?? []) : iptc.keywords,
  };
}

/** True when every accepted field round-trips through the encoded bytes. */
export function jpegMetadataMatches(bytes: Uint8Array, record: MetadataRecord): boolean {
  const read = readJpegMetadata(bytes);
  return read.title === record.title
    && read.description === record.description
    && read.keywords.join(" = ") === record.tags.join(" = ");
}

interface Segment {
  marker: number;
  /** Offset of the payload, and its length in bytes. */
  start: number;
  length: number;
}

/** Every segment up to the scan data; a truncated segment ends the walk. */
function* segments(bytes: Uint8Array): Generator<Segment> {
  for (let pos = 2; pos + 4 <= bytes.length;) {
    if (bytes[pos] !== 0xff) return;
    const marker = bytes[pos + 1];
    if (marker === SOS) return;
    if (marker === 0xff || (marker >= 0xd0 && marker <= 0xd9)) { pos += 2; continue; }
    const length = (bytes[pos + 2] << 8) | bytes[pos + 3];
    if (length < 2 || pos + 2 + length > bytes.length) return;
    yield { marker, start: pos + 4, length: length - 2 };
    pos += 2 + length;
  }
}

function isFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function frameSize(bytes: Uint8Array, segment: Segment): Pick<JpegInfo, "width" | "height" | "components"> {
  return {
    height: (bytes[segment.start + 1] << 8) | bytes[segment.start + 2],
    width: (bytes[segment.start + 3] << 8) | bytes[segment.start + 4],
    components: bytes[segment.start + 5],
  };
}

function matchHeader(bytes: Uint8Array, segment: Segment, header: string): boolean {
  return decode(bytes.subarray(segment.start, segment.start + header.length)) === header;
}

/** The XMP or 8BIM payload of the first matching segment, or null. */
function findPayload(bytes: Uint8Array, marker: number, header: string): Uint8Array | null {
  for (const segment of segments(bytes)) {
    if (segment.marker !== marker || !matchHeader(bytes, segment, header)) continue;
    return bytes.subarray(segment.start + header.length + 1, segment.start + segment.length);
  }
  return null;
}

/** Everything after SOI except the metadata segments we are about to replace. */
function stripMetadata(bytes: Uint8Array): Uint8Array {
  const pieces: Uint8Array[] = [];
  let last = 2; // everything before the first byte removed is kept as it is
  for (const segment of segments(bytes)) {
    const meta = (segment.marker === APP1 && matchHeader(bytes, segment, XMP_HEADER))
      || (segment.marker === APP13 && matchHeader(bytes, segment, PHOTOSHOP_HEADER));
    if (!meta) continue;
    pieces.push(bytes.subarray(last, segment.start - 4)); // the FF that opens the segment
    last = segment.start + segment.length; // the byte after it
  }
  pieces.push(bytes.subarray(last));
  return concat(pieces);
}

function segment(marker: number, payload: Uint8Array): Uint8Array {
  const length = payload.length + 2;
  return concat([new Uint8Array([0xff, marker, (length >> 8) & 0xff, length & 0xff]), payload]);
}

function concat(pieces: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const piece of pieces) { out.set(piece, at); at += piece.length; }
  return out;
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function xmlEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A minimal, spec-shaped XMP packet carrying title, description and keywords. */
export function xmpPacket(record: MetadataRecord): string {
  const bag = record.tags.map((tag) => `<rdf:li>${xmlEscape(tag)}</rdf:li>`).join("");
  return '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>'
    + '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    + '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">'
    + `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(record.title)}</rdf:li></rdf:Alt></dc:title>`
    + `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(record.description)}</rdf:li></rdf:Alt></dc:description>`
    + `<dc:subject><rdf:Bag>${bag}</rdf:Bag></dc:subject>`
    + "</rdf:Description></rdf:RDF></x:xmpmeta>"
    + '<?xpacket end="w"?>';
}

interface XmpFields {
  title: string;
  description: string;
  keywords: string[];
}

/** Parses the XMP packet; a packet we cannot parse is reported as empty. */
function readXmp(packet: string): XmpFields | null {
  const doc = new DOMParser().parseFromString(packet.replace(/<\?xpacket[^>]*\?>/g, ""), "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return null;
  return {
    title: firstText(doc, "dc:title"),
    description: firstText(doc, "dc:description"),
    keywords: Array.from(doc.getElementsByTagName("dc:subject")).flatMap((subject) =>
      Array.from(subject.getElementsByTagName("rdf:li")).map((li) => (li.textContent ?? "").trim()).filter((v) => v !== "")),
  };
}

function firstText(doc: Document, tag: string): string {
  const el = doc.getElementsByTagName(tag)[0];
  const li = el?.getElementsByTagName("rdf:li")[0];
  return ((li ?? el)?.textContent ?? "").trim();
}

/** The 8BIM block: header + resource 0x0404 whose data is the IPTC IIM stream. */
function photoshopBlock(record: MetadataRecord): Uint8Array {
  const iim = iptcStream(record);
  const head = concat([
    utf8("8BIM"),
    new Uint8Array([0x04, 0x04]), // resource id 0x0404 = IPTC-NAA
    new Uint8Array([0x00, 0x00]), // empty Pascal-string name, padded to an even length
    sizeBytes(iim.length),
  ]);
  return concat([head, iim, iim.length % 2 === 1 ? new Uint8Array([0x00]) : new Uint8Array(0)]);
}

function sizeBytes(size: number): Uint8Array {
  return new Uint8Array([(size >> 24) & 0xff, (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff]);
}

/** IPTC IIM records: charset (1:90), title (2:05), description (2:120), keywords (2:25). */
function iptcStream(record: MetadataRecord): Uint8Array {
  return concat([
    iim(1, 90, "\u001b%G"), // CodedCharacterSet: UTF-8, so Unicode survives
    iim(2, 5, record.title),
    iim(2, 120, record.description),
    ...record.tags.map((tag) => iim(2, 25, tag)),
  ]);
}

function iim(record: number, dataset: number, value: string): Uint8Array {
  const bytes = utf8(value);
  const length = Math.min(bytes.length, 0xffff);
  const out = new Uint8Array(5 + length);
  out.set([IPTC_MARKER, record, dataset, (length >> 8) & 0xff, length & 0xff], 0);
  out.set(bytes.subarray(0, length), 5);
  return out;
}

/** Reads the IIM stream back; unknown datasets are skipped, never guessed at. */
function readIptc(payload: Uint8Array | null): JpegMetadata {
  const out: JpegMetadata = { title: "", description: "", keywords: [] };
  if (payload === null) return out;
  const iim = iptcData(payload);
  for (let at = 0; at + 5 <= iim.length && iim[at] === IPTC_MARKER;) {
    const dataset = iim[at + 2];
    const size = (iim[at + 3] << 8) | iim[at + 4];
    const value = decode(iim.subarray(at + 5, at + 5 + size));
    if (dataset === 5) out.title = value;
    else if (dataset === 120) out.description = value;
    else if (dataset === 25) out.keywords.push(value);
    at += 5 + size;
  }
  return out;
}

/** The resource-0x0404 payload inside a Photoshop APP13 block (8BIM + id + name + size). */
function iptcData(payload: Uint8Array): Uint8Array {
  const size = ((payload[8] ?? 0) << 24) | ((payload[9] ?? 0) << 16) | ((payload[10] ?? 0) << 8) | (payload[11] ?? 0);
  return payload.subarray(12, 12 + Math.min(size, Math.max(0, payload.length - 12)));
}

export function isJpegMetadataRecord(value: unknown): value is JpegMetadata {
  return isRecord(value) && typeof value.title === "string";
}
