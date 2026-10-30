// @vitest-environment node
// upload_paint_clash.test.ts — the export's stroke colour drawn on a background
// it cannot be seen on (2026-10-19 report: a black background with the black
// stroke colour previewed — and exported — a solid black square). RULE 8: the
// real contrast rule runs.
import { describe, expect, it } from "vitest";
import { paintClash } from "../src/lib/upload/paintclash";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";

const s = (background: string, strokeColor: string) => ({ ...DEFAULT_UPLOAD_SETTINGS, background, strokeColor });

describe("paintClash", () => {
  it("black strokes on a black (or near-black) background are named", () => {
    expect(paintClash(s("#000000", "#000000"))).toMatch(/#000000 strokes on a #000000 background/);
    expect(paintClash(s("#111111", "#000000"))).not.toBeNull();
    expect(paintClash(s("#ffffff", "#f8f8f8"))).not.toBeNull();
  });

  it("readable pairs, and anything that is not two known colours, say nothing", () => {
    expect(paintClash(s("#ffffff", "#000000"))).toBeNull();
    expect(paintClash(s("#000000", "#ffffff"))).toBeNull();
    expect(paintClash(s("#c22f2f", "#000000"))).toBeNull();
    expect(paintClash(s("transparent", "#000000"))).toBeNull();
    expect(paintClash(s("default", "#000000"))).toBeNull();
    expect(paintClash(s("#000000", "artwork"))).toBeNull();
  });
});
