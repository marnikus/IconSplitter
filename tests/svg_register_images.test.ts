// svg_register_images.test.ts — Generate SVG: take the AI SOURCE images that are
// ALREADY in the folder into the pair's own image history (user request 2026-11-02).
// The folder usually holds just the pair's AI image, which the app already shows —
// so that pass does nothing and says so. When it holds more (an older AI image, a
// numbered regeneration the app never recorded, a copy), each becomes the version
// its name says and the newest NUMBERED one becomes the main image.
import { describe, expect, it } from "vitest";
import { imageSummary, planImageImport } from "../src/lib/imgimport";
import type { ImageVersion } from "../src/lib/svgimgreg";

/** The pair a split folder holds: its split AI stem and the name it had before. */
const SPLIT = { stem: "download-icon-01_AI_01", base: "download-icon-01" };
const PLAIN = { stem: "fog_AI", base: "fog" };

const at = (name: string, dir = "architecture") => ({ name, path: `${dir}/${name}` });

/** A history entry the app itself wrote: `<relDir>/AI source regeneration versions/<stem>_vN.png`. */
function regen(stem: string, version: number, dir = "architecture"): ImageVersion {
  return {
    version, file: `${dir}/AI source regeneration versions/${stem}_v${version}.png`,
    status: "done", prompt: "p", model: "m", requestId: null, error: null,
    updatedAt: "2026-10-20T09:00:00.000Z",
    usage: { input: 1, output: 2, total: 3 },
    cost: { actual: null, estimated: null, currency: "USD", pricing: "", basis: "none" },
  };
}

describe("which images belong to the pair", () => {
  it("registers nothing when the folder holds only the pair's own AI image", () => {
    const plan = planImageImport({ self: PLAIN, files: [at("fog.png"), at("fog_AI.png")], versions: [], siblings: [], skip: ["fog_AI.png", "fog.png"] });
    expect(plan.fresh).toEqual([]);
    expect(plan.named).toBeNull();
    expect(plan.others).toEqual([]);
  });

  it("takes the AI image a split pair had BEFORE the split as its own source", () => {
    // .../download-icon-01_AI/split_01/: download-icon-01_AI_01.png + download-icon-01_AI.png
    const files = [at("download-icon-01_AI_01.png", "split_01"), at("download-icon-01_AI.png", "split_01")];
    const plan = planImageImport({ self: SPLIT, files: files, versions: [], siblings: [], skip: ["download-icon-01_AI_01.png", "download-icon-01.png"] });
    expect(plan.fresh.map((f) => [f.name, f.version])).toEqual([["download-icon-01_AI.png", 1]]);
    // an unnumbered older image never silently replaces the image the pair shows
    expect(plan.named).toBeNull();
    expect(plan.latest).toBe(1);
  });

  it("numbers several files by their names and names the newest NUMBERED one", () => {
    const files = [at("fog_AI.png"), at("fog_AI_v3.png"), at("fog_AI_v2.png")];
    const plan = planImageImport({ self: PLAIN, files: files, versions: [], siblings: [], skip: ["fog_AI.png", "fog.png"] });
    expect(plan.fresh.map((f) => [f.name, f.version])).toEqual([
      ["fog_AI_v2.png", 2], ["fog_AI_v3.png", 3],
    ]);
    expect(plan.named).toBe(3);
    expect(plan.latest).toBe(3);
  });

  it("gives an unnumbered copy the next free number instead of dropping it", () => {
    const files = [at("fog_AI.png"), at("fog_AI_v2.png"), at("fog_AI-copy.png")];
    const plan = planImageImport({ self: PLAIN, files: files, versions: [], siblings: [], skip: ["fog_AI.png", "fog.png"] });
    expect(plan.fresh.map((f) => f.version)).toEqual([2, 3]);
    expect(plan.fresh[1].name).toBe("fog_AI-copy.png");
    expect(plan.named).toBe(2);
  });

  it("never re-adds a regeneration the pair file already records, and keeps counting from it", () => {
    const history = [regen("fog_AI", 2)];
    const files = [at("fog_AI_v2.png", "architecture/AI source regeneration versions"), at("fog_AI_v4.png", "architecture/AI source regeneration versions")];
    const plan = planImageImport({ self: PLAIN, files: files, versions: history, siblings: [], skip: ["fog_AI.png", "fog.png"] });
    expect(plan.known).toEqual(["fog_AI_v2.png"]);
    expect(plan.fresh.map((f) => [f.name, f.version])).toEqual([["fog_AI_v4.png", 4]]);
    expect(plan.named).toBe(4);
  });

  it("ignores the reference image, non-PNG files and another pair's artwork", () => {
    const files = [at("fog.png"), at("fog_AI.png"), at("fog_AI.svg"), at("court_AI.png")];
    const plan = planImageImport({ self: PLAIN, files: files, versions: [], siblings: [], skip: ["fog_AI.png", "fog.png"] });
    expect(plan.fresh).toEqual([]);
    expect(plan.others).toEqual([]);
  });

  it("refuses a name two pairs in one folder both answer to, and reports it", () => {
    const files = [at("fog_AI_02.png"), at("fog_AI.png")];
    const plan = planImageImport({
      self: { stem: "fog_AI_02", base: "fog" }, files, versions: [],
      siblings: [{ stem: "fog_AI_01", base: "fog" }], skip: ["fog_AI_02.png", "fog.png"],
    });
    expect(plan.fresh).toEqual([]);
    expect(plan.others).toEqual(["fog_AI.png"]);
  });
});

describe("what the pass says", () => {
  it("says which version is now the main image", () => {
    expect(imageSummary({ registered: 1, skipped: 0, folders: 1, shown: 3 }).text)
      .toBe("1 existing AI source registered — v3 is now the main image");
    expect(imageSummary({ registered: 2, skipped: 0, folders: 2, shown: 4 }).text)
      .toBe("2 existing AI sources registered — v4 is now the main image");
  });

  it("never claims the main image moved when only an unnumbered older file came in", () => {
    expect(imageSummary({ registered: 1, skipped: 0, folders: 1, shown: null }).text)
      .toBe("1 existing AI source registered — the main image did not change");
  });

  it("counts a file that is not a readable PNG and says it was skipped", () => {
    expect(imageSummary({ registered: 1, skipped: 2, folders: 1, shown: 2 }))
      .toEqual({ text: "1 existing AI source registered — v2 is now the main image · 2 skipped (not a readable PNG)", err: false });
    expect(imageSummary({ registered: 0, skipped: 1, folders: 1, shown: null }))
      .toEqual({ text: "1 PNG file found but none could be registered", err: true });
  });

  it("names the pair and the original when the folder holds nothing new", () => {
    expect(imageSummary({ registered: 0, skipped: 0, folders: 1, shown: null, stem: "fog_AI", original: "fog_AI.png" }).text)
      .toBe("No other AI source for fog_AI in 1 selected folder — the original fog_AI.png is already its image");
    expect(imageSummary({ registered: 0, skipped: 0, folders: 1, shown: null, stem: "fog_AI", original: "fog_AI.png", others: ["fog_AI_other.png"] }).text)
      .toBe("No other AI source for fog_AI in 1 selected folder — 1 other PNG there is not this pair's (e.g. fog_AI_other.png)");
    expect(imageSummary({ registered: 0, skipped: 0, folders: 3, shown: null }))
      .toEqual({ text: "No other AI source for this pair in 3 selected folders", err: false });
  });
});
