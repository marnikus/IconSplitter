// up_verify.test.ts — R06: the verification gate is semantic. A JPEG whose
// XMP/IPTC packets merely EXIST must not pass: every field is compared with the
// accepted metadata, in both the SVG and the JPEG, and the failure names the
// field that differs. Deleting the comparison fails these tests.
import { describe, expect, it } from "vitest";
import { embedSvgMetadata } from "../src/lib/upprepare";
import { embedJpegMetadata } from "../src/lib/upjpegmeta";
import { iptcIimRecord, xmpPacket } from "../src/lib/upmetaxml";
import { verifyMetadata } from "../src/lib/upverify";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upmeta";
import { fakeJpeg } from "./helpers/fakejpeg";

const META: IconMetadata = {
  title: "Forward Motion and Growth. The Vector Icon of Speed",
  description: "Arrow symbolising fast upward movement and success",
  tags: [...MANDATORY_TAGS, ...Array.from({ length: 33 }, (_, i) => `concept-${i}`)],
};

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><path d="M 0 0 L 10 10"/></svg>`;

function embedded(meta: IconMetadata): { svg: string; jpeg: Uint8Array } {
  const svg = embedSvgMetadata(SVG, meta) as string;
  const jpeg = embedJpegMetadata(fakeJpeg(64, 64), { xmp: xmpPacket(meta), iptc: iptcIimRecord(meta) }) as Uint8Array;
  return { svg, jpeg };
}

describe("the artifact metadata gate (R06)", () => {
  it("passes when every field reads back equal in the SVG and the JPEG", () => {
    const a = embedded(META);
    expect(verifyMetadata(a.svg, a.jpeg, META)).toEqual({ ok: true });
  });

  it("fails when the SVG carries a different description", () => {
    const a = embedded({ ...META, description: "A different description with enough words here" });
    const result = verifyMetadata(a.svg, a.jpeg, META);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toContain("SVG");
  });

  it("fails when a JPEG packet exists but carries other values", () => {
    const a = embedded({ ...META, title: "Other Words Entirely Here. Two More Words" });
    const result = verifyMetadata(a.svg, a.jpeg, META);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toContain("JPEG");
  });

  it("fails when a JPEG has no metadata packets at all", () => {
    const a = embedded(META);
    const bare = fakeJpeg(64, 64);
    const result = verifyMetadata(a.svg, bare, META);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toHaveLength(2); // XMP and IPTC both missing
  });
});
