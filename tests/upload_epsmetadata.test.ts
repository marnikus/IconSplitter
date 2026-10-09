import { describe, expect, it } from "vitest";
import { verifyEpsDocument } from "../src/lib/upload/eps";
import { embedXmpMetadataInEps, readXmpMetadataFromEps, verifyEpsMetadata } from "../src/lib/upload/epsmetadata";
import type { IconMetadata } from "../src/lib/upload/meta";

const EPS = [
  "%!PS-Adobe-3.0 EPSF-3.0",
  "%%Creator: cairo",
  "%%LanguageLevel: 2",
  "%%BoundingBox: 0 0 70 70",
  "%%DocumentData: Clean7Bit",
  "%%EndComments",
  "%%BeginProlog",
  "%%EndProlog",
  "%%BeginSetup",
  "%%EndSetup",
  "%%Page: 1 1",
  "%%BeginPageSetup",
  "%%EndPageSetup",
  "0 0 moveto fill",
  "%%PageTrailer",
  "%%Trailer",
  "%%EOF",
  "",
].join("\r\n");

const META: IconMetadata = {
  title: "Planning & <growth> pathways",
  description: "Clear progress for teams building stronger communities",
  tags: ["icon", "vector", "growth & change", "<planning>"],
};

describe("EPS XMP metadata", () => {
  it("embeds a UTF-8 XMP packet before drawing and brackets the artwork with pdfmarks", () => {
    const eps = embedXmpMetadataInEps(EPS, META);
    const packetAt = eps.indexOf("<?xpacket begin=");
    const setupAt = eps.indexOf("%%EndPageSetup");
    const bdcAt = eps.indexOf("/BDC pdfmark");
    const drawingAt = eps.indexOf("0 0 moveto fill");
    const emcAt = eps.indexOf("[/EMC pdfmark");
    const pageTrailerAt = eps.indexOf("%%PageTrailer");
    expect(eps).toContain("%ADO_ContainsXMP: MainFirst");
    expect(eps).toContain("%%DocumentData: Clean8Bit");
    expect(eps).not.toContain("%%DocumentData: Clean7Bit");
    expect(packetAt).toBeGreaterThan(setupAt);
    expect(packetAt).toBeLessThan(bdcAt);
    expect(bdcAt).toBeLessThan(drawingAt);
    expect(drawingAt).toBeLessThan(emcAt);
    expect(emcAt).toBeLessThan(pageTrailerAt);
    expect(readXmpMetadataFromEps(eps)).toEqual(META);
    expect(verifyEpsMetadata(eps, META)).toBe(true);
    expect(verifyEpsDocument(eps).ok).toBe(true);
  });

  it("is idempotent and keeps the converter's drawing bytes", () => {
    const once = embedXmpMetadataInEps(EPS, META);
    const twice = embedXmpMetadataInEps(once, META);
    expect(twice).toBe(once);
    expect(twice.match(/<\?xpacket begin=/g)).toHaveLength(1);
    expect(twice.match(/\/BDC pdfmark/g)).toHaveLength(1);
    expect(twice.match(/\[\/EMC pdfmark/g)).toHaveLength(1);
    expect(twice).toContain("0 0 moveto fill");
  });

  it("reads the same accepted fields after updating an existing EPS packet", () => {
    const first = embedXmpMetadataInEps(EPS, META);
    const edited = { ...META, title: "Planning lasting community growth" };
    const second = embedXmpMetadataInEps(first, edited);
    expect(readXmpMetadataFromEps(second)).toEqual(edited);
    expect(second.match(/<\?xpacket begin=/g)).toHaveLength(1);
    expect(verifyEpsMetadata(second, edited)).toBe(true);
  });
});
