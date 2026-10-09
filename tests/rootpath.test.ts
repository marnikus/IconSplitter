// rootpath.test.ts — RULE 2/9/13: the STRING rules of a Windows folder path and
// nothing else. What Explorer's "Copy as path" can hand over, how it is
// normalised, which leaf a path names, how segments join onto a captured path
// and how they trim back off it (I-63), and the one join a copy is made of:
// base + the folder the file lives in (I-56). The memory of which folder has
// which path lives in `lib/pathmemory` and is tested there.
import { describe, expect, it } from "vitest";
import {
  folderCopyText, isFolderPathText, joinSegments, normalizeRootPath, pathFromCopied,
  pathLeaf, pathSegments, trimSegments,
} from "../src/lib/rootpath";

const ROOT = "test_processing";
const FULL = "F:\\Stocks 2026\\icons testing\\single\\test_processing";

describe("normalizeRootPath", () => {
  it("strips the quotes Explorer's Copy-as-path adds and the trailing separator", () => {
    expect(normalizeRootPath(`  "${FULL}\\"  `)).toBe(FULL);
  });

  it("forgives a truncated paste (a lone leading quote)", () => {
    expect(normalizeRootPath('"F:\\icons')).toBe("F:\\icons");
  });

  it("turns forward slashes into backslashes and collapses the duplicates", () => {
    expect(normalizeRootPath("F:/Stocks 2026//icons")).toBe("F:\\Stocks 2026\\icons");
  });

  it("keeps a drive root joinable and an UNC share intact", () => {
    expect(normalizeRootPath("F:\\")).toBe("F:");
    expect(normalizeRootPath("\\\\server\\share\\icons\\")).toBe("\\\\server\\share\\icons");
  });

  it("returns an empty string for an empty or blank value", () => {
    expect(normalizeRootPath("")).toBe("");
    expect(normalizeRootPath("   ")).toBe("");
  });
});

describe("pathSegments — a path as the parts a derivation counts", () => {
  it("keeps the drive, and the whole UNC head, as the first segment", () => {
    expect(pathSegments("F:\\a\\b")).toEqual(["F:", "a", "b"]);
    expect(pathSegments("F:")).toEqual(["F:"]);
    expect(pathSegments("\\\\server\\share\\a")).toEqual(["\\\\server", "share", "a"]);
    expect(pathSegments("")).toEqual([]);
  });
});

describe("joinSegments — a captured path plus the segments resolve reported", () => {
  it("joins with the app's one separator and never doubles it", () => {
    expect(joinSegments(FULL, ["_split_output", "2026-10"])).toBe(`${FULL}\\_split_output\\2026-10`);
    expect(joinSegments(`${FULL}\\`, ["_split_output"])).toBe(`${FULL}\\_split_output`);
    expect(joinSegments(FULL, [])).toBe(FULL);
    expect(joinSegments(FULL, ["", "2026-10"])).toBe(`${FULL}\\2026-10`);
  });
});

describe("trimSegments — a captured path minus the segments up to the pick", () => {
  it("trims from the end, down to a drive or share root", () => {
    expect(trimSegments(`${FULL}\\_split_output\\2026-10`, 2)).toBe(FULL);
    expect(trimSegments("F:\\a", 1)).toBe("F:");
    expect(trimSegments("\\\\server\\share\\deep", 1)).toBe("\\\\server\\share");
  });

  it("answers '' rather than a path cut through its root — no proof, never a guess", () => {
    expect(trimSegments("F:\\a", 2)).toBe("");
    expect(trimSegments("F:\\a\\b", 5)).toBe("");
    expect(trimSegments("\\\\server\\share\\deep", 2)).toBe("");
    expect(trimSegments(FULL, 0)).toBe("");
    expect(trimSegments("", 1)).toBe("");
  });
});

