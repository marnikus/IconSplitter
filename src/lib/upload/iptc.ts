// iptc.ts — IPTC-IIM (IIM) metadata codec for JPEG and EPS export.
// IPTC-IIM is the legacy stock-photo carrier Adobe Stock reads from JPEG
// APP13 segments and from vector preview metadata. It complements XMP:
// XMP carries Title/Description/Keywords; IPTC-IIM carries the same plus
// Creator and Copyright. Both are written into every exported JPEG and EPS
// so stock sites that read either carrier find the accepted fields.
//
// Dataset layout (IPTC-IIM): each dataset is
//   [dataset:1][element:1][marker 0x1C:1][sizeHi:1][sizeLo:1][data..]
// Relevant Application record (dataset 2):
//   element 5  = Object Name        (Title)
//   element 25 = Keywords           (Tags, comma-separated)
//   element 28 = Caption/Abstract   (Description)
//   element 80 = Byline             (Creator)
//   element 116= Copyright Notice   (Copyright)

import type { IconMetadata } from "./meta";

const MARKER = 0x1c;

/** IPTC-IIM dataset entries we write, in canonical order. */
interface IptcEntry {
  /** IPTC dataset number (1 = Envelope, 2 = Application). */
  dataset: number;
  /** IPTC element number within the dataset. */
  element: number;
  value: string;
}

/** The stock-relevant IPTC-IIM fields we write, mapped from IconMetadata. */
function entriesOf(meta: IconMetadata): IptcEntry[] {
  const entries: IptcEntry[] = [];
  if (meta.title !== "") entries.push({ dataset: 2, element: 5, value: meta.title });
  if (meta.description !== "")
    entries.push({ dataset: 2, element: 28, value: meta.description });
  if (meta.tags.length > 0)
    entries.push({ dataset: 2, element: 25, value: meta.tags.join(", ") });
  // Creator and Copyright are not part of IconMetadata (no model fields), so
  // they are written empty when absent — the record still exists so readers
  // see a well-formed IPTC block even with empty values.
  entries.push({ dataset: 2, element: 80, value: "" });
  entries.push({ dataset: 2, element: 116, value: "" });
  return entries;
}

/** Encode one IPTC-IIM dataset into bytes (canonical order: 1C dataset element size data). */
function encodeDataset(entry: IptcEntry): Uint8Array {
  const data = new TextEncoder().encode(entry.value);
  const out = new Uint8Array(5 + data.length);
  out[0] = MARKER;
  out[1] = entry.dataset;
  out[2] = entry.element;
  out[3] = (data.length >> 8) & 0xff;
  out[4] = data.length & 0xff;
  out.set(data, 5);
  return out;
}

/** Encode an IPTC-IIM record block (Application record, dataset 2). */
export function encodeIptcBlock(meta: IconMetadata): Uint8Array {
  const datasets = entriesOf(meta).map(encodeDataset);
  const total = datasets.reduce((sum, d) => sum + d.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const d of datasets) {
    out.set(d, at);
    at += d.length;
  }
  return out;
}

/** Decode an IPTC-IIM block back into IconMetadata fields. */
export function decodeIptcBlock(block: Uint8Array): Partial<IconMetadata> {
  const title: string[] = [];
  const description: string[] = [];
  const keywords: string[] = [];
  const creator: string[] = [];
  const copyright: string[] = [];
  let at = 0;
  while (at + 5 <= block.length) {
    const marker = block[at];
    const dataset = block[at + 1];
    const element = block[at + 2];
    if (marker !== MARKER) break; // not a valid dataset, stop
    const size = (block[at + 3] << 8) | block[at + 4];
    const end = at + 5 + size;
    if (end > block.length) break;
    const value = new TextDecoder().decode(block.slice(at + 5, end));
    if (dataset === 2) {
      switch (element) {
        case 5: title.push(value); break;
        case 28: description.push(value); break;
        case 25: keywords.push(...value.split(",").map((k) => k.trim()).filter((k) => k)); break;
        case 80: creator.push(value); break;
        case 116: copyright.push(value); break;
      }
    }
    at = end;
  }
  const out: Partial<IconMetadata> = {};
  if (title.length) out.title = title.join(" ");
  if (description.length) out.description = description.join(" ");
  if (keywords.length) out.tags = keywords;
  // Creator / Copyright are not search keywords — keep them out of tags, and
  // never append empty records (entriesOf writes empty 80/116 placeholders).
  const nonEmpty = (values: string[]) => values.filter((v) => v !== "");
  if (nonEmpty(creator).length) out.tags = [...(out.tags ?? []), ...nonEmpty(creator)];
  if (nonEmpty(copyright).length) out.tags = [...(out.tags ?? []), ...nonEmpty(copyright)];
  return out;
}

