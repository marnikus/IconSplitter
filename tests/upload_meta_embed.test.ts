// upload_meta_embed.test.ts — the files must carry what the record claims
// (RULE 8/15). The SVG is parsed by the real XML parser; the JPEG is built as
// real JPEG segment bytes (SOI, SOF0, SOS, EOI) so the write/read pair under
// test is the same one the export runs on the encoded output.
import { describe, expect, it } from "vitest";
import { embedJpegMetadata, jpegInfo, jpegMetadataMatches, readJpegMetadata, xmpPacket } from "../src/lib/jpegmeta";
import { embedSvgMetadata, readSvgMetadata, svgMetadataMatches, XML_PROLOG } from "../src/lib/svgmeta";
import { REQUIRED_TAGS, TAG_COUNT, type MetadataRecord } from "../src/lib/uploadmeta";

const record: MetadataRecord = {
  title: "Momentum Expressed Through Directional Flow. Speed and progress.",
  description: "Arrow shaped symbol expressing forward momentum and purposeful direction.",
  tags: [...REQUIRED_TAGS, ...Array.from({ length: TAG_COUNT - REQUIRED_TAGS.length }, (_, i) => `tag-${i}`)],
};

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>old</title><path d="M0 0h4v4H0z" fill="#000"/></svg>';

/** A minimal but structurally real JPEG: SOI, APP0, SOF0 (3×2, 3 comps), SOS, EOI. */
function testJpeg(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, ...new TextEncoder().encode("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03, 0x03, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0,
    0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0x00,
    0x12, 0x34, 0x56,
    0xff, 0xd9,
  ]);
}

describe("svgmeta", () => {
  it("replaces the old title and adds desc + Dublin Core keywords", () => {
    const embedded = embedSvgMetadata(svg, record);
    expect(embedded.ok).toBe(true);
    expect(embedded.code.startsWith(XML_PROLOG)).toBe(true);
    expect(embedded.code).not.toContain("<title>old</title>");
    const back = readSvgMetadata(embedded.code);
    expect(back.title).toBe(record.title);
    expect(back.description).toBe(record.description);
    expect(back.keywords).toHaveLength(TAG_COUNT);
    expect(back.keywords[0]).toBe("icon");
    expect(svgMetadataMatches(embedded.code, record)).toBe(true);
  });

  it("keeps unicode intact and escapes markup instead of injecting it", () => {
    const tricky: MetadataRecord = {
      ...record,
      title: 'Sürükleyici Yön İfadesi. Hız ve ilerleme.',
      description: 'Etiket <script>alert("x")</script> metni düz metin olarak kalır burada.',
    };
    const embedded = embedSvgMetadata(svg, tricky);
    const back = readSvgMetadata(embedded.code);
    expect(back.title).toBe(tricky.title);
    expect(back.description).toBe(tricky.description);
    expect(embedded.code).not.toContain("<script>");
    expect(embedded.code).toContain("&lt;script&gt;");
  });

  it("is idempotent: embedding twice leaves one title, one desc, one metadata block", () => {
    const once = embedSvgMetadata(svg, record).code;
    const twice = embedSvgMetadata(once, record).code;
    expect(twice.match(/<title>/g)).toHaveLength(1);
    expect(twice.match(/<desc>/g)).toHaveLength(1);
    expect(twice.match(/<metadata>/g)).toHaveLength(1);
    expect(svgMetadataMatches(twice, record)).toBe(true);
  });

  it("refuses a document it cannot parse", () => {
    expect(embedSvgMetadata("<svg><", record)).toMatchObject({ ok: false, code: "" });
    expect(readSvgMetadata("<svg><").keywords).toEqual([]);
  });
});

describe("jpegmeta", () => {
  it("reads the frame header of the JPEG it is given", () => {
    expect(jpegInfo(testJpeg())).toMatchObject({ width: 3, height: 2, components: 3, hasXmp: false, hasIptc: false });
    expect(jpegInfo(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("embeds XMP in APP1 and IPTC in APP13 and reads both back", () => {
    const before = testJpeg();
    const embedded = embedJpegMetadata(before, record);
    expect(embedded.ok).toBe(true);
    const info = jpegInfo(embedded.bytes);
    expect(info).toMatchObject({ width: 3, height: 2, hasXmp: true, hasIptc: true });
    const back = readJpegMetadata(embedded.bytes);
    expect(back.title).toBe(record.title);
    expect(back.description).toBe(record.description);
    expect(back.keywords).toEqual(record.tags);
    expect(jpegMetadataMatches(embedded.bytes, record)).toBe(true);
  });

  it("survives a second embed by replacing, not stacking, its own segments", () => {
    const once = embedJpegMetadata(testJpeg(), record).bytes;
    const twice = embedJpegMetadata(once, { ...record, title: "Second Title For The Same File" }).bytes;
    expect(countSegments(twice, 0xe1)).toBe(1);
    expect(countSegments(twice, 0xed)).toBe(1);
    expect(readJpegMetadata(twice).title).toBe("Second Title For The Same File");
    expect(jpegInfo(twice)).toMatchObject({ width: 3, height: 2 });
  });

  it("keeps the scan data and the end marker of the original file", () => {
    const embedded = embedJpegMetadata(testJpeg(), record).bytes;
    expect([...embedded.subarray(-5)]).toEqual([0x12, 0x34, 0x56, 0xff, 0xd9]);
  });

  it("carries unicode through the IPTC stream", () => {
    const unicode = { ...record, title: "Hız ve İlerleme Kavramı. Yön ve akış." };
    const embedded = embedJpegMetadata(testJpeg(), unicode).bytes;
    expect(readJpegMetadata(embedded).title).toBe(unicode.title);
  });

  it("refuses bytes that are not a JPEG", () => {
    expect(embedJpegMetadata(new Uint8Array([0, 1, 2]), record)).toMatchObject({ ok: false, error: "not a readable JPEG" });
  });

  it("writes a well-formed XMP packet", () => {
    const doc = new DOMParser().parseFromString(xmpPacket(record).replace(/<\?xpacket[^>]*\?>/g, ""), "application/xml");
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(doc.getElementsByTagName("dc:subject")[0].getElementsByTagName("rdf:li")).toHaveLength(TAG_COUNT);
  });

  it("reports an empty read for a JPEG with no metadata at all", () => {
    expect(readJpegMetadata(testJpeg())).toEqual({ title: "", description: "", keywords: [] });
  });
});

function countSegments(bytes: Uint8Array, marker: number): number {
  let count = 0;
  for (let pos = 2; pos + 4 <= bytes.length && bytes[pos] === 0xff; ) {
    const m = bytes[pos + 1];
    if (m === marker) count += 1;
    if (m === 0xda) break;
    const length = (bytes[pos + 2] << 8) | bytes[pos + 3];
    pos += 2 + length;
  }
  return count;
}