describe("folderCopyText — base plus the folder the file lives in (I-56)", () => {
  // The user's report, verbatim: the file is
  // `…\2026-10-05_18-45-20\icon-bunny-face_AI_7\split_04\icon-bunny-face_AI_7_04_v2.svg`
  // and the copy must name `…\split_04`. The run folder one level up is NOT it.
  const RUN = "_split_output/2026-10/2026-10-05_18-45-20";
  const PIECE = `${RUN}/icon-bunny-face_AI_7/split_04`;
  const SHOWN_FOLDER = `${FULL}\\_split_output\\2026-10\\2026-10-05_18-45-20\\icon-bunny-face_AI_7\\split_04`;

  it("copies the folder of the file, never the run's folder", () => {
    for (const file of ["icon-bunny-face_AI_7_04_v2.svg", "icon-bunny-face_AI_7_04.svg", "icon-bunny-face_AI_7_04_AI.png"]) {
      expect(folderCopyText(FULL, `${PIECE}/${file}`)).toBe(SHOWN_FOLDER);
    }
    expect(folderCopyText(FULL, `${PIECE}/icon-bunny-face_AI_7_04.svg.json`)).toBe(SHOWN_FOLDER);
    expect(folderCopyText(FULL, `${PIECE}/icon-bunny-face_AI_7_04_v2.svg`))
      .not.toBe(`${FULL}\\_split_output\\2026-10\\2026-10-05_18-45-20`);
  });

  it("copies the containing folder for a source-tree item, never the file", () => {
    expect(folderCopyText(FULL, "Category-A/icon_AI.png")).toBe(`${FULL}\\Category-A`);
    expect(folderCopyText(FULL, "icon_AI.png")).toBe(FULL);
  });

  it("names the run folder only for a file that really sits in it", () => {
    expect(folderCopyText(FULL, `${RUN}/icon_AI_02.png`)).toBe(`${FULL}\\_split_output\\2026-10\\2026-10-05_18-45-20`);
  });

  it("keeps the whole folder chain, batch-looking or not", () => {
    expect(folderCopyText(FULL, "_split_output/2026-10/notes/icon_AI.png")).toBe(`${FULL}\\_split_output\\2026-10\\notes`);
    expect(folderCopyText(FULL, "_split_output/latest/icon_AI.png")).toBe(`${FULL}\\_split_output\\latest`);
  });

  it("never returns a file name", () => {
    const text = folderCopyText(FULL, "a/b/icon-airplane-landing.svg.json");
    expect(text.endsWith(".svg.json")).toBe(false);
    expect(text.endsWith("icon-airplane-landing")).toBe(false);
  });

  it("works from the folder's own name when that is all the caller has", () => {
    expect(folderCopyText(ROOT, "Category-A/icon_AI.png")).toBe(`${ROOT}\\Category-A`);
    expect(folderCopyText(ROOT, "_split_output/2026-10/2026-10-01_10-24-31/a_AI/split_01/a_01.png"))
      .toBe(`${ROOT}\\_split_output\\2026-10\\2026-10-01_10-24-31\\a_AI\\split_01`);
  });

  it("names the file's own folder whatever folder was picked as the root (I-56)", () => {
    const out = "F:\\Stocks 2026\\icons testing\\single\\test_processing_2\\_split_output";
    const deep = "icon-sheet_AI/split_02/icon-sheet_AI_02.png";
    expect(folderCopyText(out, `2026-10/2026-10-05_18-45-20/${deep}`))
      .toBe(`${out}\\2026-10\\2026-10-05_18-45-20\\icon-sheet_AI\\split_02`);
    expect(folderCopyText(`${out}\\2026-10`, `2026-10-05_18-45-20/${deep}`))
      .toBe(`${out}\\2026-10\\2026-10-05_18-45-20\\icon-sheet_AI\\split_02`);
    expect(folderCopyText(`${out}\\2026-10\\2026-10-05_18-45-20`, deep))
      .toBe(`${out}\\2026-10\\2026-10-05_18-45-20\\icon-sheet_AI\\split_02`);
    expect(folderCopyText(out, "notes/a_AI.png")).toBe(`${out}\\notes`);
  });

  it("keeps a batch-looking chain that is nested under a subfolder of the root", () => {
    expect(folderCopyText(FULL, "sub/_split_output/2026-10/2026-10-01_10-24-31/a_AI/split_01/a_01.png"))
      .toBe(`${FULL}\\sub\\_split_output\\2026-10\\2026-10-01_10-24-31\\a_AI\\split_01`);
  });

  it("normalises the base it is given, and answers the folder for an empty base", () => {
    expect(folderCopyText(`"${FULL}/"`, "a/icon_AI.png")).toBe(`${FULL}\\a`);
    expect(folderCopyText("", "a/icon_AI.png")).toBe("a");
    expect(folderCopyText(FULL, "")).toBe(FULL);
  });
});

