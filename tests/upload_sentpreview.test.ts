// upload_sentpreview.test.ts — the rule that makes "the image sent is the image
// a human saw, for the icon it belongs to" checkable (design §2.4, RULE 15): a
// prepared preview carries the row's identity (id) AND the source file's
// fingerprint, so a preview can never be sent for another icon or for a file
// that changed after it was rendered. Plus the one caption and the bound.
import { describe, expect, it } from "vitest";
import {
  PREVIEW_LIMIT, PREVIEW_PX, capPreviews, previewBytes, previewCaption, previewFor,
  type SentPreview,
} from "../src/lib/upload/sentpreview";

/** A preview whose payload is `bytes` zero bytes (base64 length = ceil(n/3)*4). */
function previewOf(id: string, fingerprint: string, bytes = 3): SentPreview {
  const payload = "A".repeat(Math.ceil(bytes / 3) * 4);
  return { id, name: `${id.split("::").pop()}_AI.svg`, fingerprint, image: `data:image/jpeg;base64,${payload}` };
}

describe("a prepared preview is bound to exactly one icon", () => {
  it("resolves for the id it was rendered for, and never for another", () => {
    const p = previewOf("architecture::fog", "120:1000");
    expect(previewFor([p], "architecture::fog", "120:1000")).toBe(p);
    expect(previewFor([p], "architecture::arch", "120:1000")).toBeNull();
    expect(previewFor([], "architecture::fog", "120:1000")).toBeNull();
  });

  it("refuses to be sent when the source file changed after it was rendered", () => {
    const p = previewOf("architecture::fog", "120:1000");
    // a rescan (or an edit in the SVG tab) moved the fingerprint: re-render
    expect(previewFor([p], "architecture::fog", "140:2000")).toBeNull();
    expect(previewFor([p], "architecture::fog", "")).toBeNull();
  });

  it("keeps the first preview when two carry the same id", () => {
    const first = previewOf("architecture::fog", "120:1000");
    const second = previewOf("architecture::fog", "120:1000", 9);
    expect(previewFor([first, second], "architecture::fog", "120:1000")).toBe(first);
  });
});

describe("the preview strip is bounded and honest about it", () => {
  it("shows every preview up to the limit and counts the rest", () => {
    const many = Array.from({ length: PREVIEW_LIMIT }, (_, i) => previewOf(`d::i${i}`, "1:1"));
    expect(capPreviews(many)).toEqual({ shown: many, hidden: 0 });
    const over = [...many, previewOf("d::extra", "1:1")];
    const capped = capPreviews(over);
    expect(capped.shown).toHaveLength(PREVIEW_LIMIT);
    expect(capped.hidden).toBe(1);
    expect(capped.shown[0]).toBe(many[0]); // the first N, in the selection's order
  });

  it("counts the real payload bytes of a data URL", () => {
    expect(previewBytes("data:image/jpeg;base64,QUJD")).toBe(3); // "ABC"
    expect(previewBytes("data:image/jpeg;base64,QUJDRA==")).toBe(4); // "ABCD"
    expect(previewBytes("not-a-data-url")).toBe(0);
  });

  it("names the file and the exact format in the caption", () => {
    const caption = previewCaption(previewOf("architecture::court", "1:1", 3000));
    expect(caption).toContain("court_AI.svg");
    expect(caption).toContain("image/jpeg");
    expect(caption).toContain(`${PREVIEW_PX}×${PREVIEW_PX}`);
    expect(previewBytes(previewOf("d::x", "1:1", 3000).image)).toBe(3000);
    expect(caption).toContain("2.9 KB"); // 3000 bytes
  });
});
