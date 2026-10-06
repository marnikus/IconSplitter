// rootpath.test.ts — RULE 2/9/13: the copy gives a FOLDER, as the picked
// folder's real path with backslashes, and the full path is one the picker
// captures (the browser only ever knows the folder's name). The example
// the user gave drives the batch rule: a file deep inside a run's output tree
// copies the run's folder, because that is the one a human opens in Explorer.
import { beforeEach, describe, expect, it } from "vitest";
import {
  ROOT_PATH_KEY,
  folderCopyText,
  isFolderPathText,
  loadRootPath,
  loadRootPathInfo,
  normalizeRootPath,
  pathFromCopied,
  pathLeaf,
  rememberedRootPath,
  rootPathRevision,
  saveRootPathInfo,
  subscribeRootPaths,
} from "../src/lib/rootpath";

const ROOT = "test_processing";
const FULL = "F:\\Stocks 2026\\icons testing\\single\\test_processing";

beforeEach(() => {
  localStorage.clear();
});

describe("normalizeRootPath", () => {
  it("strips the quotes Explorer's Copy-as-path adds and the trailing separator", () => {
    expect(normalizeRootPath(`  "${FULL}\\"  `)).toBe(FULL);
  });

  it("forgives a truncated paste (a lone leading quote)", () => {
    expect(normalizeRootPath(`"F:\\icons`)).toBe("F:\\icons");
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

describe("the remembered full path", () => {
  it("round-trips per folder name, normalised", () => {
    saveRootPathInfo(ROOT, `"F:\\Stocks 2026\\icons testing\\single\\test_processing\\"`, "copied");
    expect(loadRootPath(ROOT)).toBe(FULL);
    expect(rememberedRootPath(ROOT)).toBe(FULL);
  });

  it("keeps the folder's name as the fallback so a copy is never empty", () => {
    expect(loadRootPath(ROOT)).toBe("");
    expect(rememberedRootPath(ROOT)).toBe(ROOT);
  });

  it("remembers each folder separately and forgets a cleared one", () => {
    saveRootPathInfo("a", "F:\\one", "copied");
    saveRootPathInfo("b", "D:\\two", "copied");
    expect(rememberedRootPath("a")).toBe("F:\\one");
    expect(rememberedRootPath("b")).toBe("D:\\two");
    saveRootPathInfo("a", "", "copied");
    expect(loadRootPath("a")).toBe("");
  });

  it("treats a corrupt or hand-edited payload as no memory (RULE 13)", () => {
    localStorage.setItem(ROOT_PATH_KEY, "{not json");
    expect(loadRootPath(ROOT)).toBe("");
    localStorage.setItem(ROOT_PATH_KEY, JSON.stringify({ root: 42 }));
    expect(loadRootPath("root")).toBe("");
  });
});

describe("folderCopyText", () => {
  it("copies the batch folder for a file inside a run's output tree", () => {
    saveRootPathInfo(ROOT, FULL, "copied");
    const rel = "_split_output/2026-10/2026-10-01_10-24-31/icon-airplane-landing_AI_9/split_02/icon-airplane-landing.svg.json";
    expect(folderCopyText(ROOT, rel)).toBe(`${FULL}\\_split_output\\2026-10\\2026-10-01_10-24-31`);
  });

  it("copies the containing folder for a source-tree item, never the file", () => {
    saveRootPathInfo(ROOT, FULL, "copied");
    expect(folderCopyText(ROOT, "Category-A/icon_AI.png")).toBe(`${FULL}\\Category-A`);
    expect(folderCopyText(ROOT, "icon_AI.png")).toBe(FULL);
  });

  it("stops at the batch folder when the file sits directly in it", () => {
    saveRootPathInfo(ROOT, FULL, "copied");
    expect(folderCopyText(ROOT, "_split_output/2026-10/2026-10-01_10-24-31/icon_AI_02.png"))
      .toBe(`${FULL}\\_split_output\\2026-10\\2026-10-01_10-24-31`);
  });

  it("keeps the whole folder chain when the tree only looks like a batch", () => {
    saveRootPathInfo(ROOT, FULL, "copied");
    expect(folderCopyText(ROOT, "_split_output/2026-10/notes/icon_AI.png"))
      .toBe(`${FULL}\\_split_output\\2026-10\\notes`);
    expect(folderCopyText(ROOT, "_split_output/latest/icon_AI.png"))
      .toBe(`${FULL}\\_split_output\\latest`);
  });

  it("never returns a file name", () => {
    saveRootPathInfo(ROOT, FULL, "copied");
    const text = folderCopyText(ROOT, "a/b/icon-airplane-landing.svg.json");
    expect(text.endsWith(".svg.json")).toBe(false);
    expect(text.endsWith("icon-airplane-landing")).toBe(false);
  });

  it("falls back to the folder's own name when no full path was captured", () => {
    expect(folderCopyText(ROOT, "Category-A/icon_AI.png")).toBe(`${ROOT}\\Category-A`);
    expect(folderCopyText(ROOT, "_split_output/2026-10/2026-10-01_10-24-31/a_AI/split_01/a_01.png"))
      .toBe(`${ROOT}\\_split_output\\2026-10\\2026-10-01_10-24-31`);
  });

  it("stops at the batch folder when the picked ROOT is the output folder (I-48)", () => {
    // the reported pick: F:\\…\\test_processing_2\\_split_output — the run chain is
    // at the head of the relative path, not inside it
    const out = "F:\\Stocks 2026\\icons testing\\single\\test_processing_2\\_split_output";
    saveRootPathInfo("_split_output", out, "copied");
    expect(folderCopyText("_split_output", "2026-10/2026-10-05_18-45-20/icon-sheet_AI/split_02/icon-sheet_AI_02.png"))
      .toBe(`${out}\\2026-10\\2026-10-05_18-45-20`);
    // a month folder picked instead: the run stamp is the first segment
    saveRootPathInfo("2026-10", `${out}\\2026-10`, "copied");
    expect(folderCopyText("2026-10", "2026-10-05_18-45-20/icon-sheet_AI/split_02/icon-sheet_AI_02.png"))
      .toBe(`${out}\\2026-10\\2026-10-05_18-45-20`);
    // an item directly in the output folder keeps its own folder
    expect(folderCopyText("_split_output", "notes/a_AI.png")).toBe(`${out}\\notes`);
  });

  it("stops at the picked ROOT when the root itself is one run folder (I-48)", () => {
    // the reported pick: …\\_split_output\\2026-10\\2026-10-05_18-45-20
    const run = "F:\\Stocks 2026\\icons testing\\single\\test_processing_2\\_split_output\\2026-10\\2026-10-05_18-45-20";
    saveRootPathInfo("2026-10-05_18-45-20", run, "copied");
    expect(folderCopyText("2026-10-05_18-45-20", "icon-sheet_AI/split_02/icon-sheet_AI_02.png")).toBe(run);
    expect(folderCopyText("2026-10-05_18-45-20", "icon-sheet_AI_02.png")).toBe(run);
  });

  it("keeps a batch base that is nested under a subfolder of the root", () => {
    saveRootPathInfo(ROOT, FULL, "copied");
    expect(folderCopyText(ROOT, "sub/_split_output/2026-10/2026-10-01_10-24-31/a_AI/split_01/a_01.png"))
      .toBe(`${FULL}\\sub\\_split_output\\2026-10\\2026-10-01_10-24-31`);
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
    expect(pathFromCopied(`"${FULL}\\"`, ROOT)).toEqual({ path: FULL, how: "copied" });
    expect(pathFromCopied(FULL.toUpperCase(), ROOT)).toEqual({ path: FULL.toUpperCase(), how: "copied" });
    expect(pathFromCopied("F:/Stocks 2026/icons testing/single/test_processing", ROOT))
      .toEqual({ path: FULL, how: "copied" });
  });

  it("completes the path when the user copied the parent it lives in", () => {
    expect(pathFromCopied("F:\\Stocks 2026\\icons testing\\single", ROOT))
      .toEqual({ path: FULL, how: "completed" });
    expect(pathFromCopied("F:", ROOT)).toEqual({ path: `F:\\${ROOT}`, how: "completed" });
  });

  it("refuses a file path, a bare word and an empty clipboard — never invents a path", () => {
    expect(pathFromCopied("F:\\icons\\icon-airplane-landing.png", ROOT)).toEqual({ path: "", how: null });
    expect(pathFromCopied("hello", ROOT)).toEqual({ path: "", how: null });
    expect(pathFromCopied(ROOT, ROOT)).toEqual({ path: "", how: null }); // a name with no drive
    expect(pathFromCopied("", ROOT)).toEqual({ path: "", how: null });
    expect(pathFromCopied(FULL, "")).toEqual({ path: "", how: null });
  });

  it("keeps UNC shares intact when completing them", () => {
    expect(pathFromCopied("\\\\server\\share\\icons", ROOT))
      .toEqual({ path: `\\\\server\\share\\icons\\${ROOT}`, how: "completed" });
  });
});

describe("the stored record and its revision (I-36)", () => {
  it("remembers how the path was obtained, and still believes a legacy string", () => {
    saveRootPathInfo(ROOT, FULL, "completed");
    expect(loadRootPathInfo(ROOT)).toEqual({ path: FULL, how: "completed" });
    localStorage.setItem(ROOT_PATH_KEY, JSON.stringify({ [ROOT]: FULL })); // written before `how`
    expect(loadRootPathInfo(ROOT)).toEqual({ path: FULL, how: "copied" }); // a legacy string
    localStorage.setItem(ROOT_PATH_KEY, JSON.stringify({ [ROOT]: { path: 42, how: "copied" } }));
    expect(loadRootPathInfo(ROOT)).toEqual({ path: "", how: null });
  });

  it("notifies subscribers on a real change, and stays quiet on an identical save", () => {
    let notifications = 0;
    const stop = subscribeRootPaths(() => { notifications++; });
    saveRootPathInfo(ROOT, FULL, "copied");
    expect(notifications).toBe(1);
    saveRootPathInfo(ROOT, FULL, "copied"); // nothing moved
    expect(notifications).toBe(1);
    saveRootPathInfo(ROOT, "F:\\elsewhere", "copied"); // a real change
    expect(notifications).toBe(2);
    expect(rootPathRevision()).toBeGreaterThan(0);
    stop();
    saveRootPathInfo(ROOT, "");
    expect(notifications).toBe(2); // unsubscribed
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
});

describe("the guard at every entry point (I-39)", () => {
  it("refuses to remember markup handed to the memory, and keeps the old value", () => {
    saveRootPathInfo(ROOT, FULL, "copied");
    for (const junk of [SVG, URL, "hello"]) {
      // refused: the writer reports what it actually holds, never "the last thing
      // typed" — the one entry point left after the field was removed (I-45)
      expect(saveRootPathInfo(ROOT, junk, "copied")).toEqual({ path: FULL, how: "copied" });
      expect(loadRootPath(ROOT)).toBe(FULL);
    }
    expect(saveRootPathInfo(ROOT, "", "copied")).toEqual({ path: "", how: null }); // empty forgets
    expect(loadRootPath(ROOT)).toBe("");
  });

  it("forgets a junk value written by an older build, instead of showing it", () => {
    localStorage.setItem(ROOT_PATH_KEY, JSON.stringify({ [ROOT]: { path: SVG, how: "copied" } }));
    expect(loadRootPathInfo(ROOT)).toEqual({ path: "", how: null });
    localStorage.setItem(ROOT_PATH_KEY, JSON.stringify({ [ROOT]: URL }));
    expect(loadRootPathInfo(ROOT)).toEqual({ path: "", how: null });
    // with no trustworthy memory the copy falls back to the folder's own name —
    // never to the junk, and never to a path the app guessed
    expect(folderCopyText(ROOT, "set_A/a_AI.png")).toBe(`${ROOT}\\set_A`);
  });

  it("never adopts markup or a URL from the clipboard as the picked folder's path", () => {
    expect(pathFromCopied(SVG, ROOT)).toEqual({ path: "", how: null });
    expect(pathFromCopied(URL, ROOT)).toEqual({ path: "", how: null });
    expect(pathFromCopied(`${SVG}"${FULL}"`, ROOT)).toEqual({ path: "", how: null });
  });
});
