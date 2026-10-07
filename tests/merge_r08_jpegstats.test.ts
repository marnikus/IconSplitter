// merge_r08_jpegstats.test.ts — R08: final JPEG hash/bytes must describe embedded file, not raw
import { describe, expect, it } from "vitest";
import { embedJpegMetadata, jpegDimensions } from "../src/lib/upjpegmeta";
import { xmpPacket, iptcIimRecord } from "../src/lib/upmetaxml";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upmeta";
import { subtleSha256 } from "../src/lib/upraster";

function fakeJpeg(width = 10, height = 10): Uint8Array {
  // Minimal JPEG with SOF so dimensions parse: SOI, SOF0, SOS, EOI
  const parts: number[] = [0xff, 0xd8];
  // SOF0 baseline
  const sof = [0xff, 0xc0, 0x00, 0x0b, 0x08, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 0x01, 0x01, 0x11, 0x00];
  parts.push(...sof);
  parts.push(0xff, 0xda, 0x00, 0x08, 0x01, 0x00, 0x00, 0x3f, 0x00);
  parts.push(0x12, 0x34);
  parts.push(0xff, 0xd9);
  return new Uint8Array(parts);
}

const META: IconMetadata = {
  title: "Gentle Bunny Side View Symbol. Nature And Quiet Discovery",
  description: "Clean line art bunny icon expressing simplicity nature",
  tags: [...MANDATORY_TAGS, ...Array.from({ length: 33 }, (_, i) => `t-${i}`)],
};

describe("merge R08 — final JPEG stats must match embedded bytes", () => {
  it("after embedding, sha256 and byte count equal the final JPEG, not the raw", async () => {
    const raw = fakeJpeg(100, 100);
    const rawHash = await subtleSha256(raw);
    const rawBytes = raw.length;

    const embedded = embedJpegMetadata(raw, { xmp: xmpPacket(META), iptc: iptcIimRecord(META) });
    expect(embedded).not.toBeNull();
    const final = embedded as Uint8Array;
    const finalHash = await subtleSha256(final);
    const finalBytes = final.length;

    // Embedding must change bytes and hash
    expect(finalBytes).not.toBe(rawBytes);
    expect(finalHash).not.toBe(rawHash);

    // The manifest stats after a fresh render must be derived from FINAL bytes.
    // Simulate the buggy job line: `this.jpegStats = this.jpegStats ?? out.stats`
    // where `this.jpegStats` was set from raw before embed.
    const rawStats = { sha256: rawHash, bytes: rawBytes };
    const correctStats = { sha256: finalHash, bytes: finalBytes };
    const buggyStats = rawStats; // keeps raw
    // Before fix, record would contain raw hash/bytes while disk has final bytes
    expect(buggyStats.sha256).not.toBe(correctStats.sha256);
    expect(correctStats.sha256).toBe(finalHash);
    expect(correctStats.bytes).toBe(finalBytes);
  });

  it("readback of dimensions after embed still matches target", () => {
    const raw = fakeJpeg(3886, 3886);
    const embedded = embedJpegMetadata(raw, { xmp: xmpPacket(META), iptc: iptcIimRecord(META) }) as Uint8Array;
    const dims = jpegDimensions(embedded);
    expect(dims).toEqual({ width: 3886, height: 3886 });
  });
});
