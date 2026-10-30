// xmp.ts — the XMP packet shared by the SVG-to-upload image formats. Keeping
// the Dublin Core packet and its readback in one place makes EPS, like JPEG,
// carry dc:title, dc:description, and dc:subject with the same representation.

import { metadataRights } from "./rights";
import type { IconMetadata } from "./meta";

const RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const DC_NS = "http://purl.org/dc/elements/1.1/";

/** The XMP packet for metadata (Adobe XMP, rdf:Alt for text and rdf:Bag for tags). */
export function buildXmpPacket(meta: IconMetadata): string {
  const li = (text: string) => `<rdf:li xml:lang="x-default">${escapeXml(text)}</rdf:li>`;
  const tags = meta.tags.map((tag) => `<rdf:li>${escapeXml(tag)}</rdf:li>`).join("");
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="IconSplitter">
 <rdf:RDF xmlns:rdf="${RDF_NS}">
  <rdf:Description rdf:about="" xmlns:dc="${DC_NS}">
   <dc:title><rdf:Alt>${li(meta.title)}</rdf:Alt></dc:title>
   <dc:description><rdf:Alt>${li(meta.description)}</rdf:Alt></dc:description>
   <dc:subject><rdf:Bag>${tags}</rdf:Bag></dc:subject>${rightsXmp(meta)}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/** Parse accepted Dublin Core fields and any optional user identity. */
export function readXmpPacket(xml: string): IconMetadata | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror") !== null) return null;
  const title = xmpText(doc, "title");
  const description = xmpText(doc, "description");
  if (title === null || description === null) return null;
  const tags = xmpTags(doc);
  if (tags.length === 0) return null;
  return { title, description, tags, ...metadataRights({ creator: xmpText(doc, "creator") ?? undefined, copyright: xmpText(doc, "rights") ?? undefined }) };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    .filter((tag) => tag !== "");
}

function localNameOf(el: Element): string {
  const at = el.nodeName.indexOf(":");
  return at >= 0 ? el.nodeName.slice(at + 1) : el.nodeName;
}

/** Shared rights representation for XMP and SVG RDF, with full Unicode text. */
export function rightsXmp(meta: IconMetadata): string {
  const rights = metadataRights(meta);
  const creator = rights.creator ? `<dc:creator><rdf:Seq><rdf:li>${escapeXml(rights.creator)}</rdf:li></rdf:Seq></dc:creator>` : "";
  const copyright = rights.copyright ? `<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(rights.copyright)}</rdf:li></rdf:Alt></dc:rights>` : "";
  return creator + copyright;
}
