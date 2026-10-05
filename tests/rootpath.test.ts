// rootpath.test.ts — RULE 2/9/13: the copy gives a FOLDER, as the picked
// folder's real path with backslashes, and the full path is a value the user
// supplies once (the browser only ever knows the folder's name). The example
// the user gave drives the batch rule: a file deep inside a run's output tree
// copies the run's folder, because that is the one a human opens in Explorer.
import { beforeEach, describe, expect, it } from "vitest";
import {
  ROOT_PATH_KEY,
  folderCopyText,
  loadRootPath,
  normalizeRootPath,
  rememberedRootPath,
  saveRootPath,
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

  it("remembers each folder separately and forgets a cleared one", () => {
    saveRootPath("a", "F:\\one");
    saveRootPath("b", "D:\\two");
    expect(rememberedRootPath("a")).toBe("F:\\one");
    expect(rememberedRootPath("b")).toBe("D:\\two");
    saveRootPath("a", "");
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

  it("falls back to the folder's own name when no full path was pasted", () => {
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
