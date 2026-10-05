// splitscope.test.ts — RULE 3/24: the reviewable set is the split output, and the
// answer must not depend on HOW DEEP the user opened the tree. The Batch tab
// writes its pieces into `<dest>/<YYYY-MM>/<stamp>/<folder>/split_NN/`
// (dest = `_split_output` by default) and copies the reference beside each piece.
// The main folder keeps the unsplit sheets — the batch's input.
//
// Reported (2026-10-05): opening `…/test_processing_2/_split_output` or
// `…/_split_output/2026-10/2026-10-05_18-45-20` listed NOTHING, while opening
// `…/_split_output/2026-10` listed the pieces. The acceptance below is the user's
// own: all levels of one tree give the same list of pieces.
import { describe, expect, it } from "vitest";
import { pairEntries } from "../src/lib/pairing";
import { walkTree } from "../src/lib/scan";
import {
  isSplitDirName, pairInScope, scopeLevelOf, scopeText, splitPairs, treeDirs, type ScanScope,
} from "../src/lib/splitscope";
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

const PICKS = [
  "test_processing",
  "_split_output",
  "_split_output/2026-10",
  "_split_output/2026-10/2026-10-01_10-24-31",
];

/** The branch a user opened: the tree's node at `rel`, named as the picker sees it. */
function picked(tree: TreeNode, rel: string): TreeNode {
  const segs = rel.split("/").filter(Boolean);
  const from = segs[0] === tree.name ? segs.slice(1) : segs; // the tree's own name may lead
  let node = tree;
  for (const seg of from) node = (node.children ?? []).find((c) => c.name === seg) as TreeNode;
  return { ...node, name: from[from.length - 1] ?? tree.name };
}

