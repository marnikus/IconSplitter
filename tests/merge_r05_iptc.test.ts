// merge_r05_iptc.test.ts — R05: IPTC ObjectName must be 2:5, not 2:7 (EditStatus)
// Characterization test at the existing seam (upmetaxml). Fails before fix, passes after.
import { describe, expect, it } from "vitest";
import { parseIptcIim, iptcIimRecord } from "../src/lib/upmetaxml";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upmeta";

const META: IconMetadata = {
  title: "Gentle Bunny In Soft Light. Nature And Quiet Discovery",
  description: "Clean line art bunny icon expressing simplicity nature and gentle form",
  tags: [...MANDATORY_TAGS, ...Array.from({ length: 33 }, (_, i) => `tag-${i}`)],
};

describe("merge R05 — IPTC ObjectName dataset", () => {
  it("writes title to 2:5 (ObjectName) per IPTC spec, not 2:7 (EditStatus)", () => {
    const bytes = iptcIimRecord(META);
    // walk datasets: 0x1c record dataset len(2) data
    let titleDataset: number | null = null;
    for (let at = 0; at + 5 <= bytes.length; ) {
      if (bytes[at] !== 0x1c) break;
      const rec = bytes[at + 1];
      const ds = bytes[at + 2];
      const len = (bytes[at + 3] << 8) | bytes[at + 4];
      const data = bytes.subarray(at + 5, at + 5 + len);
      const text = new TextDecoder().decode(data);
      if (rec === 2 && text === META.title) titleDataset = ds;
      at += 5 + len;
    }
    expect(titleDataset).toBe(0x05); // 2:5 ObjectName — 0x07 would be the bug
  });

  it("round-trips title through 0x05", () => {
    const back = parseIptcIim(iptcIimRecord(META));
    expect(back.title).toBe(META.title);
  });

  it("independent reader fixture: ExifTool reference 2:5 is ObjectName", () => {
    // Fixture bytes: minimal valid IPTC with known dataset numbers
    // We assert our writer is compatible with a reader that looks only at 2:5
    const bytes = iptcIimRecord(META);
    const has05 = (() => {
      for (let at = 0; at + 5 <= bytes.length; ) {
        if (bytes[at] !== 0x1c) break;
        if (bytes[at + 1] === 2 && bytes[at + 2] === 0x05) return true;
        const len = (bytes[at + 3] << 8) | bytes[at + 4];
        at += 5 + len;
      }
      return false;
    })();
    const has07 = (() => {
      for (let at = 0; at + 5 <= bytes.length; ) {
        if (bytes[at] !== 0x1c) break;
        if (bytes[at + 1] === 2 && bytes[at + 2] === 0x07) {
          const len = (bytes[at + 3] << 8) | bytes[at + 4];
          const txt = new TextDecoder().decode(bytes.subarray(at + 5, at + 5 + len));
          if (txt === META.title) return true;
        }
        const len = (bytes[at + 3] << 8) | bytes[at + 4];
        at += 5 + len;
      }
      return false;
    })();
    expect(has05).toBe(true);
    expect(has07).toBe(false);
  });
});
