// rootpath.test.ts — RULE 2/9/13: the string rules of a "full path". A copy
// gives a FOLDER, as the picked folder's real path with backslashes (I-56: a
// deep file copies its OWN containing folder). A captured path is only ever one
// the clipboard named exactly — the folder itself (`how: "copied"`), or the
// folder that CONTAINS the copied one (`how: "derived"`, one level down — the
// third report, 2026-10-09). Appending a picked name to a copied folder is the
// glue that started all three reports and is refused forever (I-59).
import { beforeEach, describe, expect, it } from "vitest";
import {
  folderCopyText,
  isFolderPathText,
  normalizeRootPath,
  pathFromCopied,
  pathLeaf,
  pathParent,
  stripPathTail,
} from "../src/lib/rootpath";

const ROOT = "test_processing";
const FULL = "F:\\Stocks 2026\\icons testing\\single\\test_processing";
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
const URL_TEXT = "https://example.com/x";

beforeEach(() => {
  localStorage.clear();
});

describe("normalizeRootPath — the path as Explorer would show it", () => {
  it("drops Explorer's quotes and trailing backslash, unifies separators", () => {
    expect(normalizeRootPath(`"${FULL}\\\\"`)).toBe(FULL);
    expect(normalizeRootPath("F:/icons/a//b/")).toBe("F:\\icons\\a\\b");
  });

  it("keeps an UNC share's leading pair", () => {
    expect(normalizeRootPath("\\\\server\\share\\a")).toBe("\\\\server\\share\\a");
    expect(normalizeRootPath("//server/share/a")).toBe("\\\\server\\share\\a");
  });
});

describe("pathLeaf / pathParent — one level of the path", () => {
  it("names the last segment, or the drive's own name at its root", () => {
    expect(pathLeaf("F:\\a\\b\\")).toBe("b");
    expect(pathLeaf("F:\\")).toBe("F:");
    expect(pathLeaf("")).toBe("");
  });

  it("steps one folder up, and never above the drive or the share", () => {
    expect(pathParent("F:\\a\\b")).toBe("F:\\a");
    expect(pathParent("F:\\a")).toBe("F:");
    expect(pathParent("F:")).toBe("");
    expect(pathParent("\\\\srv\\share\\x")).toBe("\\\\srv\\share");
    expect(pathParent("\\\\srv\\share")).toBe(""); // \\srv is not a folder path
    expect(pathParent("hello")).toBe("");
  });
});

describe("isFolderPathText — what Explorer can hand over (I-39)", () => {
  it("accepts drive and UNC folder paths", () => {
    for (const text of ["F:", "F:\\", "F:\\a\\b", "\\\\server\\share", "\\\\server\\share\\f"]) {
      expect(isFolderPathText(text)).toBe(true);
    }
  });

  it("refuses markup, URLs, words, relative text, files and broken names", () => {
    for (const text of [
      SVG, URL_TEXT, "hello", "", "   ",
      "history\\more",
      "icon-airplane-landing.png",
      "F:\\icons\\a<b", "F:\\icons\\a?b", "F:\\icons\\a|b",
      "F:\\icons\\a:b", "F:\\icons\\a\"b", "F:\\icons\\a\nb",
    ]) {
      expect(isFolderPathText(text)).toBe(false);
    }
  });
});

describe("pathFromCopied — the copied text must NAME the folder (I-35/I-59)", () => {
  it("adopts a copied path whose leaf IS the folder", () => {
    expect(pathFromCopied(`"${FULL}\\"`, ROOT)).toEqual({ path: FULL, how: "copied" });
    expect(pathFromCopied("F:\\a\\TEST_PROCESSING", ROOT))
      .toEqual({ path: "F:\\a\\TEST_PROCESSING", how: "copied" }); // Windows names are case-insensitive
  });

  it("adopts the PARENT when the copy is one level down inside the folder — the third report", () => {
    // the user copies `…\test_process_3\_split_output` and picks `test_process_3`:
    // same root, one level down — the parent IS named by that copy
    expect(pathFromCopied("F:\\Stocks 2026\\icons testing\\single\\test_process_3\\_split_output", "test_process_3"))
      .toEqual({ path: "F:\\Stocks 2026\\icons testing\\single\\test_process_3", how: "derived" });
  });

  it("NEVER appends a picked name to a copied folder — that completion is the glue", () => {
    // the three reports' generator: `…\split_03\export` on the clipboard while
    // `test_process_3` is picked must never become `…\export\test_process_3`
    expect(pathFromCopied("F:\\Stocks 2026\\icons testing\\single\\test_processing_2\\_split_output\\2026-10\\2026-10-08_18-46-23\\icon-bank-institution_AI_10\\split_03\\export", "test_process_3"))
      .toEqual({ path: "", how: null });
  });

  it("refuses a word, a URL, markup, a file and a copy more than one level down", () => {
    for (const text of ["hello", URL_TEXT, SVG, "icon-airplane-landing.png", `F:\\a\\${ROOT}\\x\\y`]) {
      expect(pathFromCopied(text, ROOT)).toEqual({ path: "", how: null });
    }
  });

  it("does nothing at all when no folder is named", () => {
    expect(pathFromCopied(FULL, "")).toEqual({ path: "", how: null });
  });
});

describe("stripPathTail — the reverse join, verified (never a guess)", () => {
  it("removes exactly the segments resolve() reported", () => {
    expect(stripPathTail("F:\\a\\test_process_3\\_split_output", ["_split_output"]))
      .toBe("F:\\a\\test_process_3");
    expect(stripPathTail("F:\\a\\b", [])).toBe("F:\\a\\b"); // the folder itself
    expect(stripPathTail("F:\\x", ["x"])).toBe("F:"); // the drive root is a folder
  });

  it("refuses when the tail does not match, or would leave a non-path", () => {
    expect(stripPathTail("F:\\a\\b", ["c"])).toBeNull();
    expect(stripPathTail("F:\\a", ["a", "more"])).toBeNull();
    expect(stripPathTail("\\\\srv\\share", ["share"])).toBeNull(); // \\srv is not a path
    expect(stripPathTail("", ["x"])).toBeNull();
  });
});

describe("folderCopyText — the folder of the file, never a file name (I-56)", () => {
  it("joins the file's own folder onto the captured base with backslashes", () => {
    const rel = "_split_output/2026-10/2026-10-05_18-45-20/icon-bunny-face_AI_7/split_04/icon_04_v2.svg";
    expect(folderCopyText(FULL, rel))
      .toBe(`${FULL}\\_split_output\\2026-10\\2026-10-05_18-45-20\\icon-bunny-face_AI_7\\split_04`);
  });

  it("falls back to the base the caller passes (the folder's name) — never a guess", () => {
    expect(folderCopyText(ROOT, "set_A/a_AI.png")).toBe(`${ROOT}\\set_A`);
    expect(folderCopyText("", "set_A/a_AI.png")).toBe("set_A");
    expect(folderCopyText(FULL, "a_AI.png")).toBe(FULL); // a file in the root: the root
  });
});