/** What the list would show for one pick level, as the scan computes it. */
function scanAt(rel: string): { dirs: string[]; outside: string[]; scope: ScanScope } {
  const tree = picked(reportedTree(), rel);
  const level = scopeLevelOf(treeDirs(tree), tree.name);
  const { pairs, outside } = splitPairs(pairEntries(walkTree(tree, [])), level);
  return {
    dirs: pairs.map((p) => p.relDir),
    outside: outside.map((p) => p.relDir),
    scope: { level, outside: outside.length },
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

describe("treeDirs — name and depth, so the pick level can be judged", () => {
  it("names every directory with its depth below the picked folder", () => {
    const dirs = treeDirs(reportedTree());
    expect(dirs).toContainEqual({ name: "_split_output", depth: 0 });
    expect(dirs).toContainEqual({ name: "2026-10", depth: 1 });
    expect(dirs).toContainEqual({ name: "icon-sheet_AI", depth: 3 });
    expect(dirs).toContainEqual({ name: "split_02", depth: 4 });
    expect(dirs.filter((d) => d.depth === 0).map((d) => d.name)).toEqual(["_split_output"]);
  });
});

describe("scopeLevelOf — the reviewable set follows the PICK LEVEL (the reported 0-item bug)", () => {
  it("takes the batch's output as the set when it is a DIRECT child of the pick", () => {
    const tree = reportedTree();
    expect(scopeLevelOf(treeDirs(tree), "test_processing")).toBe("output-child");
  });

  it("reviews the whole pick when the picked folder IS the split output", () => {
    const tree = picked(reportedTree(), "_split_output");
    expect(tree.name).toBe("_split_output");
    expect(scopeLevelOf(treeDirs(tree), tree.name)).toBe("output");
  });

  it("reviews the whole pick when the picked folder sits INSIDE the split output", () => {
    for (const rel of PICKS.slice(2)) {
      const tree = picked(reportedTree(), rel);
      expect(scopeLevelOf(treeDirs(tree), tree.name)).toBe("whole");
    }
  });

  it("never lets a piece folder scope the tree — only a direct child can", () => {
    // the level-3 pick above only matched by luck: <stamp>_split_01 is a PIECE
    const tree = dir("2026-10-01_10-24-31", [
      dir("icon-sheet_AI_split_01", [dir("split_01", [file("a.png"), file("a_AI.png")])]),
    ]);
    expect(scopeLevelOf(treeDirs(tree), "2026-10-01_10-24-31")).toBe("whole");
  });

  it("keeps reviewing the whole pick when the output sits deeper (a nested alias)", () => {
    const tree = dir("batch", [dir("sub", [dir("_split_output", [dir("2026-10", [file("a.png")])])])]);
    expect(scopeLevelOf(treeDirs(tree), "batch")).toBe("whole");
  });

  it("does not scope a tree without one, so a plain folder reviews as before", () => {
    const plain = dir("icons", [dir("architecture", [file("court.png"), file("court_AI.png")])]);
    expect(scopeLevelOf(treeDirs(plain), "icons")).toBe("whole");
  });
});

describe("the same pieces whatever level of the batch tree is opened (the acceptance)", () => {
  const SHARED = ["2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_01", "2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_02"];
  const DEEP = ["2026-10-01_10-24-31/icon-sheet_AI/split_01", "2026-10-01_10-24-31/icon-sheet_AI/split_02"];

  it("lists the same piece folders from the batch root, the output, the month and the run", () => {
    expect(scanAt(PICKS[0]).dirs).toEqual(["_split_output/" + SHARED[0], "_split_output/" + SHARED[1]]);
    expect(scanAt(PICKS[1]).dirs).toEqual(SHARED);
    expect(scanAt(PICKS[2]).dirs).toEqual(DEEP);
    // every level lists the SAME two piece folders (paths relative to the pick)
    for (const rel of PICKS) expect(scanAt(rel).dirs).toHaveLength(2);
  });

  it("hides the unsplit sheet only where it is really mixed in — the batch root", () => {
    expect(scanAt(PICKS[0]).scope).toEqual({ level: "output-child", outside: 1 });
    expect(scanAt(PICKS[0]).outside).toEqual([""]);
    for (const rel of PICKS.slice(1)) {
      expect(scanAt(rel).scope.outside).toBe(0);
      expect(scanAt(rel).outside).toEqual([]);
    }
  });

  it("says which of the three scopes it used, one wording each", () => {
    expect(scopeText({ level: "whole", outside: 0 })).toBe("Scope: whole folder — no split output found");
    expect(scopeText({ level: "output", outside: 0 })).toBe("Scope: split output — everything under it is listed");
    expect(scopeText({ level: "output-child", outside: 0 })).toBe("Scope: split output only");
    expect(scopeText({ level: "output-child", outside: 3 }))
      .toBe("Scope: split output only · 3 pair(s) in the main folder not listed");
  });
});

describe("splitPairs / pairInScope — level in, pairs out", () => {
  it("keeps only the pairs inside the output at the output-child level", () => {
    const tree = reportedTree();
    const all = pairEntries(walkTree(tree, []));
    const scoped = splitPairs(all, "output-child");
    expect(scoped.pairs.map((p) => p.relDir)).toEqual([
      "_split_output/2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_01",
      "_split_output/2026-10/2026-10-01_10-24-31/icon-sheet_AI/split_02",
    ]);
    expect(scoped.outside.map((p) => p.relDir)).toEqual([""]);
    expect(scoped.pairs[0].ai?.relPath).toContain("icon-sheet_AI_01.png");
    expect(scoped.pairs[0].source?.relPath).toContain("split_01/icon-sheet.png");
    expect(pairInScope(scoped.pairs[0], "output-child")).toBe(true);
    expect(pairInScope(scoped.outside[0], "output-child")).toBe(false);
  });

  it("keeps every pair at the whole and output levels", () => {
    const all = pairEntries(walkTree(reportedTree(), []));
    for (const level of ["whole", "output"] as const) {
      const scoped = splitPairs(all, level);
      expect(scoped.pairs).toEqual(all);
      expect(scoped.outside).toEqual([]);
      expect(all.every((p) => pairInScope(p, level))).toBe(true);
    }
  });

  it("scopes by DIRECTORY name only — a file merely named like one changes nothing", () => {
    const tree = dir("root", [
      dir("_split_output", [file("a.png"), file("a_AI.png")]),
      file("notes_split_output_ideas.png"),
      file("notes_split_output_ideas_AI.png"),
    ]);
    expect(scopeLevelOf(treeDirs(tree), "root")).toBe("output-child");
    const scoped = splitPairs(pairEntries(walkTree(tree, [])), "output-child");
    // the folder is the split output; the root pair whose FILE name mentions it is not
    expect(scoped.pairs.map((p) => p.relDir)).toEqual(["_split_output"]);
    expect(scoped.outside.map((p) => p.relDir)).toEqual([""]);
  });
});
