import { describe, expect, it } from "vitest";
import { buildIptc, readIptc, legacyMetadata } from "../src/lib/upload/iptc";
import { embedXmpMetadata, verifyJpeg } from "../src/lib/upload/jpeg";
import { readJpegIptc } from "../src/lib/upload/jpegiptc";
import { embedXmpMetadataInEps, verifyEpsMetadata } from "../src/lib/upload/epsmetadata";
import { readEpsIptc } from "../src/lib/upload/epsiptc";
import { verifyEpsDocument } from "../src/lib/upload/eps";
import { minimalJpeg } from "./helpers/minijpeg";

const META = { title: "Temporary community & growth test icon", description: "Temporary description with café, 日本語 and <text> for stock upload testing", tags: ["icon", "café", "日本語", "growth & community"] };
const EPS = "%!PS-Adobe-3.0 EPSF-3.0\n%%LanguageLevel: 3\n%%BoundingBox: 0 0 10 10\n%%EndComments\n0 0 moveto 10 10 lineto stroke\n%%EOF\n";

describe("stock-compatible file metadata", () => {
  it("writes real UTF-8 IIM datasets, not JSON or plain keyword comments", () => {
    const bytes = buildIptc(META);
    expect(Array.from(bytes.slice(0, 8))).toEqual([0x1c, 1, 90, 0, 3, 0x1b, 0x25, 0x47]);
    expect(readIptc(bytes)).toEqual(META);
    expect(readIptc(bytes.slice(0, -1))).toBeNull();
    expect(readIptc(new Uint8Array())).toBeNull();
  });
  it("keeps legacy UTF-8 byte limits without splitting Unicode or changing accepted fields", () => {
    const long = { title: "日本語".repeat(100), description: "é".repeat(1500), tags: ["🌈".repeat(30)] };
    const projected = legacyMetadata(long);
    expect(new TextEncoder().encode(projected.title).length).toBeLessThanOrEqual(256);
    expect(new TextEncoder().encode(projected.description).length).toBeLessThanOrEqual(2000);
    expect(new TextEncoder().encode(projected.tags[0]).length).toBeLessThanOrEqual(64);
    expect(readIptc(buildIptc(long))).toEqual(projected);
    expect(JSON.stringify(projected)).not.toContain("�");
    expect(long.title.length).toBe(300);
  });
  it("JPEG carries both XMP and Photoshop APP13 IPTC; replacement is idempotent", () => {
    const jpeg = minimalJpeg(40, 20);
    const out = embedXmpMetadata(jpeg, META);
    expect(readJpegIptc(out)).toEqual(META);
    expect(verifyJpeg(out, { width: 40, height: 20, metadata: META }).ok).toBe(true);
    expect(embedXmpMetadata(out, META)).toEqual(out);
    const edited = { ...META, title: "Updated temporary title" };
    const changed = embedXmpMetadata(out, edited);
    expect(readJpegIptc(changed)).toEqual(edited);
    expect(jpeg).toEqual(minimalJpeg(40, 20));
  });
  it("EPS carries a Photoshop IPTC resource without adding executable/raster data", () => {
    const out = embedXmpMetadataInEps(EPS, META);
    expect(out).toContain("%%BeginPhotoshop:");
    expect(readEpsIptc(out)).toEqual(META);
    expect(verifyEpsMetadata(out, META)).toBe(true);
    expect(verifyEpsDocument(out).ok).toBe(true);
    expect(embedXmpMetadataInEps(out, META)).toBe(out);
    expect(out).toContain("0 0 moveto 10 10 lineto stroke");
    const tampered = out.replace("% 3842494d", "% 3842494c");
    expect(verifyEpsMetadata(tampered, META)).toBe(false);
    expect(verifyEpsDocument(tampered).ok).toBe(false);
  });
});

// Header-level compatibility and safety: do not interpret the compressed scan.
import { jpegSegment, jpegSegments } from "../src/lib/upload/jpegmarkers";
import { bigEndian, joinBytes, readBigEndian, utf8 } from "../src/lib/upload/metadatabytes";
import { iptcResource, PHOTOSHOP_ID, readPhotoshopIptc } from "../src/lib/upload/photoshop";
import { embedIptcInJpeg } from "../src/lib/upload/jpegiptc";
import { readXmpMetadata } from "../src/lib/upload/jpeg";

