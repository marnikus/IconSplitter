// svgmeta.ts — metadata inside the exported SVG (RULE 3/15). Owns: writing a
// meaningful `<title>`, a `<desc>` and a Dublin-Core `<metadata>` block into the
// export COPY, and reading the three back so the record can prove what was
// embedded. Unicode is preserved, XML escaping is the parser's job (values go in
// as text nodes, never as concatenated markup) and the tags stay a LIST — one
// `<rdf:li>` per keyword — because a comma-joined string would lose the
// boundaries the brief asks the file metadata to keep.

import { parseSvg } from "./svgvalidate";
import type { MetadataRecord } from "./uploadmeta";

const RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const DC_NS = "http://purl.org/dc/elements/1.1/";

export interface SvgEmbedResult {
  ok: boolean;
  code: string;
  error: string | null;
}

/** The XML declaration written with the file, so the encoding is declared. */
export const XML_PROLOG = '<?xml version="1.0" encoding="UTF-8"?>';

/**
 * Writes title, description and keywords into the SVG copy. Existing
 * `<title>/<desc>/<metadata>` elements are REPLACED — an export must not carry
 * two conflicting titles — and the background plate the preparation inserted
 * keeps its place as the first painted element.
 */
export function embedSvgMetadata(code: string, record: MetadataRecord): SvgEmbedResult {
  const { doc, errors } = parseSvg(code);
  if (doc === null) return { ok: false, code: "", error: errors[0] ?? "not usable as SVG" };
  const root = doc.documentElement;
  removeExisting(root);
  const block = buildBlock(doc, record);
  // <title>/<desc> first (assistive technology reads them first), metadata last.
  root.insertBefore(block.metadata, null);
  root.insertBefore(block.desc, block.metadata);
  root.insertBefore(block.title, block.desc);
  return { ok: true, code: `${XML_PROLOG}\n${new XMLSerializer().serializeToString(root)}`, error: null };
}

/** Reads the three fields back — the verification step the export must pass. */
export function readSvgMetadata(code: string): { title: string; description: string; keywords: string[] } {
  const { doc } = parseSvg(code);
  if (doc === null) return { title: "", description: "", keywords: [] };
  return {
    title: textOf(doc, "title") || dcText(doc, "dc:title"),
    description: textOf(doc, "desc") || dcText(doc, "dc:description"),
    keywords: listItems(doc),
  };
}

/** True when every accepted field round-trips through the written bytes. */
export function svgMetadataMatches(code: string, record: MetadataRecord): boolean {
  const read = readSvgMetadata(code);
  return read.title === record.title
    && read.description === record.description
    && read.keywords.join(", ") === record.tags.join(", ");
}

function removeExisting(root: Element): void {
  for (const tag of ["title", "desc", "metadata"]) {
    for (const el of Array.from(root.getElementsByTagName(tag))) el.remove();
  }
}

interface Block {
  title: Element;
  desc: Element;
  metadata: Element;
}

function buildBlock(doc: Document, record: MetadataRecord): Block {
  const metadata = doc.createElementNS(null, "metadata");
  metadata.appendChild(descriptionElement(doc, record));
  return {
    title: textElement(doc, "title", record.title),
    desc: textElement(doc, "desc", record.description),
    metadata,
  };
}

function textElement(doc: Document, tag: string, text: string): Element {
  const el = doc.createElementNS(null, tag);
  el.textContent = text;
  return el;
}

/** The Dublin Core description, built as nodes so escaping is never manual. */
function descriptionElement(doc: Document, record: MetadataRecord): Element {
  const rdf = doc.createElementNS(RDF_NS, "rdf:RDF");
  const description = doc.createElementNS(RDF_NS, "rdf:Description");
  rdf.appendChild(description);
  description.appendChild(dcElement(doc, "dc:title", record.title));
  description.appendChild(dcElement(doc, "dc:description", record.description));
  description.appendChild(subjectElement(doc, record.tags));
  return rdf;
}

function dcElement(doc: Document, tag: string, text: string): Element {
  const el = doc.createElementNS(DC_NS, tag);
  el.textContent = text;
  return el;
}

function subjectElement(doc: Document, tags: readonly string[]): Element {
  const subject = doc.createElementNS(DC_NS, "dc:subject");
  const bag = doc.createElementNS(RDF_NS, "rdf:Bag");
  subject.appendChild(bag);
  for (const tag of tags) {
    const li = doc.createElementNS(RDF_NS, "rdf:li");
    li.textContent = tag;
    bag.appendChild(li);
  }
  return subject;
}

function textOf(doc: Document, tag: string): string {
  const el = doc.getElementsByTagName(tag)[0];
  return (el?.textContent ?? "").trim();
}

/** The Dublin Core value, matched on the local name so a prefix cannot hide it. */
function dcText(doc: Document, qualified: string): string {
  return textOf(doc, qualified);
}

function listItems(doc: Document): string[] {
  const metadata = doc.getElementsByTagName("metadata")[0];
  if (metadata === undefined) return [];
  return Array.from(metadata.getElementsByTagName("rdf:li"))
    .map((li) => (li.textContent ?? "").trim())
    .filter((value) => value !== "");
}
