// TDD cycle 2 — scan: recursive walk with ignore list, AI eligibility,
// reference linking, and diff of two scans (added/changed/kept/missing).
import { describe, expect, it } from "vitest";
import { collectAiImages, countFolders, diffScan, linkReferences, walkTree, type TreeNode } from "../src/lib/scan";

const file = (name: string, size = 100, mtime = 1): TreeNode => ({ name, dir: false, size, mtime });
const dir = (name: string, ...children: TreeNode[]): TreeNode => ({ name, dir: true, children });

const tree = dir("root",
  file("icon-award-ribbon.png"),
  file("icon-award-ribbon_AI.png", 101, 2),
  file("icon-award-ribbon_AI_7.png", 102, 3),
  file("readme.txt"),
  dir("Category-A",
    file("star_AI.png"),
    file("star_AI_2.png"),
    dir("_split_output", file("old_AI.png")), // must be ignored
  ),
  dir("empty", ),
);

describe("walkTree (spec §1)", () => {
  it("finds every file recursively with its relative path", () => {
    const entries = walkTree(tree, []);
    const paths = entries.map((e) => e.relPath).sort();
    expect(paths).toContain("icon-award-ribbon_AI.png");
    expect(paths).toContain("Category-A/star_AI_2.png");
    expect(paths).toContain("Category-A/_split_output/old_AI.png");
    expect(entries).toHaveLength(7);
  });
  it("ignores folders from the ignore list at any depth", () => {
    const entries = walkTree(tree, ["_split_output"]);
    expect(entries.some((e) => e.relPath.includes("_split_output"))).toBe(false);
    expect(entries).toHaveLength(6);
  });
});

describe("collectAiImages + linkReferences (spec §4)", () => {
  it("keeps only eligible AI images, case-insensitively, skipping non-images", () => {
    const imgs = collectAiImages(walkTree(tree, ["_split_output"]));
    const names = imgs.map((i) => i.relPath).sort();
    expect(names).toEqual([
      "Category-A/star_AI.png",
      "Category-A/star_AI_2.png",
      "icon-award-ribbon_AI.png",
      "icon-award-ribbon_AI_7.png",
    ]);
  });
  it("links each AI image to a same-folder reference; missing ref => null", () => {
    const entries = walkTree(tree, ["_split_output"]);
    const linked = linkReferences(collectAiImages(entries), entries);
    const by = Object.fromEntries(linked.map((i) => [i.relPath, i.refRelPath]));
    expect(by["icon-award-ribbon_AI.png"]).toBe("icon-award-ribbon.png");
    expect(by["icon-award-ribbon_AI_7.png"]).toBe("icon-award-ribbon.png");
    expect(by["Category-A/star_AI.png"]).toBeNull(); // no star.png present
  });
});

describe("diffScan — added / changed / kept / missing (spec §6)", () => {
  const rec = (relPath: string, size: number, mtime: number, status = "processed" as const) =>
    ({ relPath, name: relPath.split("/").pop()!, size, mtime, status, updated: "" });

  it("classifies every record against the current scan", () => {
    const entries = walkTree(tree, ["_split_output"]);
    const curr = linkReferences(collectAiImages(entries), entries);
    const prev = [
      rec("icon-award-ribbon_AI.png", 101, 2), // identical -> kept
      rec("icon-award-ribbon_AI_7.png", 999, 3), // size differs -> changed
      rec("gone_AI.png", 5, 5), // absent -> missing
    ];
    const d = diffScan(prev, curr);
    expect(d.kept.map((x) => x.relPath)).toEqual(["icon-award-ribbon_AI.png"]);
    expect(d.changed.map((x) => x.relPath)).toEqual(["icon-award-ribbon_AI_7.png"]);
    expect(d.missing.map((x) => x.relPath)).toEqual(["gone_AI.png"]);
    expect(d.added.map((x) => x.relPath).sort()).toEqual(["Category-A/star_AI.png", "Category-A/star_AI_2.png"]);
  });
  it("mtime difference alone also marks changed", () => {
    const entries = walkTree(tree, ["_split_output"]);
    const curr = linkReferences(collectAiImages(entries), entries);
    const d = diffScan([rec("icon-award-ribbon_AI.png", 101, 999)], curr);
    expect(d.changed).toHaveLength(1);
  });
});

describe("countFolders — the 'Recursive · N nested folders' figure (design)", () => {
  it("counts nested folders and skips the ignored ones", () => {
    expect(countFolders(tree, [])).toBe(3); // Category-A, Category-A/_split_output, empty
    expect(countFolders(tree, ["_split_output"])).toBe(2);
  });
});
