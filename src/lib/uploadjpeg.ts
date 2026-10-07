// uploadjpeg.ts — JPEG metadata and verification for the "SVG to upload" tab
// (design §2.6): XMP APP1 carries dc:title / dc:description / dc:subject, the
// modern compatible carrier (IPTC-IIM is legacy binary). The packet is
// embedded as the first APP1 segment after SOI, replacing any previous XMP
// packet (idempotent), and read back for verification. Dimensions come from
// the SOF segment itself — never from the encode call (RULE 15: verify by
// decoding, and here by parsing, what was actually written).

import type { IconMetadata } from "./uploadmeta";

const SOI = [0xff, 0xd8];
const EOI = [0xff, 0xd9];
const APP1 = 0xe1;
const XMP_ID = "http://ns.adobe.com/xap/1.0/\0";
const RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const DC_NS = "http://purl.org/dc/elements/1.1/";

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

/** The XMP packet for the metadata (Adobe XMP, rdf:Alt for the texts). */
export function buildXmpPacket(meta: IconMetadata): string {
  const li = (text: string) => `<rdf:li xml:lang="x-default">${escapeXml(text)}</rdf:li>`;
  const tags = meta.tags.map((t) => `<rdf:li>${escapeXml(t)}</rdf:li>`).join("");
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="IconSplitter">
 <rdf:RDF xmlns:rdf="${RDF_NS}">
  <rdf:Description rdf:about="" xmlns:dc="${DC_NS}">
   <dc:title><rdf:Alt>${li(meta.title)}</rdf:Alt></dc:title>
   <dc:description><rdf:Alt>${li(meta.description)}</rdf:Alt></dc:description>
   <dc:subject><rdf:Bag>${tags}</rdf:Bag></dc:subject>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The JPEG with the XMP APP1 packet embedded (idempotent; input untouched). */
export function embedXmpMetadata(jpeg: Uint8Array, meta: IconMetadata): Uint8Array {
  const withoutXmp = stripXmp(jpeg);
  const payload = concat(ascii(XMP_ID), new TextEncoder().encode(buildXmpPacket(meta)));
  const segment = concat(new Uint8Array([0xff, APP1]), u16(payload.length + 2), payload);
  return concat(concat(new Uint8Array(SOI), segment), withoutXmp.slice(2));
}

/** The embedded metadata read back; null when no XMP packet is present. */
export function readXmpMetadata(jpeg: Uint8Array): IconMetadata | null {
  const xml = xmpPayload(jpeg);
  if (xml === null) return null;
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror") !== null) return null;
  const title = xmpText(doc, "title");
  const description = xmpText(doc, "description");
  if (title === null || description === null) return null;
  const tags = xmpTags(doc);
  if (tags.length === 0) return null;
  return { title, description, tags };
}

function xmpText(doc: Document, localName: string): string | null {
  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    if (localNameOf(el) !== localName) continue;
    const text = (el.textContent ?? "").trim();
    if (text !== "") return text;
  }
  return null;
}

function xmpTags(doc: Document): string[] {
  const subject = Array.from(doc.getElementsByTagName("*")).find((el) => localNameOf(el) === "subject");
  if (subject === undefined) return [];
  return Array.from(subject.getElementsByTagName("*"))
    .filter((el) => localNameOf(el) === "li")
    .map((el) => (el.textContent ?? "").trim())
    .filter((t) => t !== "");
}

function localNameOf(el: Element): string {
  const at = el.nodeName.indexOf(":");
  return at >= 0 ? el.nodeName.slice(at + 1) : el.nodeName;
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

/** Full verification: SOI/EOI, decoded dimensions, XMP readback equals. */
export function verifyJpeg(jpeg: Uint8Array, expected: { width: number; height: number; metadata: IconMetadata }): JpegVerification {
  const errors: string[] = [];
  checkFrame(jpeg, errors);
  const dims = checkDimensions(jpeg, expected, errors);
  checkMetadata(jpeg, expected, errors);
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
  const same = meta.title === expected.metadata.title && meta.description === expected.metadata.description
    && meta.tags.join("\u0000") === expected.metadata.tags.join("\u0000");
  if (!same) errors.push("XMP metadata does not match the accepted fields");
}

// --- segment plumbing ---------------------------------------------------------

interface Segment { marker: number; data: Uint8Array }

function segments(jpeg: Uint8Array): Segment[] {
  const out: Segment[] = [];
  let at = 2; // past SOI
  while (at + 4 <= jpeg.length) {
    if (jpeg[at] !== 0xff) break;
    const marker = jpeg[at + 1];
    if (marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push({ marker, data: new Uint8Array(0) });
      at += 2;
      continue;
    }
    const length = (jpeg[at + 2] << 8) | jpeg[at + 3];
    out.push({ marker, data: jpeg.slice(at + 4, at + 2 + length) });
    at += 2 + length;
  }
  return out;
}

/** The XMP APP1 payload, or null; the first XMP packet wins. */
function xmpPayload(jpeg: Uint8Array): string | null {
  for (const seg of segments(jpeg)) {
    if (seg.marker !== APP1) continue;
    const id = ascii(XMP_ID);
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
  while (at + 4 <= jpeg.length) {
    if (jpeg[at] !== 0xff) break;
    const marker = jpeg[at + 1];
    if (marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(jpeg.slice(at, at + 2));
      at += 2;
      continue;
    }
    const length = (jpeg[at + 2] << 8) | jpeg[at + 3];
    const end = at + 2 + length;
    const isXmp = marker === APP1 && startsWithId(jpeg.slice(at + 4, end));
    if (!isXmp) parts.push(jpeg.slice(at, end));
    at = end;
  }
  parts.push(jpeg.slice(at));
  return concat(...parts);
}

function startsWithId(data: Uint8Array): boolean {
  const id = ascii(XMP_ID);
  return data.length > id.length && id.every((byte, i) => data[i] === byte);
}

function ascii(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function u16(value: number): Uint8Array {
  return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
