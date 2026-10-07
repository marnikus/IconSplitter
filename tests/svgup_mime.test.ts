// svgup_mime.test.ts — the metadata text an exported file carries (design §11/§12).
// What must hold: Unicode survives, the five XML characters are escaped, the
// same values live in `<title>`, `<desc>` and the XMP packet, reading them back
// returns what was written, and a document without metadata reads as null rather
// than as empty strings a caller could mistake for consent.
import { describe, expect, it } from "vitest";
import {
  escapeXml, metadataEquals, readMetadata, svgMetadataBlocks, unescapeXml, withMetadata, xmpPacket,
} from "../src/lib/svgupload/mime";

const BASE = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M0 0h24v24H0z\"/></svg>";
const META = {
  title: "The Vector Icon of Focus and Clarity. Razor Sharp Lines.",
  description: "A minimal framed square with clean corners for interface and print use.",
  tags: ["icon", "pictogram", "vector", "ünicode", "hand-drawn"],
};

describe("escaping", () => {
  it("escapes exactly the five XML characters and keeps Unicode", () => {
    expect(escapeXml(`a & b < c > "d" 'e' — ü 道`)).toBe("a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos; — ü 道");
  });

  it("round-trips through unescape without double-unescaping", () => {
    const raw = "& < > \" ' &amp;";
    expect(unescapeXml(escapeXml(raw))).toBe(raw);
  });
});

describe("the XMP packet", () => {
  it("carries title, description and an ordered Bag of tags", () => {
    const packet = xmpPacket(META);
    expect(packet).toContain("<dc:title>");
    expect(packet).toContain("<dc:description>");
    expect(packet).toContain("<dc:subject><rdf:Bag>");
    expect(packet.indexOf("<rdf:li>icon</rdf:li>")).toBeLessThan(packet.indexOf("<rdf:li>pictogram</rdf:li>"));
    expect(packet).toContain("ünicode");
  });

  it("escapes a title that contains XML characters", () => {
    expect(xmpPacket({ ...META, title: "Fish & Chips <Bars>" })).toContain("Fish &amp; Chips &lt;Bars&gt;");
  });
});

describe("withMetadata", () => {
  it("inserts the blocks as the first children of the root", () => {
    const svg = withMetadata(BASE, META);
    const titleAt = svg.indexOf("<title>");
    const pathAt = svg.indexOf("<path");
    expect(titleAt).toBeGreaterThan(svg.indexOf("<svg"));
    expect(titleAt).toBeLessThan(pathAt);
    expect(svg).toContain("<desc>");
    expect(svg).toContain("<metadata>");
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("changes nothing when there is no metadata", () => {
    expect(withMetadata(BASE, null)).toBe(BASE);
    expect(withMetadata(BASE, null)).not.toContain("<title>");
  });

  it("keeps a prolog and existing attributes", () => {
    const svg = withMetadata(`<?xml version="1.0"?>${BASE}`, META);
    expect(svg.startsWith("<?xml")).toBe(true);
    expect(svg).toContain("viewBox=\"0 0 24 24\"");
  });
});

describe("readMetadata — the reopen-and-verify half", () => {
  it("reads back exactly what was written", () => {
    const read = readMetadata(withMetadata(BASE, META));
    expect(read).toEqual(META);
    expect(metadataEquals(read, META)).toBe(true);
  });

  it("reads a document a renderer reformatted (attribute order, extra nodes)", () => {
    const rewritten = `<svg xmlns="http://www.w3.org/2000/svg"><title>${META.title}</title>` +
      `<desc>${META.description}</desc><metadata><x:xmpmeta xmlns:dc="http://purl.org/dc/elements/1.1/">` +
      `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description>` +
      "<dc:subject><rdf:Bag>" +
      META.tags.map((t) => `<rdf:li>${t}</rdf:li>`).join("") +
      "</rdf:Bag></dc:subject></rdf:Description></rdf:RDF></x:xmpmeta></metadata><g/></svg>";
    const read = readMetadata(rewritten);
    expect(read?.tags).toEqual(META.tags);
    expect(metadataEquals(read, META)).toBe(true);
  });

  it("reports null for a document with no metadata at all", () => {
    expect(readMetadata(BASE)).toBeNull();
  });

  it("compares tag ORDER, because the order is part of the answer", () => {
    const swapped = { ...META, tags: [...META.tags].reverse() };
    expect(metadataEquals(swapped, META)).toBe(false);
  });

  it("survives a title with escaped characters through a write/read round trip", () => {
    const meta = { ...META, title: "Fish & Chips <Bars> \"quoted\"" };
    expect(readMetadata(withMetadata(BASE, meta))?.title).toBe(meta.title);
  });
});

describe("svgMetadataBlocks", () => {
  it("emits one title, one desc and one packet in that order", () => {
    const blocks = svgMetadataBlocks(META);
    expect(blocks.indexOf("<title>")).toBeLessThan(blocks.indexOf("<desc>"));
    expect(blocks.indexOf("<desc>")).toBeLessThan(blocks.indexOf("<metadata>"));
  });
});
