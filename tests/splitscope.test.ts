// splitscope.test.ts — RULE 3/24: the reviewable set is the split output.
// The Batch tab writes its pieces into `<dest>/<YYYY-MM>/<stamp>/<folder>/
// split_NN/` (dest = `_split_output` by default) and copies the reference beside
// each piece. The main folder keeps the unsplit sheets — the batch's input. When
// the picked tree holds such a folder, the list must be the pieces, and the
// sheets must be reported, never silently dropped.
import { describe, expect, it } from "vitest";
import { pairEntries } from "../src/lib/pairing";
import { walkTree } from "../src/lib/scan";
import { directoryNames, isSplitDirName, scopeOf, splitPairs } from "../src/lib/splitscope";
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

describe("scopeOf — what the picked folder makes reviewable", () => {
  it("names the set and hides the main folder when the tree HOLDS the output folder", () => {
    const tree = reportedTree();
    expect(scopeOf(directoryNames(tree), "test_processing")).toEqual({ split: true, hideOutside: true });
  });

  it("names the set and hides nothing when the picked folder IS the output folder (I-47)", () => {
    // the reported pick: F:\…\test_processing_2\_split_output — the directories
    // BELOW it are month/run/split folders, and the main folder is above the
    // root, so nothing found is "outside the split output"
    const out = reportedTree().children?.[3] as TreeNode;
    expect(scopeOf(directoryNames(out), "_split_output")).toEqual({ split: true, hideOutside: false });
  });

  it("names the set when the picked folder is one run folder inside the output", () => {
    const run = reportedTree().children?.[3];
    expect(scopeOf(directoryNames(run as TreeNode), "2026-10-01_10-24-31")).toEqual({ split: true, hideOutside: false });
  });

  it("does not scope a tree without one, so a plain folder reviews as before", () => {
    const plain: TreeNode = {
      name: "icons", dir: true, children: [
        { name: "architecture", dir: true, children: [file("court.png"), file("court_AI.png")] },
      ],
    };
    expect(scopeOf(directoryNames(plain), "icons")).toEqual({ split: false, hideOutside: false });
  });

  it("does not treat a folder that merely looks dated as the output", () => {
    const dated: TreeNode = {
      name: "2026-10", dir: true, children: [
        { name: "architecture", dir: true, children: [file("court.png"), file("court_AI.png")] },
      ],
    };
    // a month folder is not evidence of the app's output; a run STAMP is
    expect(scopeOf(directoryNames(dated), "2026-10")).toEqual({ split: false, hideOutside: false });
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
    const scoped = splitPairs(all, { split: true, hideOutside: true });
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
    const scoped = splitPairs(all, { split: false, hideOutside: false });
    expect(scoped.pairs).toEqual(all);
    expect(scoped.outside).toEqual([]);
  });

  it("keeps every pair when the picked folder IS the output folder (I-47)", () => {
    // the pieces walk relative to `_split_output`, so no relative segment names
    // it — the root itself is the evidence, and it hides nothing
    const out = (reportedTree().children?.[3] ?? null) as TreeNode;
    const pieces = walkTree(out, []).map((e) => ({ ...e, relPath: e.relPath.replace("_split_output/", "") }));
    const all = pairEntries(pieces);
    expect(all.length).toBe(2);
    const scoped = splitPairs(all, { split: true, hideOutside: false });
    expect(scoped.pairs.map((p) => p.relDir)).toEqual(["2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_01", "2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_02"]);
    expect(scoped.outside).toEqual([]); // the reported "2 pair(s) in the main folder" bug
  });

  it("scopes by DIRECTORY name only — a file merely named like one changes nothing", () => {
    const tree = dir("root", [
      dir("_split_output", [file("a.png"), file("a_AI.png")]),
      file("notes_split_output_ideas.png"),
      file("notes_split_output_ideas_AI.png"),
    ]);
    expect(scopeOf(directoryNames(tree), "root")).toEqual({ split: true, hideOutside: true });
    const scoped = splitPairs(pairEntries(walkTree(tree, [])), { split: true, hideOutside: true });
    // the folder is the split output; the root pair whose FILE name mentions it is not
    expect(scoped.pairs.map((p) => p.relDir)).toEqual(["_split_output"]);
    expect(scoped.outside.map((p) => p.relDir)).toEqual([""]);
  });
});
