// rootpath.test.ts — RULE 2/9/13: the copy gives a FOLDER, as the picked
// folder's real path with backslashes, and the full path is captured when the
// folder is picked (the browser only ever knows the folder's name). The example
// the user gave drives the batch rule: a file deep inside a run's output tree
// copies the run's folder, because that is the one a human opens in Explorer.
import { beforeEach, describe, expect, it } from "vitest";
import {
  ROOT_PATH_KEY,
  folderCopyText,
  isFolderPathText,
  loadRootPath,
  normalizeRootPath,
  pathFromCopied,
  pathLeaf,
  rememberedRootPath,
  rootPathRevision,
  saveRootPath,
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
    saveRootPath(ROOT, `"F:\\Stocks 2026\\icons testing\\single\\test_processing\\"`);
    expect(loadRootPath(ROOT)).toBe(FULL);
    expect(rememberedRootPath(ROOT)).toBe(FULL);
  });

  it("keeps the folder's name as the fallback so a copy is never empty", () => {
    expect(loadRootPath(ROOT)).toBe("");
    expect(rememberedRootPath(ROOT)).toBe(ROOT);
  });

  it("remembers each folder separately, and refuses to forget one with junk", () => {
    saveRootPath("a", "F:\\one");
    saveRootPath("b", "D:\\two");
    expect(rememberedRootPath("a")).toBe("F:\\one");
    expect(rememberedRootPath("b")).toBe("D:\\two");
    // the path row has no field to clear it with, so nothing may clear it by
    // accident either — an empty value is a refusal, not a delete
    expect(saveRootPath("a", "")).toBe(false);
    expect(loadRootPath("a")).toBe("F:\\one");
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
    saveRootPath(ROOT, FULL);
    const rel = "_split_output/2026-10/2026-10-01_10-24-31/icon-airplane-landing_AI_9/split_02/icon-airplane-landing.svg.json";
    expect(folderCopyText(ROOT, rel)).toBe(`${FULL}\\_split_output\\2026-10\\2026-10-01_10-24-31`);
  });

  it("copies the containing folder for a source-tree item, never the file", () => {
    saveRootPath(ROOT, FULL);
    expect(folderCopyText(ROOT, "Category-A/icon_AI.png")).toBe(`${FULL}\\Category-A`);
    expect(folderCopyText(ROOT, "icon_AI.png")).toBe(FULL);
  });

  it("stops at the batch folder when the file sits directly in it", () => {
    saveRootPath(ROOT, FULL);
    expect(folderCopyText(ROOT, "_split_output/2026-10/2026-10-01_10-24-31/icon_AI_02.png"))
      .toBe(`${FULL}\\_split_output\\2026-10\\2026-10-01_10-24-31`);
  });

  it("keeps the whole folder chain when the tree only looks like a batch", () => {
    saveRootPath(ROOT, FULL);
    expect(folderCopyText(ROOT, "_split_output/2026-10/notes/icon_AI.png"))
      .toBe(`${FULL}\\_split_output\\2026-10\\notes`);
    expect(folderCopyText(ROOT, "_split_output/latest/icon_AI.png"))
      .toBe(`${FULL}\\_split_output\\latest`);
  });

  it("never returns a file name", () => {
    saveRootPath(ROOT, FULL);
    const text = folderCopyText(ROOT, "a/b/icon-airplane-landing.svg.json");
    expect(text.endsWith(".svg.json")).toBe(false);
    expect(text.endsWith("icon-airplane-landing")).toBe(false);
  });

  it("falls back to the folder's own name when no full path was captured", () => {
    expect(folderCopyText(ROOT, "Category-A/icon_AI.png")).toBe(`${ROOT}\\Category-A`);
    expect(folderCopyText(ROOT, "_split_output/2026-10/2026-10-01_10-24-31/a_AI/split_01/a_01.png"))
      .toBe(`${ROOT}\\_split_output\\2026-10\\2026-10-01_10-24-31`);
  });

  it("keeps a batch base that is nested under a subfolder of the root", () => {
    saveRootPath(ROOT, FULL);
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
    expect(pathFromCopied(`"${FULL}\\"`, ROOT)).toBe(FULL);
    expect(pathFromCopied(FULL.toUpperCase(), ROOT)).toBe(FULL.toUpperCase());
    expect(pathFromCopied("F:/Stocks 2026/icons testing/single/test_processing", ROOT)).toBe(FULL);
  });

  it("refuses the parent folder — the app never completes a path by guessing", () => {
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
});

describe("the stored value and its revision (I-36)", () => {
  it("reads every payload written by earlier builds, and rejects junk", () => {
    localStorage.setItem(ROOT_PATH_KEY, JSON.stringify({ [ROOT]: { path: FULL, how: "completed" } }));
    expect(loadRootPath(ROOT)).toBe(FULL); // the object shape, whatever `how` says
    localStorage.setItem(ROOT_PATH_KEY, JSON.stringify({ [ROOT]: FULL })); // written before `how`
    expect(loadRootPath(ROOT)).toBe(FULL);
    localStorage.setItem(ROOT_PATH_KEY, JSON.stringify({ [ROOT]: { path: 42, how: "copied" } }));
    expect(loadRootPath(ROOT)).toBe("");
  });

  it("notifies subscribers on a real change, and stays quiet on an identical save", () => {
    let notifications = 0;
    const stop = subscribeRootPaths(() => { notifications++; });
    saveRootPath(ROOT, FULL);
    expect(notifications).toBe(1);
    saveRootPath(ROOT, FULL); // nothing moved
    expect(notifications).toBe(1);
    saveRootPath(ROOT, "F:\\elsewhere"); // a real change
    expect(notifications).toBe(2);
    expect(rootPathRevision()).toBeGreaterThan(0);
    stop();
    saveRootPath(ROOT, "F:\\third");
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

describe("the guard on every write (I-39)", () => {
  it("refuses to remember markup, keeps the old value, and never forgets it", () => {
    saveRootPath(ROOT, FULL);
    expect(saveRootPath(ROOT, SVG)).toBe(false);
    expect(loadRootPath(ROOT)).toBe(FULL);       // unchanged, not "the last thing written"
    expect(saveRootPath(ROOT, URL)).toBe(false);
    expect(saveRootPath(ROOT, "hello")).toBe(false);
    expect(saveRootPath(ROOT, "")).toBe(false);  // no field, so nothing clears it either
    expect(loadRootPath(ROOT)).toBe(FULL);
  });

  it("forgets a junk value written by an older build, instead of showing it", () => {
    localStorage.setItem(ROOT_PATH_KEY, JSON.stringify({ [ROOT]: { path: SVG, how: "copied" } }));
    expect(loadRootPath(ROOT)).toBe("");
    localStorage.setItem(ROOT_PATH_KEY, JSON.stringify({ [ROOT]: URL }));
    expect(loadRootPath(ROOT)).toBe("");
    // with no trustworthy memory the copy falls back to the folder's own name —
    // never to the junk, and never to a path the app guessed
    expect(folderCopyText(ROOT, "set_A/a_AI.png")).toBe(`${ROOT}\\set_A`);
  });

  it("never adopts markup or a URL from the clipboard as the picked folder's path", () => {
    expect(pathFromCopied(SVG, ROOT)).toBe("");
    expect(pathFromCopied(URL, ROOT)).toBe("");
    expect(pathFromCopied(`${SVG}"${FULL}"`, ROOT)).toBe("");
  });
});
