// upmetaxml.ts — the metadata formats the export embeds (prompt §11).
// Owns: XML escaping (one rule), the XMP packet (dc:title / dc:description /
// dc:subject), the binary IPTC IIM record (1:90 UTF-8 charset, 2:00 version,
// 2:07 ObjectName, 2:25 Keywords — one dataset per tag — 2:120 Caption), the
// SVG <metadata> RDF block, and the readback parsers that make embedding
// verifiable field by field. Unicode survives; nothing is truncated silently.

import type { IconMetadata } from "./upmeta";

const XML_ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => XML_ENTITIES[c]);
}

/** The Dublin Core RDF body shared by the XMP packet and the SVG metadata. */
function dcRdf(m: IconMetadata): string {
  const tags = m.tags.map((t) => `<rdf:li>${escapeXml(t)}</rdf:li>`).join("");
  return [
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    "<rdf:Description rdf:about=\"\">",
    `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(m.title)}</rdf:li></rdf:Alt></dc:title>`,
    `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(m.description)}</rdf:li></rdf:Alt></dc:description>`,
    `<dc:subject><rdf:Bag>${tags}</rdf:Bag></dc:subject>`,
    "</rdf:Description>",
    "</rdf:RDF>",
  ].join("");
}

export function xmpPacket(m: IconMetadata): string {
  return [
    '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    dcRdf(m),
    "</x:xmpmeta>",
    '<?xpacket end="w"?>',
    "",
  ].join("\n");
}

/** The <metadata> block the exported SVG carries. */
export function svgMetadataXml(m: IconMetadata): string {
  return dcRdf(m);
}

export interface XmpFields {
  title: string;
  description: string;
  subject: string[];
}

/**
 * Reads the packet back; null when the XML is not an XMP meta block. Walks by
 * localName (no CSS engine) so every DOM agrees on prefixed tags.
 */
export function xmpReadFields(xml: string): XmpFields | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (findByLocal(doc.documentElement, "parsererror") !== null) return null;
  if (doc.documentElement.localName !== "xmpmeta") return null;
  const title = altValue(doc.documentElement, "title");
  const description = altValue(doc.documentElement, "description");
  const subject = findAllByLocal(doc.documentElement, "subject").flatMap((s) =>
    findAllByLocal(s, "li").map((li) => li.textContent ?? ""));
  if (title === null || description === null || subject.length === 0) return null;
  return { title, description, subject };
}

function altValue(root: Element, name: string): string | null {
  const holder = findByLocal(root, name);
  if (holder === null) return null;
  const li = findByLocal(holder, "li");
  return li === null ? null : li.textContent ?? "";
}

function findByLocal(root: Element, name: string): Element | null {
  if (root.localName === name) return root;
  for (const child of Array.from(root.children)) {
    const hit = findByLocal(child, name);
    if (hit !== null) return hit;
  }
  return null;
}

function findAllByLocal(root: Element, name: string): Element[] {
  const out: Element[] = [];
  if (root.localName === name) out.push(root);
  for (const child of Array.from(root.children)) out.push(...findAllByLocal(child, name));
  return out;
}

/** The IIM dataset layout: 0x1C, record, dataset, length (2B BE), data. */
interface IimDataset {
  record: number;
  dataset: number;
  data: Uint8Array;
}

const UTF8_CHARSET = new Uint8Array([0x1b, 0x25, 0x47]); // ESC %G declares UTF-8
const RECORD_VERSION = new Uint8Array([0x00, 0x04]);

/** One binary IPTC IIM record carrying the accepted metadata. */
export function iptcIimRecord(m: IconMetadata): Uint8Array {
  const sets: IimDataset[] = [
    { record: 1, dataset: 0x5a, data: UTF8_CHARSET },
    { record: 2, dataset: 0x00, data: RECORD_VERSION },
    { record: 2, dataset: 0x07, data: utf8(m.title) },
    ...m.tags.map((t) => ({ record: 2, dataset: 0x19, data: utf8(t) })), // 2:25 keywords
    { record: 2, dataset: 0x78, data: utf8(m.description) }, // 2:120 caption
  ];
  const total = sets.reduce((n, s) => n + 5 + s.data.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const s of sets) {
    out[at] = 0x1c;
    out[at + 1] = s.record;
    out[at + 2] = s.dataset;
    out[at + 3] = (s.data.length >> 8) & 0xff;
    out[at + 4] = s.data.length & 0xff;
    out.set(s.data, at + 5);
    at += 5 + s.data.length;
  }
  return out;
}

export interface IimFields {
  title: string | null;
  description: string | null;
  keywords: string[];
}

/**
 * Reads an IIM record back. Honest about damage: parsing stops at the first
 * malformed dataset and returns exactly the datasets that survived intact.
 */
export function parseIptcIim(data: Uint8Array): IimFields {
  const fields: IimFields = { title: null, description: null, keywords: [] };
  let at = 0;
  while (at + 5 <= data.length && data[at] === 0x1c) {
    const len = (data[at + 3] << 8) | data[at + 4];
    if (at + 5 + len > data.length) break; // truncated tail — keep the intact part
    const value = utf8Text(data.subarray(at + 5, at + 5 + len));
    collect(fields, data[at + 1], data[at + 2], value);
    at += 5 + len;
  }
  return fields;
}

function collect(f: IimFields, record: number, dataset: number, value: string): void {
  if (record !== 2) return;
  if (dataset === 0x07) f.title = value;
  else if (dataset === 0x19) f.keywords.push(value);
  else if (dataset === 0x78) f.description = value;
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function utf8Text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
