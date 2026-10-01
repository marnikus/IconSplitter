// RULE 8 — naming runs for real: every parser/formatter below executes.
// Deleting or inverting any of them fails here.
import { describe, expect, it } from "vitest";
import {
  baseOfAi,
  batchFolder,
  dirCandidates,
  isAiFile,
  monthFolder,
  pad2,
  parseAiFile,
  referenceNameFor,
  splitCandidates,
  splitDirName,
  splitFileName,
  statusJsonName,
  stemOf,
} from "../../src/batch/naming";

describe("parseAiFile — _AI / _AI_<n> shapes", () => {
  it("parses a plain _AI image", () => {
    expect(parseAiFile("icon-award-ribbon_AI.png")).toEqual({
      base: "icon-award-ribbon",
      variant: null,
      ext: "png",
      stem: "icon-award-ribbon_AI",
    });
  });

  it("parses a numbered _AI_<n> variant", () => {
    expect(parseAiFile("icon-award-ribbon_AI_7.png")).toMatchObject({
      base: "icon-award-ribbon",
      variant: 7,
      ext: "png",
    });
  });

  it("rejects the reference image and non-AI names", () => {
    expect(parseAiFile("icon-award-ribbon.png")).toBeNull();
    expect(parseAiFile("icon-award-ribbon_AI_x.png")).toBeNull();
    expect(parseAiFile("icon-award-ribbon_ai.png")).toBeNull();
    expect(parseAiFile("_AI.png")).toBeNull();
    expect(parseAiFile("noext_AI")).toBeNull();
  });

  it("keeps dots in the base and strips one trailing _AI", () => {
    expect(parseAiFile("my.icon_AI.png")).toMatchObject({ base: "my.icon" });
    expect(parseAiFile("x_AI_AI.png")).toMatchObject({ base: "x_AI", variant: null });
    expect(parseAiFile("a_AI_007.jpg")).toMatchObject({ base: "a", variant: 7, ext: "jpg" });
  });
});

describe("isAiFile / baseOfAi / referenceNameFor / statusJsonName", () => {
  it("flags AI files only", () => {
    expect(isAiFile("a_AI.png")).toBe(true);
    expect(isAiFile("a_AI_3.png")).toBe(true);
    expect(isAiFile("a.png")).toBe(false);
  });

  it("returns the base or null", () => {
    expect(baseOfAi("a_AI_3.png")).toBe("a");
    expect(baseOfAi("a.png")).toBeNull();
  });

  it("derives the same-extension reference name", () => {
    expect(referenceNameFor("icon_AI_7.png")).toBe("icon.png");
    expect(referenceNameFor("icon.png")).toBeNull();
  });

  it("names the status file after the reference base", () => {
    expect(statusJsonName("icon-award-ribbon")).toBe("icon-award-ribbon.json");
  });

  it("strips the extension for parent-folder names", () => {
    expect(stemOf("icon_AI.png")).toBe("icon_AI");
    expect(stemOf("my.icon_AI_7.jpg")).toBe("my.icon_AI_7");
    expect(stemOf("noext")).toBe("noext");
  });
});

describe("pad2 / monthFolder / batchFolder", () => {
  it("pads to two digits without truncating", () => {
    expect(pad2(1)).toBe("01");
    expect(pad2(12)).toBe("12");
    expect(pad2(100)).toBe("100");
  });

  it("formats month and batch folders in local time", () => {
    const d = new Date(2026, 8, 30, 14, 32, 8);
    expect(monthFolder(d)).toBe("2026-09");
    expect(batchFolder(d)).toBe("2026-09-30_14-32-08");
  });
});

describe("split dir / file names", () => {
  it("numbers split folders", () => {
    expect(splitDirName(1)).toBe("split_01");
    expect(splitDirName(12)).toBe("split_12");
  });

  it("names split files from the parent plus split number", () => {
    expect(splitFileName("icon-award-ribbon_AI", 1)).toBe("icon-award-ribbon_AI_01.png");
    expect(splitFileName("icon-award-ribbon_AI_7", 2)).toBe("icon-award-ribbon_AI_7_02.png");
  });
});

describe("never-overwrite candidates", () => {
  it("lists directory candidates with _vNN suffixes", () => {
    expect(dirCandidates("icon-award-ribbon_AI", "_v", 3)).toEqual([
      "icon-award-ribbon_AI",
      "icon-award-ribbon_AI_v02",
      "icon-award-ribbon_AI_v03",
    ]);
  });

  it("puts the variation before the split number, after source variants", () => {
    expect(splitCandidates("icon-award-ribbon_AI", 1, { ext: "png", prefix: "_v", tries: 3 })).toEqual([
      "icon-award-ribbon_AI_01.png",
      "icon-award-ribbon_AI_v02_01.png",
      "icon-award-ribbon_AI_v03_01.png",
    ]);
    expect(splitCandidates("icon_AI_7", 1, { ext: "png", prefix: "_v", tries: 2 })[1]).toBe(
      "icon_AI_7_v02_01.png",
    );
  });
});
