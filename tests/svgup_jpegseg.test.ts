// svgup_jpegseg.test.ts — metadata inside a JPEG (design §11/§12, research 4).
// Browsers write no XMP and no IPTC, so the tab does the byte surgery itself:
// an APP1 XMP packet (dc:title / dc:description / dc:subject) and an APP13
// Photoshop IRB carrying IPTC-IIM (2:05 object name, 2:120 caption, 2:25
// keywords). The cases below are the promises: the image data is untouched, the
// values are readable back, a mismatch is REPORTED (never papered over), a file
// that is not a JPEG is refused instead of corrupted, and re-running the insert
// replaces rather than stacks duplicate segments.
import { describe, expect, it } from "vitest";
import {
  buildIptc, buildXmp, insertMetadata, isJpeg, jpegDimensions, readMetadata, scanSegments, verifyMetadata,
} from "../src/lib/svgupload/jpegseg";

const META = {
  title: "The Vector Icon of Focus and Clarity. Sharp Clean Lines.",
  description: "A minimal square icon for interfaces, labels, buttons and print.",
  tags: ["icon", "pictogram", "vector", "ünicode"],
};

/** A small but structurally real JPEG: SOI, JFIF APP0, SOS, entropy, EOI. */
function jpegFixture(width = 24, height = 24, extra: number[] = []): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  const sos = [0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00];
  const entropy = [0x12, 0x34, 0x56, 0x78, 0x9a];
  const eoi = [0xff, 0xd9];
  return new Uint8Array([0xff, 0xd8, ...app0, ...extra, ...sof0, ...sos, ...entropy, ...eoi]);
}

const bytesOf = (u: Uint8Array): number[] => [...u];

describe("the format gate", () => {
  it("recognises a JPEG by its SOI and refuses anything else", () => {
    expect(isJpeg(jpegFixture())).toBe(true);
    expect(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false); // PNG
    expect(isJpeg(new Uint8Array())).toBe(false);
    expect(insertMetadata(new Uint8Array([1, 2, 3]), META)).toEqual({ ok: false, reason: "The file is not a JPEG (no SOI marker)." });
  });

  it("reads the dimensions from the frame header", () => {
    expect(jpegDimensions(jpegFixture(3886, 3886))).toEqual({ width: 3886, height: 3886 });
    expect(jpegDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
  });
});

describe("segment scanning", () => {
  it("walks the headers and stops at the start of scan", () => {
    const segments = scanSegments(jpegFixture());
    expect(segments.map((s) => s.marker)).toEqual([0xe0, 0xc0]); // APP0, SOF0 — SOS is the end
  });
});

describe("insertMetadata", () => {
  it("inserts APP1 (XMP) and APP13 (IPTC) before the frame headers", () => {
    const out = insertMetadata(jpegFixture(), META);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const markers = scanSegments(out.bytes).map((s) => s.marker);
    expect(markers).toContain(0xe1); // APP1 — XMP
    expect(markers).toContain(0xed); // APP13 — IPTC
    expect(markers.indexOf(0xc0)).toBeGreaterThan(markers.indexOf(0xed)); // still a valid order
  });

  it("leaves the image data byte-for-byte untouched", () => {
    const src = jpegFixture(64, 64);
    const out = insertMetadata(src, META);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // the entropy bytes and the EOI are the tail of the file, unchanged
    expect(bytesOf(out.bytes.slice(-7))).toEqual(bytesOf(src.slice(-7)));
    // and the original headers are still present in order
    const text = [...out.bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(text).toContain("ffd8ffe0"); // SOI + APP0 first, as JFIF wants
  });

  it("replaces its own segments instead of stacking duplicates", () => {
    const once = insertMetadata(jpegFixture(), META);
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    const twice = insertMetadata(once.bytes, { ...META, title: "Second Title Sentence Here. Sharp Lines." });
    expect(twice.ok).toBe(true);
    if (!twice.ok) return;
    const app1 = scanSegments(twice.bytes).filter((s) => s.marker === 0xe1);
    const app13 = scanSegments(twice.bytes).filter((s) => s.marker === 0xed);
    expect(app1).toHaveLength(1);
    expect(app13).toHaveLength(1);
    expect(readMetadata(twice.bytes)?.title).toBe("Second Title Sentence Here. Sharp Lines.");
  });

  it("keeps a foreign APP1 (EXIF) instead of destroying it", () => {
    const exif = [0xff, 0xe1, 0x00, 0x0a, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x00, 0x00];
    const out = insertMetadata(jpegFixture(24, 24, exif), META);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(scanSegments(out.bytes).filter((s) => s.marker === 0xe1)).toHaveLength(2); // EXIF + XMP
  });
});

describe("readMetadata / verifyMetadata", () => {
  it("reads back everything it wrote, Unicode included", () => {
    const out = insertMetadata(jpegFixture(), META);
    if (!out.ok) throw new Error(out.reason);
    const read = readMetadata(out.bytes);
    expect(read?.title).toBe(META.title);
    expect(read?.description).toBe(META.description);
    expect(read?.tags).toEqual(META.tags);
  });

  it("verifies equal values and reports a mismatch instead of accepting it", () => {
    const out = insertMetadata(jpegFixture(), META);
    if (!out.ok) throw new Error(out.reason);
    expect(verifyMetadata(out.bytes, META)).toEqual({ ok: true, errors: [] });
    const wrong = verifyMetadata(out.bytes, { ...META, title: "Something Else Entirely Here. Sharp Lines." });
    expect(wrong.ok).toBe(false);
    expect(wrong.errors.join(" ")).toContain("title");
  });

  it("reports a missing packet rather than pretending it verified", () => {
    const plain = jpegFixture();
    expect(readMetadata(plain)).toBeNull();
    const check = verifyMetadata(plain, META);
    expect(check.ok).toBe(false);
    expect(check.errors.length).toBeGreaterThan(0);
  });

  it("survives a title with the five XML characters and non-ASCII text", () => {
    const meta = { title: "Fish & Chips <Bars> \"Quoted\" — 道. Sharp Lines.", description: META.description, tags: ["icon", "bündig"] };
    const out = insertMetadata(jpegFixture(), meta);
    if (!out.ok) throw new Error(out.reason);
    expect(readMetadata(out.bytes)).toEqual(meta);
  });
});

describe("the two containers agree", () => {
  it("writes the same values into IPTC as into XMP", () => {
    const iptc = buildIptc(META);
    const text = new TextDecoder("utf-8", { fatal: false }).decode(iptc);
    expect(text).toContain(META.title);
    expect(text).toContain(META.description);
    for (const tag of META.tags) expect(text).toContain(tag);
  });

  it("marks the XMP packet with the Adobe identifier a reader looks for", () => {
    const xmp = new TextDecoder().decode(buildXmp(META));
    expect(xmp.startsWith("http://ns.adobe.com/xap/1.0/\u0000")).toBe(true);
    expect(xmp).toContain("<dc:subject>");
  });

  it("keeps tags in their given order, which is the answer's ranking", () => {
    const out = insertMetadata(jpegFixture(), META);
    if (!out.ok) throw new Error(out.reason);
    expect(readMetadata(out.bytes)?.tags).toEqual(META.tags);
  });
});
