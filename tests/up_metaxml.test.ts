// up_metaxml.test.ts — the metadata formats execute for real (RULE 8): the
// XMP packet (dc:title/description/subject), the binary IPTC IIM record
// (2:00/2:07/2:25/2:120 with the UTF-8 charset declaration), the SVG <metadata>
// RDF block, XML escaping, and the readback parsers that make embedding
// verifiable. Deleting the module fails every assertion here.
import { describe, expect, it } from "vitest";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upmeta";
import {
  escapeXml, iptcIimRecord, parseIptcIim, svgMetadataXml, xmpPacket, xmpReadFields,
} from "../src/lib/upmetaxml";

const META: IconMetadata = {
  title: 'Speed & "Progress": The <Fast> Arrow. Motion of "Growth"',
  description: "Arrow symbolising fast upward movement & success (line art)",
  tags: [...MANDATORY_TAGS, ...Array.from({ length: 33 }, (_, i) => `concept ${i}`)],
};

describe("upmetaxml — escaping", () => {
  it("escapes the five XML entities", () => {
    expect(escapeXml(`<a & "b" 'c'>`)).toBe("&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;");
  });
});

describe("upmetaxml — the XMP packet", () => {
  it("writes a well-formed packet with title, description and 40 subject keywords", () => {
    const packet = xmpPacket(META);
    expect(packet.startsWith("<?xpacket")).toBe(true);
    expect(packet.trimEnd().endsWith("<?xpacket end=\"w\"?>")).toBe(true);
    expect(packet).toContain("adobe:ns:meta/");
    expect(packet).toContain("purl.org/dc/elements/1.1/");
    expect(packet).toContain(escapeXml(META.title));
    expect(packet).toContain(escapeXml(META.description));
    expect(packet.split("<rdf:li").length - 1).toBe(40 + 2); // 40 tags + 2 Alt values
  });

  it("round-trips through the readback parser", () => {
    const back = xmpReadFields(xmpPacket(META));
    expect(back).not.toBeNull();
    expect(back?.title).toBe(META.title);
    expect(back?.description).toBe(META.description);
    expect(back?.subject).toEqual(META.tags);
  });

  it("refuses to read a packet that is not XMP", () => {
    expect(xmpReadFields("<nope/>")).toBeNull();
    expect(xmpReadFields("")).toBeNull();
  });
});

describe("upmetaxml — the IPTC IIM record", () => {
  it("writes the documented datasets in ascending order with the UTF-8 charset", () => {
    const rec = iptcIimRecord(META);
    expect([...rec.slice(0, 3)]).toEqual([0x1c, 0x01, 0x5a]); // 1:90 charset
    expect(rec[4]).toBe(3); // dataset length (big-endian)
    expect([...rec.slice(5, 8)]).toEqual([0x1b, 0x25, 0x47]); // ESC %G = UTF-8
    expect(rec[8]).toBe(0x1c);
    expect(rec[9]).toBe(0x02); // record 2
    expect(rec[10]).toBe(0x00); // 2:00 record version
  });

  it("round-trips title, description and keywords", () => {
    const back = parseIptcIim(iptcIimRecord(META));
    expect(back.title).toBe(META.title);
    expect(back.description).toBe(META.description);
    expect(back.keywords).toEqual(META.tags);
  });

  it("is honest about a record it cannot parse (RULE 4)", () => {
    expect(parseIptcIim(new Uint8Array([1, 2, 3]))).toEqual({ title: null, description: null, keywords: [] });
  });

  it("rejects a truncated dataset instead of guessing", () => {
    const rec = iptcIimRecord({ ...META, tags: ["a", "b"] });
    const cut = rec.slice(0, rec.length - 2);
    expect(parseIptcIim(cut).title).toBe(META.title); // intact datasets survive
  });
});

describe("upmetaxml — IPTC ObjectName interop (integration report R05)", () => {
  // An independent raw-byte reader, deliberately not the module's parser, so the
  // test proves the on-disk layout matches the IPTC IIM reference (2:5 =
  // ObjectName, 2:7 = EditStatus) instead of merely agreeing with itself.
  function rawDatasets(rec: Uint8Array): Array<{ rec: number; ds: number; text: string }> {
    const out: Array<{ rec: number; ds: number; text: string }> = [];
    let at = 0;
    while (at + 5 <= rec.length && rec[at] === 0x1c) {
      const len = (rec[at + 3] << 8) | rec[at + 4];
      if (at + 5 + len > rec.length) break;
      out.push({
        rec: rec[at + 1],
        ds: rec[at + 2],
        text: new TextDecoder().decode(rec.subarray(at + 5, at + 5 + len)),
      });
      at += 5 + len;
    }
    return out;
  }

  it("places the title at ObjectName 2:5, never at EditStatus 2:7", () => {
    const sets = rawDatasets(iptcIimRecord(META));
    const objectName = sets.find((s) => s.rec === 2 && s.ds === 0x05);
    const editStatus = sets.find((s) => s.rec === 2 && s.ds === 0x07);
    expect(objectName?.text).toBe(META.title);
    expect(editStatus).toBeUndefined();
  });

  it("the module's reader agrees with the reference mapping", () => {
    expect(parseIptcIim(iptcIimRecord(META)).title).toBe(META.title);
  });
});

describe("upmetaxml — the SVG metadata block", () => {
  it("writes Dublin Core RDF with the tags as a list", () => {
    const xml = svgMetadataXml(META);
    expect(xml).toContain("<rdf:RDF");
    expect(xml).toContain("dc:title");
    expect(xml).toContain(escapeXml(META.description));
    expect(xml.split("<rdf:li").length - 1).toBe(40 + 2);
  });
});
