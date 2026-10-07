// RULE 8 — the JPEG metadata runs for real against byte fixtures: the XMP
// APP1 packet embeds after SOI (idempotently), reads back exactly (Unicode
// included), dimensions come from the SOF segment, and verifyJpeg checks
// SOI/EOI + decoded dimensions + XMP readback (design §2.6, RULE 15).
import { describe, expect, it } from "vitest";
import {
  buildXmpPacket,
  embedXmpMetadata,
  readJpegDimensions,
  readXmpMetadata,
  verifyJpeg,
} from "../src/lib/upload/jpeg";
import { type IconMetadata } from "../src/lib/upload/meta";

const TAGS = [
  "speed", "growth", "chart", "arrow", "business", "finance",
  "analytics", "data", "trend", "increase", "graph", "statistics",
];

const META: IconMetadata = {
  title: "Minimal line icon of growth. Speed and growth pictogram",
  description: "Clean line icon showing growth and rising business trends — ünïcode ✓",
  tags: TAGS,
};

/** A minimal baseline JPEG: SOI + SOF0 (1 component) + EOI. */
function minimalJpeg(width: number, height: number): Uint8Array {
  const sof = [
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x01, 0x01, 0x11, 0x00,
  ];
  return new Uint8Array([0xff, 0xd8, ...sof, 0xff, 0xd9]);
}

describe("readJpegDimensions — from the SOF segment itself", () => {
  it("reads width and height", () => {
    expect(readJpegDimensions(minimalJpeg(3886, 2160))).toEqual({ width: 3886, height: 2160 });
  });

  it("returns null without an SOF segment", () => {
    expect(readJpegDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
  });
});

describe("buildXmpPacket", () => {
  it("carries dc:title / dc:description / dc:subject with escaped text", () => {
    const packet = buildXmpPacket({ title: "A & B <t>", description: "d", tags: ["x", "y"] });
    expect(packet).toContain("dc:title");
    expect(packet).toContain("dc:description");
    expect(packet).toContain("dc:subject");
    expect(packet).toContain("A &amp; B &lt;t&gt;");
    expect(packet).toContain("<rdf:li>x</rdf:li>");
    expect(packet).toContain("<?xpacket");
  });
});

describe("embedXmpMetadata + readXmpMetadata — the APP1 round-trip", () => {
  it("embeds after SOI and reads back exactly (Unicode included)", () => {
    const jpeg = minimalJpeg(100, 50);
    const out = embedXmpMetadata(jpeg, META);
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
    expect(out[2]).toBe(0xff);
    expect(out[3]).toBe(0xe1); // APP1 right after SOI
    expect(readXmpMetadata(out)).toEqual(META);
  });

  it("keeps the SOF dimensions readable and the input untouched", () => {
    const jpeg = minimalJpeg(3886, 3886);
    const out = embedXmpMetadata(jpeg, META);
    expect(readJpegDimensions(out)).toEqual({ width: 3886, height: 3886 });
    expect(jpeg).toHaveLength(17); // the fixture itself unchanged
  });

  it("is idempotent: re-embedding replaces the packet, never duplicates", () => {
    const once = embedXmpMetadata(minimalJpeg(10, 10), META);
    const twice = embedXmpMetadata(once, META);
    expect(twice).toEqual(once);
    expect(readXmpMetadata(twice)).toEqual(META);
  });

  it("returns null when no XMP packet is present", () => {
    expect(readXmpMetadata(minimalJpeg(10, 10))).toBeNull();
  });
});

describe("verifyJpeg — SOI/EOI + decoded dimensions + XMP readback", () => {
  it("accepts a fully verified JPEG", () => {
    const out = embedXmpMetadata(minimalJpeg(3886, 3886), META);
    const v = verifyJpeg(out, { width: 3886, height: 3886, metadata: META });
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.width).toBe(3886);
    expect(v.height).toBe(3886);
  });

  it("rejects wrong dimensions, missing metadata and a broken frame", () => {
    const out = embedXmpMetadata(minimalJpeg(100, 100), META);
    expect(verifyJpeg(out, { width: 200, height: 100, metadata: META }).errors[0]).toContain("dimensions");
    expect(verifyJpeg(minimalJpeg(100, 100), { width: 100, height: 100, metadata: META }).errors[0]).toContain("XMP");
    const truncated = out.slice(0, out.length - 2);
    expect(verifyJpeg(truncated, { width: 100, height: 100, metadata: META }).errors).toContain("missing EOI marker");
  });

  it("rejects metadata that does not match the accepted fields", () => {
    const out = embedXmpMetadata(minimalJpeg(10, 10), META);
    const other = { ...META, title: "A different title entirely now. Speed growth pictogram" };
    expect(verifyJpeg(out, { width: 10, height: 10, metadata: other }).errors[0]).toContain("does not match");
  });
});
