// splitscope.test.ts — RULE 3/24: the reviewable set is the split output.
// The Batch tab writes its pieces into `<dest>/<YYYY-MM>/<stamp>/<folder>/
// split_NN/` (dest = `_split_output` by default) and copies the reference beside
// each piece. The main folder keeps the unsplit sheets — the batch's input. When
// the picked tree holds such a folder, the list must be the pieces, and the
// sheets must be reported, never silently dropped.
import { describe, expect, it } from "vitest";
import { pairEntries } from "../src/lib/pairing";
import { walkTree } from "../src/lib/scan";
import { directoryNames, isSplitDirName, scopeOf, scopeText, splitPairs } from "../src/lib/splitscope";
import type { TreeNode } from "../src/lib/scan";

function file(name: string): TreeNode {
  return { name, dir: false, size: 10, mtime: 1000, error: null };
}

function dir(name: string, children: TreeNode[]): TreeNode {
  return { name, dir: true, children };
}

/** The reported tree: one unsplit sheet at the root, its pieces in the batch. */
function reportedTree(): TreeNode {
  return {
    name: "test_processing", dir: true, children: [
      file("icon-sheet.png"),
      file("icon-sheet_AI.png"),
      file("review-decisions.json"),
      {
        name: "_split_output", dir: true, children: [
          {
            name: "2026-10", dir: true, children: [
              {
                name: "2026-10-01_10-24-31", dir: true, children: [
                  {
                    name: "icon-sheet_AI", dir: true, children: [
                      { name: "split_01", dir: true, children: [file("icon-sheet.png"), file("icon-sheet_AI_01.png")] },
                      { name: "split_02", dir: true, children: [file("icon-sheet.png"), file("icon-sheet_AI_02.png")] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("isSplitDirName — the folder the batch created", () => {
  it("accepts the app's own output folder and tolerant variants", () => {
    for (const name of ["_split_output", "_SPLIT_OUTPUT", "_split_output_v2", "_my_split_output", "_split-output-2026"]) {
      expect(isSplitDirName(name)).toBe(true);
    }
  });

  it("refuses near-misses that the user never meant", () => {
    for (const name of ["split_output", "_splitoutput", "_output_split", "_split", "output", "split_01", "2026-10"]) {
      expect(isSplitDirName(name)).toBe(false);
    }
  });
});

describe("scopeOf — is this tree's reviewable set a split output?", () => {
  it("scopes to the split output when the tree holds one", () => {
    const tree = reportedTree();
    expect(scopeOf(directoryNames(tree), "test_processing")).toBe(true);
  });

  it("reviews the whole picked output when the picked folder IS a split output", () => {
    // bug-1: picking `_split_output` itself listed 0 — every pair is root-relative
    // then, so none carries the split segment the narrowed set looks for.
    expect(scopeOf(directoryNames(reportedTree()), "_split_output")).toBe(false);
  });

  it("does not scope a tree without one, so a plain folder reviews as before", () => {
    const plain: TreeNode = {
      name: "icons", dir: true, children: [
        { name: "architecture", dir: true, children: [file("court.png"), file("court_AI.png")] },
      ],
    };
    expect(scopeOf(directoryNames(plain), "icons")).toBe(false);
  });
});

describe("splitPairs — the pieces in, the unsplit sheets reported", () => {
  it("keeps only the pairs inside the split output, and counts the rest", () => {
    const tree = reportedTree();
    const all = pairEntries(walkTree(tree, []));
    expect(all.map((p) => p.relDir).sort()).toEqual([
      "", "_split_output/2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_01",
      "_split_output/2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_02",
    ]);
    const scoped = splitPairs(all, true);
    expect(scoped.pairs.map((p) => p.relDir)).toEqual([
      "_split_output/2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_01",
      "_split_output/2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_02",
    ]);
    expect(scoped.outside.map((p) => p.relDir)).toEqual([""]);
    expect(scoped.pairs[0].ai?.relPath).toContain("icon-sheet_AI_01.png");
    expect(scoped.pairs[0].source?.relPath).toContain("split_01/icon-sheet.png");
  });

  it("keeps every pair when the tree is not scoped", () => {
    const all = pairEntries(walkTree(reportedTree(), []));
    const scoped = splitPairs(all, false);
    expect(scoped.pairs).toEqual(all);
    expect(scoped.outside).toEqual([]);
  });

  it("lists the run's pieces when the picked folder IS the split output (bug-1)", () => {
    const output = reportedTree().children!.find((c) => c.name === "_split_output")!;
    const all = pairEntries(walkTree(output, []));
    expect(all).toHaveLength(2);
    const scoped = splitPairs(all, scopeOf(directoryNames(output), output.name));
    expect(scoped.pairs.map((p) => p.relDir).sort()).toEqual([
      "2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_01",
      "2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_02",
    ]);
    expect(scoped.outside).toEqual([]);
  });

  it("still narrows a batch root whose split output holds no pairs (I-38)", () => {
    const tree = dir("test_processing", [
      file("icon-sheet.png"), file("icon-sheet_AI.png"), dir("_split_output", []),
    ]);
    const all = pairEntries(walkTree(tree, []));
    expect(all.map((p) => p.relDir)).toEqual([""]);
    const scoped = splitPairs(all, scopeOf(directoryNames(tree), tree.name));
    expect(scoped.pairs).toEqual([]);
    expect(scoped.outside.map((p) => p.relDir)).toEqual([""]);
  });

  it("scopes by DIRECTORY name only — a file merely named like one changes nothing", () => {
    const tree = dir("root", [
      dir("_split_output", [file("a.png"), file("a_AI.png")]),
      file("notes_split_output_ideas.png"),
      file("notes_split_output_ideas_AI.png"),
    ]);
    expect(scopeOf(directoryNames(tree), "root")).toBe(true);
    const scoped = splitPairs(pairEntries(walkTree(tree, [])), true);
    // the folder is the split output; the root pair whose FILE name mentions it is not
    expect(scoped.pairs.map((p) => p.relDir)).toEqual(["_split_output"]);
    expect(scoped.outside.map((p) => p.relDir)).toEqual([""]);
  });
});

describe("scopeText — the scope as the toolbars state it", () => {
  it("names the picked output instead of claiming none was found (bug-1)", () => {
    expect(scopeText({ split: false, outside: 0 }, "_split_output")).toBe("Scope: this split output");
  });

  it("states the whole folder as before for any other unscoped pick", () => {
    expect(scopeText({ split: false, outside: 0 }, "2026-10")).toBe("Scope: whole folder — no split output found");
    expect(scopeText({ split: false, outside: 0 })).toBe("Scope: whole folder — no split output found");
  });
});
