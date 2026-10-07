// up_iptc.test.ts — R05: the IPTC IIM title dataset must be ObjectName 2:05,
// not EditStatus 2:07. The fixture below is written by hand (an independent
// reader's view of the spec), so a writer and its own parser agreeing on the
// wrong dataset can no longer pass: the test asserts the bytes the spec names
// AND that a foreign record's EditStatus never masquerades as the title.
import { describe, expect, it } from "vitest";
import { iptcIimRecord, parseIptcIim } from "../src/lib/upmetaxml";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upmeta";

const META: IconMetadata = {
  title: "Forward Motion and Growth. The Vector Icon of Speed",
  description: "Arrow symbolising fast upward movement and success",
  tags: [...MANDATORY_TAGS, ...Array.from({ length: 33 }, (_, i) => `concept-${i}`)],
};

/** dataset ids the IIM spec assigns (record 2): 5 ObjectName, 7 EditStatus, 25 Keywords, 120 Caption. */
const OBJECT_NAME = 0x05;
const EDIT_STATUS = 0x07;
const KEYWORDS = 0x19;
const CAPTION = 0x78;

interface Dataset {
  record: number;
  dataset: number;
  text: string;
}

/** Independent writer: builds a raw IIM record from the spec's layout. */
function iimBytes(sets: Dataset[]): Uint8Array {
  const encoded = sets.map((s) => new TextEncoder().encode(s.text));
  const total = sets.reduce((n, _s, i) => n + 5 + encoded[i].length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  sets.forEach((s, i) => {
    out[at] = 0x1c;
    out[at + 1] = s.record;
    out[at + 2] = s.dataset;
    out[at + 3] = (encoded[i].length >> 8) & 0xff;
    out[at + 4] = encoded[i].length & 0xff;
    out.set(encoded[i], at + 5);
    at += 5 + encoded[i].length;
  });
  return out;
}

/** Independent reader: walks the layout without sharing the module's collect(). */
function datasetsOf(bytes: Uint8Array): Dataset[] {
  const out: Dataset[] = [];
  let at = 0;
  while (at + 5 <= bytes.length && bytes[at] === 0x1c) {
    const len = (bytes[at + 3] << 8) | bytes[at + 4];
    const text = new TextDecoder().decode(bytes.subarray(at + 5, at + 5 + len));
    out.push({ record: bytes[at + 1], dataset: bytes[at + 2], text });
    at += 5 + len;
  }
  return out;
}

describe("IPTC IIM title mapping (R05)", () => {
  it("writes the title to ObjectName 2:05 and leaves EditStatus 2:07 empty", () => {
    const sets = datasetsOf(iptcIimRecord(META));
    const objectName = sets.find((s) => s.record === 2 && s.dataset === OBJECT_NAME);
    expect(objectName?.text).toBe(META.title);
    expect(sets.find((s) => s.record === 2 && s.dataset === EDIT_STATUS)).toBeUndefined();
  });

  it("declares UTF-8 once (1:90) and keeps version, keywords and caption datasets", () => {
    const sets = datasetsOf(iptcIimRecord(META));
    expect(sets[0]).toEqual({ record: 1, dataset: 0x5a, text: "\u001b%G" });
    expect(sets.find((s) => s.record === 2 && s.dataset === 0x00)?.text).toBe("\u0000\u0004");
    const keywords = sets.filter((s) => s.record === 2 && s.dataset === KEYWORDS);
    expect(keywords.map((k) => k.text)).toEqual(META.tags);
    expect(sets.find((s) => s.record === 2 && s.dataset === CAPTION)?.text).toBe(META.description);
  });

  it("reads a foreign record's ObjectName as the title, never its EditStatus", () => {
    const foreign = iimBytes([
      { record: 2, dataset: OBJECT_NAME, text: "Real Object Name" },
      { record: 2, dataset: EDIT_STATUS, text: "Editorial status text" },
      { record: 2, dataset: KEYWORDS, text: "alpha" },
      { record: 2, dataset: CAPTION, text: "A caption" },
    ]);
    expect(parseIptcIim(foreign)).toEqual({
      title: "Real Object Name",
      description: "A caption",
      keywords: ["alpha"],
    });
  });

  it("round-trips its own record (the write and the read use one mapping)", () => {
    const back = parseIptcIim(iptcIimRecord(META));
    expect(back.title).toBe(META.title);
    expect(back.description).toBe(META.description);
    expect(back.keywords).toEqual(META.tags);
  });

  it("stops at the first malformed dataset and keeps the intact part", () => {
    const good = iimBytes([{ record: 2, dataset: OBJECT_NAME, text: "Kept" }]);
    const damaged = new Uint8Array([...good, 0x1c, 2, OBJECT_NAME, 0x00, 0x40, 0x41]);
    const parsed = parseIptcIim(damaged);
    expect(parsed.title).toBe("Kept");
  });
});