describe("metadata carrier integrity", () => {
  it("preserves EXIF, ICC, unrelated APP13/Photoshop resources and entropy-coded scan bytes", () => {
    const otherResource = joinBytes(utf8("8BIM"), bigEndian(1005, 2), new Uint8Array([1, 65]), bigEndian(3, 4), new Uint8Array([1, 2, 3, 0]));
    const app13 = jpegSegment(237, joinBytes(utf8(PHOTOSHOP_ID), otherResource, iptcResource({ ...META, title: "Old" })));
    const exif = jpegSegment(225, utf8("Exif\0\0preserve"));
    const icc = jpegSegment(226, utf8("ICC_PROFILE\0preserve"));
    const notPhotoshop = jpegSegment(237, utf8("unrelated metadata"));
    const scan = new Uint8Array([255, 218, 0, 2, 255, 225, 255, 0, 11, 255, 217]);
    const input = joinBytes(minimalJpeg(20, 20).slice(0, -2), app13, exif, icc, notPhotoshop, scan);
    const out = embedXmpMetadata(input, META);
    expect(out.slice(-scan.length)).toEqual(scan);
    for (const raw of [exif, icc, notPhotoshop]) {
      expect(jpegSegments(out).some((s) => JSON.stringify(out.slice(s.start, s.end)) === JSON.stringify(raw))).toBe(true);
    }
    expect(jpegSegments(out).some((s) => s.marker === 237 && s.data.length === 14 + otherResource.length)).toBe(true);
    expect(readJpegIptc(out)).toEqual(META);
    expect(embedXmpMetadata(out, META)).toEqual(out);
  });
  it("retains unbounded accepted text in XMP with only compatibility copies shortened", () => {
    const long = { title: "日本語".repeat(100), description: "é".repeat(1500), tags: ["🌈".repeat(30)] };
    const jpeg = embedXmpMetadata(minimalJpeg(10, 10), long);
    expect(readXmpMetadata(jpeg)).toEqual(long);
    expect(readJpegIptc(jpeg)).toEqual(legacyMetadata(long));
    const eps = embedXmpMetadataInEps(EPS, long);
    expect(verifyEpsMetadata(eps, long)).toBe(true);
    expect(verifyEpsDocument(eps).ok).toBe(true);
  });
  it("rejects broken lengths, bad signatures, duplicates and overlarge JPEG metadata", () => {
    expect(() => jpegSegment(225, new Uint8Array(65534))).toThrow(/exceeds/);
    expect(() => embedXmpMetadata(minimalJpeg(10, 10), { ...META, description: "x".repeat(66000) })).toThrow(/exceeds/);
    expect(() => readBigEndian(new Uint8Array(), 0, 4)).toThrow(/truncated/);
    expect(readPhotoshopIptc(utf8("bad resource"))).toBeNull();
    expect(readPhotoshopIptc(iptcResource(META).slice(0, -1))).toBeNull();
    expect(readPhotoshopIptc(joinBytes(iptcResource(META), iptcResource(META)))).toBeNull();
    expect(readJpegIptc(new Uint8Array([0]))).toBeNull();
    expect(() => embedIptcInJpeg(new Uint8Array([0]), META)).toThrow();
    for (const broken of [new Uint8Array([255, 216, 255, 225, 0, 1]), new Uint8Array([255, 216, 255, 225, 255, 255])]) {
      expect(() => jpegSegments(broken)).toThrow();
    }
    const filled = joinBytes(new Uint8Array([255, 216, 255, 255, 1]), minimalJpeg(10, 10).slice(2));
    expect(jpegSegments(filled)[0].marker).toBe(1);
  });
  it.each(["\n", "\r\n", "\r"])("EPS carriers are idempotent and safe with line ending %j", (eol) => {
    const out = embedXmpMetadataInEps(EPS.replace(/\n/g, eol), META);
    expect(readEpsIptc(out)).toEqual(META);
    expect(embedXmpMetadataInEps(out, META)).toBe(out);
    expect(verifyEpsDocument(out).ok).toBe(true);
    expect(verifyEpsDocument(out.replace("% IconSplitter IPTC end", "0 0 1 1 image\n% IconSplitter IPTC end")).ok).toBe(false);
  });
  it("rejects unverified Photoshop opaque resources and malformed hex in EPS", () => {
    const out = embedXmpMetadataInEps(EPS, META);
    expect(readEpsIptc(out.replace("% 3842494d", "% z842494d"))).toBeNull();
    expect(verifyEpsDocument(EPS.replace("%%EndComments", "%%EndComments\n%%BeginPhotoshop: 6\n% 00\n%%EndPhotoshop")).ok).toBe(false);
    expect(verifyJpeg(minimalJpeg(10, 10), { width: 10, height: 10, metadata: META }).errors).toContain("IPTC metadata does not match the accepted fields");
  });
});
