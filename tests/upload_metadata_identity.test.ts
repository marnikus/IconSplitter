import { describe, expect, it } from "vitest";
import { buildIptc, legacyMetadata, readIptc } from "../src/lib/upload/iptc";
import { embedXmpMetadata, readXmpMetadata, verifyJpeg } from "../src/lib/upload/jpeg";
import { embedXmpMetadataInEps, readXmpMetadataFromEps, verifiedEpsArtwork, verifyEpsMetadata } from "../src/lib/upload/epsmetadata";
import { readEpsIptc } from "../src/lib/upload/epsiptc";
import { buildXmpPacket } from "../src/lib/upload/xmp";
import { cleanMetadata } from "../src/lib/upload/meta";
import { readStockFile } from "./assets/SVG to JPEG or EPS export tests/reader.mjs";
import { minimalJpeg } from "./helpers/minijpeg";
import { STOCK_TEST_META } from "./helpers/stockexport";
const META = { ...STOCK_TEST_META, creator: "Author café 日本語", copyright: "© <Owner> & studio" };
const EPS = "%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 10 10\n%%EndComments\n0 0 moveto 10 10 lineto stroke\n%%EOF\n";
function records(bytes: Uint8Array) {
  const result = new Map<string, Uint8Array[]>();
  for (let at = 0; at < bytes.length;) {
    expect(bytes[at]).toBe(0x1c);
    const key = `${bytes[at + 1]}:${bytes[at + 2]}`;
    const size = bytes[at + 3] * 256 + bytes[at + 4];
    result.set(key, [...result.get(key) ?? [], bytes.slice(at + 5, at + 5 + size)]);
    at += 5 + size;
  }
  return result;
}
describe("identity fields are protocol-correct optional user claims", () => {
  it("uses raw IIM1:90 UTF8,2:80 By-line and2:116 CopyrightNotice, not custom text", () => {
    const fields = records(buildIptc(META));
    expect(Array.from(fields.get("1:90")![0])).toEqual([27, 37, 71]);
    expect(new TextDecoder().decode(fields.get("2:80")![0])).toBe(META.creator);
    expect(new TextDecoder().decode(fields.get("2:116")![0])).toBe(META.copyright);
    expect(records(buildIptc(STOCK_TEST_META)).has("2:80")).toBe(false);
    expect(records(buildIptc(STOCK_TEST_META)).has("2:116")).toBe(false);
  });
  it.each(["\n", "\r\n", "\r"])("keeps full Unicode XMP, limits legacy bytes and removes cleared fields (EOL=%j)", (eol) => {
    const meta = { ...META, creator: "日本語🌈".repeat(30), copyright: "🌈é".repeat(100) };
    const iim = records(buildIptc(meta));
    expect(iim.get("2:80")![0].length).toBeLessThanOrEqual(32);
    expect(iim.get("2:116")![0].length).toBeLessThanOrEqual(128);
    expect(readIptc(buildIptc(meta))).toEqual(legacyMetadata(meta));
    expect(JSON.stringify(readIptc(buildIptc(meta)))).not.toContain("�");
    const jpg = embedXmpMetadata(minimalJpeg(10, 10), meta);
    const eps = embedXmpMetadataInEps(EPS.replace(/\n/g, eol), meta);
    expect(readXmpMetadata(jpg)).toEqual(meta);
    expect(readXmpMetadataFromEps(eps)).toEqual(meta);
    expect(verifyEpsMetadata(eps, meta)).toBe(true);
    expect(embedXmpMetadataInEps(eps, meta)).toBe(eps);
    const cleared = cleanMetadata({ ...META, creator: " ", copyright: "" });
    expect(cleared).toEqual(STOCK_TEST_META);
    expect(readXmpMetadata(embedXmpMetadata(jpg, cleared))).toEqual(STOCK_TEST_META);
    expect(readEpsIptc(embedXmpMetadataInEps(eps, cleared))).toEqual(STOCK_TEST_META);
  });
  it("rejects stale or tampered identity and EPS resource XMP rather than claiming verification", () => {
    const jpeg = embedXmpMetadata(minimalJpeg(10, 10), META);
    expect(verifyJpeg(jpeg, { width: 10, height: 10, metadata: { ...META, creator: "Other author" } }).ok).toBe(false);
    const eps = embedXmpMetadataInEps(EPS, META);
    expect(verifyEpsMetadata(eps, { ...META, copyright: "Other rights" })).toBe(false);
    const hex = (value: string) => Buffer.from(value).toString("hex");
    const changed = eps.replace(/(^%%BeginPhotoshop:.*\n)([\s\S]*?)(^%%EndPhotoshop)/m, (_all, begin, body, end) => {
      const data = body.replace(/^%\s*/gm, "").replace(/\s/g, "");
      return `${begin}% ${data.replace(hex(">Author"), hex(">Tamper"))}\n${end}`;
    });
    expect(changed).not.toBe(eps);
    expect(readEpsIptc(changed)).toEqual(META); // only resource0424 changed, not IIM/document XMP
    expect(readXmpMetadataFromEps(changed)).toEqual(META);
    expect(verifyEpsMetadata(changed, META)).toBe(false);
    expect(() => verifiedEpsArtwork(changed)).toThrow("unverified EPS metadata envelope");
    expect(buildXmpPacket(META)).toContain("&lt;Owner&gt; &amp; studio");
  });
  it("the independent upload-page reader observes rights in BOTH JPEG and EPS", () => {
    for (const bytes of [embedXmpMetadata(minimalJpeg(10, 10), META), new TextEncoder().encode(embedXmpMetadataInEps(EPS, META))]) {
      expect(readStockFile(bytes).metadata).toEqual(META);
      expect(readStockFile(bytes).iptc).toEqual(META);
    }
  });
});
