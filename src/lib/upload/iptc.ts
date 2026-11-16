// IPTC-IIM compatibility copy: UTF-8, record version 4, Adobe resource 0x0404.
import { metadataRights, sameMetadata } from "./rights";
import type { IconMetadata } from "./meta";
import { bigEndian, decodeUtf8, joinBytes, readBigEndian, utf8, utf8Prefix } from "./metadatabytes";

/** IIM byte ceilings affect legacy mirrors, never accepted text or XMP. */
export function legacyMetadata(meta: IconMetadata): IconMetadata {
  return { title: utf8Prefix(meta.title, 256), description: utf8Prefix(meta.description, 2000), tags: meta.tags.map((t) => utf8Prefix(t, 64)), ...legacyRights(meta) };
}
export function buildIptc(meta: IconMetadata): Uint8Array {
  const legacy = legacyMetadata(meta);
  return joinBytes(
    dataset(1, 90, new Uint8Array([27, 37, 71])), dataset(2, 0, bigEndian(4, 2)),
    dataset(2, 5, utf8(utf8Prefix(meta.title, 64))), dataset(2, 105, utf8(legacy.title)),
    dataset(2, 120, utf8(legacy.description)), ...legacy.tags.map((t) => dataset(2, 25, utf8(t))),
    ...identityDatasets(legacy),
  );
}
function dataset(record: number, id: number, data: Uint8Array): Uint8Array {
  return joinBytes(new Uint8Array([28, record, id]), bigEndian(data.length, 2), data);
}
/** Strict readback of our UTF-8 compatibility records; broken is not empty. */
export function readIptc(bytes: Uint8Array): IconMetadata | null {
  try {
    const fields = iimFields(bytes);
    if (decodeUtf8(fields.get("1:90")?.[0] ?? new Uint8Array()) !== "\u001b%G") return null;
    const text = (id: number) => decodeUtf8(fields.get(`2:${id}`)?.[0] ?? new Uint8Array());
    const tags = (fields.get("2:25") ?? []).map(decodeUtf8);
    const title = text(105) || text(5);
    const description = text(120);
    return title && description && tags.length > 0 ? { title, description, tags, ...metadataRights({ creator: text(80), copyright: text(116) }) } : null;
  } catch { return null; }
}
function iimFields(bytes: Uint8Array): Map<string, Uint8Array[]> {
  const fields = new Map<string, Uint8Array[]>();
  let at = 0;
  while (at < bytes.length) {
    if (at + 5 > bytes.length || bytes[at] !== 28) throw new Error("invalid IIM dataset");
    const length = readBigEndian(bytes, at + 3, 2);
    if (length >= 32768 || at + 5 + length > bytes.length) throw new Error("invalid IIM length");
    const key = `${bytes[at + 1]}:${bytes[at + 2]}`;
    fields.set(key, [...(fields.get(key) ?? []), bytes.slice(at + 5, at + 5 + length)]);
    at += 5 + length;
  }
  return fields;
}
export function sameLegacyMetadata(actual: IconMetadata | null, expected: IconMetadata): boolean {
  return sameMetadata(actual, legacyMetadata(expected));
}

function legacyRights(meta: IconMetadata) {
  const rights = metadataRights(meta);
  return metadataRights({ creator: utf8Prefix(rights.creator ?? "", 32), copyright: utf8Prefix(rights.copyright ?? "", 128) });
}
function identityDatasets(meta: IconMetadata): Uint8Array[] {
  const records: Uint8Array[] = [];
  if (meta.creator) records.push(dataset(2, 80, utf8(meta.creator)));
  if (meta.copyright) records.push(dataset(2, 116, utf8(meta.copyright)));
  return records;
}
