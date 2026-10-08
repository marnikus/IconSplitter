// embed.ts — embedding accepted metadata into the export SVG copy
// (design §4.3): <title>, <desc> and a Dublin Core <metadata> RDF block as
// the FIRST children of the root. Idempotent (re-embedding replaces, never
// duplicates), XML-escaped by the DOM, and read back for verification.
// Reads are namespace-agnostic (localName matching) so the readback is
// deterministic across parsers. The RDF and DC prefixes are declared ONCE, on
// the root (2026-10-08, stock review): a serializer re-declares an undeclared
// prefix on every element that uses it, which is what the reviewer flagged.

import type { IconMetadata } from "./meta";

const SVG_NS = "http://www.w3.org/2000/svg";
const RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const DC_NS = "http://purl.org/dc/elements/1.1/";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";
const EMBED_TAGS = ["title", "desc", "metadata"];

/** The export SVG with the metadata embedded (the input string is untouched). */
export function embedMetadataInSvg(svgText: string, meta: IconMetadata): string {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  if (root === null || name(root) !== "svg") throw new Error("not an SVG document");
  for (const child of Array.from(root.children)) {
    if (EMBED_TAGS.includes(name(child))) root.removeChild(child);
  }
  const title = doc.createElementNS(SVG_NS, "title");
  title.textContent = meta.title;
  const desc = doc.createElementNS(SVG_NS, "desc");
  desc.textContent = meta.description;
  declareOnRoot(root);
  root.insertBefore(metadataElement(doc, meta), root.firstChild);
  root.insertBefore(desc, root.firstChild);
  root.insertBefore(title, root.firstChild);
  return new XMLSerializer().serializeToString(doc);
}

/** The embedded metadata read back; null when any field is missing. */
export function readEmbeddedMetadata(svgText: string): IconMetadata | null {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  if (root === null || name(root) !== "svg") return null;
  const title = directChildText(root, "title");
  const description = directChildText(root, "desc");
  const metadata = directChild(root, "metadata");
  if (title === null || description === null || metadata === null) return null;
  const tags = descendants(metadata, "li")
    .map((el) => (el.textContent ?? "").trim())
    .filter((t) => t !== "");
  if (tags.length === 0) return null;
  return { title, description, tags };
}

/** The two vocabularies the block uses, declared once where every serializer finds them in scope. */
function declareOnRoot(root: Element): void {
  root.setAttributeNS(XMLNS_NS, "xmlns:rdf", RDF_NS);
  root.setAttributeNS(XMLNS_NS, "xmlns:dc", DC_NS);
}

/** The Dublin Core RDF block: dc:title, dc:description, dc:subject (rdf:Bag). */
function metadataElement(doc: Document, meta: IconMetadata): Element {
  const metadata = doc.createElementNS(SVG_NS, "metadata");
  const rdf = doc.createElementNS(RDF_NS, "rdf:RDF");
  const description = doc.createElementNS(RDF_NS, "rdf:Description");
  const title = doc.createElementNS(DC_NS, "dc:title");
  title.textContent = meta.title;
  const desc = doc.createElementNS(DC_NS, "dc:description");
  desc.textContent = meta.description;
  const subject = doc.createElementNS(DC_NS, "dc:subject");
  const bag = doc.createElementNS(RDF_NS, "rdf:Bag");
  for (const tag of meta.tags) {
    const li = doc.createElementNS(RDF_NS, "rdf:li");
    li.textContent = tag;
    bag.appendChild(li);
  }
  subject.appendChild(bag);
  description.append(title, desc, subject);
  rdf.appendChild(description);
  metadata.appendChild(rdf);
  return metadata;
}

function directChild(root: Element, tag: string): Element | null {
  for (const child of Array.from(root.children)) {
    if (name(child) === tag) return child;
  }
  return null;
}

function directChildText(root: Element, tag: string): string | null {
  const text = directChild(root, tag)?.textContent?.trim() ?? "";
  return text === "" ? null : text;
}

function descendants(el: Element, localName: string): Element[] {
  return Array.from(el.getElementsByTagName("*")).filter((d) => localNameOf(d) === localName);
}

function localNameOf(el: Element): string {
  const at = el.nodeName.indexOf(":");
  return at >= 0 ? el.nodeName.slice(at + 1) : el.nodeName;
}

function name(el: Element): string {
  return el.nodeName.toLowerCase();
}
