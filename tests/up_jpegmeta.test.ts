// up_jpegmeta.test.ts — the JPEG segment surgery executes for real (RULE 8):
// embedding XMP (APP1) + IPTC (APP13) after the existing header segments
// without touching the entropy-coded pixels, reading them back, parsing
// dimensions from SOF, and refusing corrupt input. Deleting the module fails
// every assertion here.
import { describe, expect, it } from "vitest";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upmeta";
import { iptcIimRecord, parseIptcIim, xmpPacket, xmpReadFields } from "../src/lib/upmetaxml";
import { embedJpegMetadata, jpegDimensions, readJpegMetadata } from "../src/lib/upjpegmeta";

const META: IconMetadata = {
  title: "Forward Motion and Growth. The Vector Icon of Speed",
  description: "Arrow symbolising fast upward movement and success",
  tags: [...MANDATORY_TAGS, ...Array.from({ length: 33 }, (_, i) => `concept-${i}`)],
};

/** A minimal honest JPEG: SOI, APP0 JFIF, one DQT, SOS, entropy bytes, EOI. */
function fakeJpeg(withApp0 = true): Uint8Array {
  const parts: number[] = [0xff, 0xd8];
  if (withApp0) parts.push(...segment(0xe0, ascii("JFIF\0" + "\0".repeat(9))));
  parts.push(...segment(0xdb, new Uint8Array(67))); // a DQT-shaped segment
  parts.push(0xff, 0xda, 0x00, 0x08, 0x01, 0x00, 0x00, 0x3f, 0x00); // SOS header
  parts.push(0x12, 0x34, 0x56, 0x78); // "entropy-coded" bytes
  parts.push(0xff, 0xd9);
  return new Uint8Array(parts);
}

function segment(marker: number, payload: number[] | Uint8Array): number[] {
  const data = [...payload];
  const len = data.length + 2;
  return [0xff, marker, (len >> 8) & 0xff, len & 0xff, ...data];
}

function ascii(s: string): number[] {
  return [...s].map((c) => c.charCodeAt(0));
}

describe("upjpegmeta — embedding", () => {
  it("inserts APP1 XMP and APP13 IPTC after the existing header, pixels untouched", () => {
    const src = fakeJpeg();
    const out = embedJpegMetadata(src, { xmp: xmpPacket(META), iptc: iptcIimRecord(META) });
    expect(out).not.toBeNull();
    const bytes = out as Uint8Array;
    expect(bytes[0]).toBe(0xff); expect(bytes[1]).toBe(0xd8);            // SOI kept first
    expect(bytes[2]).toBe(0xff); expect(bytes[3]).toBe(0xe0);            // APP0 kept before ours
    expect(bytes.indexOf(0xe1, 4)).toBeGreaterThan(3);                   // our APP1 exists
    const entropyAt = findMarker(bytes, 0xda);
    const tail = bytes.slice(entropyAt);
    expect([...tail.slice(-6)]).toEqual([0x12, 0x34, 0x56, 0x78, 0xff, 0xd9]); // pixels + EOI intact
  });

  it("round-trips: what was embedded is exactly what reads back", () => {
    const out = embedJpegMetadata(fakeJpeg(), { xmp: xmpPacket(META), iptc: iptcIimRecord(META) }) as Uint8Array;
    const back = readJpegMetadata(out);
    expect(back.xmp).not.toBeNull();
    expect(back.iptc).not.toBeNull();
    expect(xmpReadFields(back.xmp as string)).toMatchObject({ title: META.title, description: META.description });
    const iim = parseIptcIim(back.iptc as Uint8Array);
    expect(iim.title).toBe(META.title);
    expect(iim.keywords).toEqual(META.tags);
  });

  it("refuses bytes that are not a JPEG and payloads that cannot fit a segment", () => {
    expect(embedJpegMetadata(new Uint8Array([1, 2, 3]), { xmp: "<x/>", iptc: new Uint8Array() })).toBeNull();
    const huge = "x".repeat(70000);
    expect(embedJpegMetadata(fakeJpeg(), { xmp: huge, iptc: iptcIimRecord(META) })).toBeNull();
  });

  it("reads nothing out of a JPEG without metadata, honestly", () => {
    const back = readJpegMetadata(fakeJpeg());
    expect(back.xmp).toBeNull();
    expect(back.iptc).toBeNull();
  });

  it("keeps embedding idempotent (no duplicated segments on re-embed)", () => {
    const once = embedJpegMetadata(fakeJpeg(), { xmp: xmpPacket(META), iptc: iptcIimRecord(META) }) as Uint8Array;
    const twice = embedJpegMetadata(once, { xmp: xmpPacket(META), iptc: iptcIimRecord(META) }) as Uint8Array;
    const app1 = countMarker(twice, 0xe1);
    expect(app1).toBe(1);
  });
});

describe("upjpegmeta — dimensions from SOF (prompt §7 verification)", () => {
  it("parses width and height from baseline and progressive JPEGs", () => {
    expect(jpegDimensions(fakeJpeg())).toBeNull(); // no SOF in the fake without one
    const sof = segment(0xc0, [8, 3886 >> 8, 3886 & 0xff, 3886 >> 8, 3886 & 0xff, 1, 1, 0x11, 0x00]);
    const withSof = new Uint8Array([0xff, 0xd8, ...sof, 0xff, 0xd9]);
    expect(jpegDimensions(withSof)).toEqual({ width: 3886, height: 3886 });
    const progressive = segment(0xc2, [8, 100 >> 8, 100 & 0xff, 200 >> 8, 200 & 0xff, 1, 1, 0x11, 0x00]);
    const withSof2 = new Uint8Array([0xff, 0xd8, ...progressive, 0xff, 0xd9]);
    expect(jpegDimensions(withSof2)).toEqual({ width: 200, height: 100 });
  });

  it("refuses truncated bytes", () => {
    expect(jpegDimensions(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(jpegDimensions(new Uint8Array(10))).toBeNull();
  });
});

function findMarker(bytes: Uint8Array, marker: number): number {
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === marker) return i;
  }
  return -1;
}

function countMarker(bytes: Uint8Array, marker: number): number {
  let n = 0;
  for (let i = 0; i < bytes.length - 1; i++) if (bytes[i] === 0xff && bytes[i + 1] === marker) n += 1;
  return n;
}