/** JPEG APP13 segment wrapper: "Photoshop 3.0\\0" + IPTC-IIM block. */
export function encodeIptcApp13(meta: IconMetadata): Uint8Array {
  const block = encodeIptcBlock(meta);
  const prefix = new TextEncoder().encode("Photoshop 3.0\0");
  const payload = new Uint8Array(prefix.length + block.length);
  payload.set(prefix, 0);
  payload.set(block, prefix.length);
  const segment = new Uint8Array(2 + 2 + payload.length);
  segment[0] = 0xff;
  segment[1] = 0xed; // APP13
  segment[2] = (payload.length + 2) >> 8;
  segment[3] = (payload.length + 2) & 0xff;
  segment.set(payload, 4);
  return segment;
}

/** Extract the IPTC-IIM block from a JPEG APP13 segment, or null. */
function extractIptcFromApp13(data: Uint8Array): Uint8Array | null {
  const prefix = new TextEncoder().encode("Photoshop 3.0\0");
  if (data.length < prefix.length) return null;
  if (!prefix.every((b, i) => data[i] === b)) return null;
  return data.slice(prefix.length);
}

/** Read IPTC-IIM metadata from a JPEG byte array (APP13 segment scan). */
export function readIptcFromJpeg(jpeg: Uint8Array): Partial<IconMetadata> | null {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null;
  let at = 2;
  while (at + 4 <= jpeg.length) {
    if (jpeg[at] !== 0xff) break;
    const marker = jpeg[at + 1];
    if (marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    const length = (jpeg[at + 2] << 8) | jpeg[at + 3];
    const end = at + 2 + length;
    if (end > jpeg.length) break;
    if (marker === 0xed) {
      const block = extractIptcFromApp13(jpeg.slice(at + 4, end));
      if (block !== null) return decodeIptcBlock(block);
    }
    at = end;
  }
  return null;
}

/** Hex-encode bytes for embedding in an EPS comment block. */
function hexEncode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

/** Embed IPTC-IIM as a hex-encoded EPS comment block (canonical begin/end block, newline-terminated). */
export function embedIptcInEps(eps: string, meta: IconMetadata): string {
  const block = encodeIptcBlock(meta);
  const hex = hexEncode(block);
  const chunks: string[] = [];
  for (let i = 0; i < hex.length; i += 200) chunks.push(hex.slice(i, i + 200));
  const comment = [`% IconSplitterIPTC begin`, ...chunks, "% IconSplitterIPTC end", ""].join("\n");
  const lines = eps.split(/(?:\r\n|\r|\n)/);
  const insertAt = lines.findIndex((l) => /^%%EndComments\b/.test(l));
  const target = insertAt >= 0 ? insertAt : lines.length;
  lines.splice(target, 0, comment);
  return lines.join("\n");
}

/** Read IPTC-IIM metadata from an EPS text document (hex block between begin/end comment lines). */
export function readIptcFromEps(eps: string): Partial<IconMetadata> | null {
  const lines = eps.split(/(?:\r\n|\r|\n)/);
  for (let i = 0; i < lines.length; i++) {
    if (!/^% IconSplitterIPTC begin$/.test(lines[i])) continue;
    const endAt = lines.findIndex((line, j) => j > i && /^% IconSplitterIPTC end$/.test(line));
    if (endAt < 0) continue;
    const hex = lines.slice(i + 1, endAt).join("");
    if (hex.length % 2 !== 0) continue;
    const bytes = new Uint8Array(hex.length / 2);
    for (let k = 0; k < bytes.length; k++) bytes[k] = parseInt(hex.slice(k * 2, k * 2 + 2), 16);
    return decodeIptcBlock(bytes);
  }
  return null;
}

/** Whether an EPS comment block carries an IPTC-IIM record. */
export function hasIptcInEps(eps: string): boolean {
  return /^% IconSplitterIPTC begin/m.test(eps);
}
