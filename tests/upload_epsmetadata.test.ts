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
    const dictionary = eps.match(/^(IconSplitterXmp_[a-f0-9]+) begin$/m)?.[1];
    const stream = eps.match(/^\[\/_objdef \{(IconSplitterStream_[a-f0-9]+)\} \/type \/stream \/OBJ pdfmark$/m)?.[1];
    expect(dictionary).toBeDefined();
    expect(stream).toBeDefined();
    expect(Array.from(eps.matchAll(new RegExp(`^${dictionary} begin$`, "gm")))).toHaveLength(2);
    expect(eps).toContain(`/Metadata {${stream}}`);
    expect(readXmpMetadataFromEps(eps)).toEqual(META);
    expect(verifyEpsMetadata(eps, META)).toBe(true);
    expect(verifyEpsDocument(eps).ok).toBe(true);
  });

  it("places metadata without explicit EndComments or Setup markers and uses the Trailer fallback", () => {
    const bareEps = [
      "%!PS-Adobe-3.0 EPSF-3.0",
      "%%Creator: a minimal converter",
      "%%LanguageLevel: 2",
      "%%BoundingBox: 0 0 70 70",
      "/paint { 0 0 moveto fill } def",
      "%%Trailer",
      "%%EOF",
    ].join("\n");
    const eps = embedXmpMetadataInEps(bareEps, META);
    const setupAt = eps.indexOf("% IconSplitter XMP setup begin");
    const artworkAt = eps.indexOf("/paint { 0 0 moveto fill } def");
    const emcAt = eps.indexOf("[/EMC pdfmark");
    const trailerAt = eps.indexOf("%%Trailer");
    expect(setupAt).toBeGreaterThan(eps.indexOf("%%BoundingBox"));
    expect(setupAt).toBeLessThan(artworkAt);
    expect(artworkAt).toBeLessThan(emcAt);
    expect(emcAt).toBeLessThan(trailerAt);
    expect(readXmpMetadataFromEps(eps)).toEqual(META);
  });

  it("fails closed for missing, truncated, or malformed XMP packets", () => {
    expect(readXmpMetadataFromEps("%!PS-Adobe-3.0 EPSF-3.0\n%%EOF\n")).toBeNull();
    expect(readXmpMetadataFromEps('<?xpacket begin="w"?><?xpacket end="w"')).toBeNull();
    expect(readXmpMetadataFromEps('<?xpacket begin="w"?>not xml<?xpacket end="w"?>')).toBeNull();
    expect(verifyEpsMetadata("%!PS-Adobe-3.0 EPSF-3.0\n%%EOF\n", META)).toBe(false);
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
