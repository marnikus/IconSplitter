// mime.ts — the metadata text an exported icon carries, in both containers
// (design §11/§12). Why one module: the SAME accepted values must appear as SVG
// `<title>`/`<desc>`/`<metadata>` and as JPEG XMP/IPTC, must survive XML escaping
// and Unicode untouched, and must be readable back for the "reopen and verify"
// step. The escaping rule lives here once, and the readback is deliberately
// tolerant (it reads what a renderer wrote, not only what we wrote).

export interface MetaText {
  title: string;
  description: string;
  tags: string[];
}

/** XML-safe text with Unicode preserved: only the five characters change. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** The inverse of escapeXml, in the order that cannot double-unescape. */
export function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * The two namespace declarations the packet's prefixes need. They are ALSO
 * declared on the export root when metadata is embedded: an XML parser that
 * checks prefixes before it descends (SVGO's, among others) refuses a document
 * whose prefixes are bound only on an inner element.
 */
export const XMP_NS = [
  { prefix: "rdf", uri: "http://www.w3.org/1999/02/22-rdf-syntax-ns#" },
  { prefix: "dc", uri: "http://purl.org/dc/elements/1.1/" },
] as const;

/** dc:subject / dc:title / dc:description in one XMP packet (Adobe layout). */
export function xmpPacket(meta: MetaText): string {
  return [
    "<metadata>",
    "<rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\">",
    "<rdf:Description>",
    `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(meta.title)}</rdf:li></rdf:Alt></dc:title>`,
    `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(meta.description)}</rdf:li></rdf:Alt></dc:description>`,
    `<dc:subject><rdf:Bag>${meta.tags.map((t) => `<rdf:li>${escapeXml(t)}</rdf:li>`).join("")}</rdf:Bag></dc:subject>`,
    "</rdf:Description>",
    "</rdf:RDF>",
    "</metadata>",
  ].join("");
}

/** The blocks an SVG document carries, in the order SVG expects them. */
export function svgMetadataBlocks(meta: MetaText): string {
  return `<title>${escapeXml(meta.title)}</title><desc>${escapeXml(meta.description)}</desc>${xmpPacket(meta)}`;
}

/**
 * Removes the stamp this module writes, so re-stamping REPLACES the previous
 * text instead of nesting a second title/desc/metadata triple into the file
 * (which would also make the readback ambiguous — it reads the first title).
 * Only our own contiguous triple is matched, so an author's own `<title>` after
 * the stamp survives untouched.
 */
export function withoutMetadata(svg: string): string {
  return svg.replace(STAMP_RE, "");
}

const STAMP_RE = /<title>[\s\S]*?<\/title>\s*<desc>[\s\S]*?<\/desc>\s*<metadata>[\s\S]*?<rdf:RDF[\s\S]*?<\/metadata>/;

/** Inserts the blocks right after the root open tag (before all artwork). */
export function withMetadata(svg: string, meta: MetaText | null): string {
  if (meta === null) return svg;
  const at = rootOpenEnd(svg);
  if (at < 0) return svg;
  return svg.slice(0, at) + svgMetadataBlocks(meta) + svg.slice(at);
}

/** Index just after the root `<svg …>` tag, or -1 when there is no root. */
export function rootOpenEnd(svg: string): number {
  const at = svg.indexOf("<svg");
  if (at < 0) return -1;
  const end = svg.indexOf(">", at);
  return end < 0 ? -1 : end + 1;
}

/**
 * Reads the metadata back out of a document — the verification half. It accepts
 * what a renderer may have written (attribute order, extra rdf nodes) instead of
 * comparing strings, because the question is "did the values survive?", not
 * "are the bytes the ones I produced?".
 */
export function readMetadata(svg: string): MetaText | null {
  const title = firstTag(svg, "title");
  const desc = firstTag(svg, "desc");
  const tags = subjectTags(svg);
  if (title === null && desc === null && tags === null) return null;
  return { title: title ?? "", description: desc ?? "", tags: tags ?? [] };
}

/** Exact value comparison, order included: dc:subject is an ordered list. */
export function metadataEquals(a: MetaText | null, b: MetaText | null): boolean {
  if (a === null || b === null) return a === b;
  return a.title === b.title && a.description === b.description && sameTags(a.tags, b.tags);
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, i) => tag === b[i]);
}

function firstTag(svg: string, name: string): string | null {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(svg);
  return m === null ? null : unescapeXml(m[1]);
}

/** Every `<rdf:li>` inside a `dc:subject` block, in document order. */
function subjectTags(svg: string): string[] | null {
  const block = /<dc:subject>([\s\S]*?)<\/dc:subject>/.exec(svg);
  if (block === null) return null;
  return [...block[1].matchAll(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/g)].map((m) => unescapeXml(m[1]));
}