describe("pathLeaf", () => {
  it("names the last folder, forgiving quotes and the trailing separator", () => {
    expect(pathLeaf(`"${FULL}\\"`)).toBe(ROOT);
    expect(pathLeaf("F:\\")).toBe("F:");
    expect(pathLeaf("")).toBe("");
  });
});

describe("pathFromCopied — the picked folder's real path (I-35)", () => {
  it("adopts a copied path whose leaf is the picked folder, whatever the styling", () => {
    expect(pathFromCopied(`"${FULL}\\"`, ROOT)).toBe(FULL);
    expect(pathFromCopied(FULL.toUpperCase(), ROOT)).toBe(FULL.toUpperCase());
    expect(pathFromCopied("F:/Stocks 2026/icons testing/single/test_processing", ROOT)).toBe(FULL);
  });

  it("does NOT complete a copied parent into a guess — exact leaf or nothing (I-59)", () => {
    // the twice-reported mistake: a folder path from somewhere else on the
    // clipboard became `<that path>\<picked name>` and stuck
    expect(pathFromCopied("F:\\Stocks 2026\\icons testing\\single", ROOT)).toBe("");
    expect(pathFromCopied("F:", ROOT)).toBe("");
    expect(pathFromCopied("\\\\server\\share\\icons", ROOT)).toBe("");
  });

  it("refuses a file path, a bare word and an empty clipboard — never invents a path", () => {
    expect(pathFromCopied("F:\\icons\\icon-airplane-landing.png", ROOT)).toBe("");
    expect(pathFromCopied("hello", ROOT)).toBe("");
    expect(pathFromCopied(ROOT, ROOT)).toBe(""); // a name with no drive
    expect(pathFromCopied("", ROOT)).toBe("");
    expect(pathFromCopied(FULL, "")).toBe("");
  });

  it("keeps UNC shares intact", () => {
    expect(pathFromCopied(`\\\\server\\share\\icons\\${ROOT}\\`, ROOT)).toBe(`\\\\server\\share\\icons\\${ROOT}`);
  });
});

// The screenshot that started this: an SVG document (the app's own *Copy code*
// puts one on the clipboard) was adopted as the folder's "full path" because the
// guard ran after `/` had already been turned into `\`, and the field itself
// accepted anything at all. A full path is only ever an Explorer folder path.
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 24 24" fill="none">';
const URL = "http://www.w3.org/2000/svg";

describe("isFolderPathText — what Explorer can hand over, and nothing else", () => {
  it("accepts drive paths, a bare drive, UNC shares, quotes and forward slashes", () => {
    for (const text of [
      "F:\\Stocks 2026\\icons testing\\single\\test_processing",
      `"F:\\Stocks 2026\\icons"`, "F:/Stocks 2026/icons", "F:\\", "F:", "C:\\a",
      "\\\\server\\share", "\\\\server\\share\\icons",
    ]) {
      expect(isFolderPathText(text)).toBe(true);
    }
  });

  it("refuses markup, URLs, words, relative paths, file names and illegal characters", () => {
    for (const text of [
      SVG, URL, "hello", "", "   ",
      "history\\more",                       // relative: no drive, no share
      "icon-airplane-landing.png",            // a file, not a folder path
      "F:\\icons\\a<b", "F:\\icons\\a?b", "F:\\icons\\a|b",
      "F:\\icons\\a:b", "F:\\icons\\a\"b", "F:\\icons\\a\nb",
    ]) {
      expect(isFolderPathText(text)).toBe(false);
    }
  });

  it("never adopts markup or a URL from the clipboard as the picked folder's path", () => {
    expect(pathFromCopied(SVG, ROOT)).toBe("");
    expect(pathFromCopied(URL, ROOT)).toBe("");
    expect(pathFromCopied(`${SVG}"${FULL}"`, ROOT)).toBe("");
  });
});
