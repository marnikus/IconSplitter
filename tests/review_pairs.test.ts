// TDD cycle R1 — reviewpair discovery: recursive scan → source/AI pairs.
// Covers: nested folders, _AI/_AI_N pairing, duplicates, unpaired sides,
// stable ids, deterministic order, pair diff for rescan, next-pending roll.
import { describe, expect, it } from "vitest";
import { buildPairs, diffPairs, pairId, type ReviewPair } from "../src/lib/review";
import { nextPendingId } from "../src/lib/reviewmerge";
import { walkTree, type FileEntry, type TreeNode } from "../src/lib/scan";
import type { ReviewItem } from "../src/lib/reviewmerge";

const file = (name: string, size = 100, mtime = 1): TreeNode => ({ name, dir: false, size, mtime });
const dir = (name: string, ...children: TreeNode[]): TreeNode => ({ name, dir: true, children });

function entriesOf(tree: TreeNode, ignore: string[] = ["_split_output"]): FileEntry[] {
  return walkTree(tree, ignore);
}

describe("buildPairs — recursive scan + pairing (spec §1)", () => {
  it("finds pairs in nested folders and keeps the relative folder", () => {
    const tree = dir("root",
      dir("Category-A", file("star.png"), file("star_AI.png", 200, 5)),
      dir("deep", dir("inner", file("moon.jpg"), file("moon_AI.png", 300, 7))),
    );
    const pairs = buildPairs(entriesOf(tree));
    expect(pairs).toHaveLength(2);
    const star = pairs.find((p) => p.base === "star")!;
    expect(star.dirPath).toBe("Category-A");
    expect(star.source?.relPath).toBe("Category-A/star.png");
    expect(star.ai?.relPath).toBe("Category-A/star_AI.png");
    expect(star.kind).toBe("paired");
    expect(pairs.find((p) => p.base === "moon")!.dirPath).toBe("deep/inner");
  });

  it("ignores the split output tree and non-image files", () => {
    const tree = dir("root",
      dir("_split_output", file("icon_AI.png"), file("icon.png")),
      file("notes.txt"),
      file("a.png"), file("a_AI.png"),
    );
    const pairs = buildPairs(entriesOf(tree));
    expect(pairs.map((p) => p.base)).toEqual(["a"]);
  });

  it("matches a source with a different extension", () => {
    const pairs = buildPairs(entriesOf(dir("root", file("hero.jpg"), file("hero_AI.png"))));
    expect(pairs[0].kind).toBe("paired");
    expect(pairs[0].source?.relPath).toBe("hero.jpg");
  });

  it("pairs each _AI variant of one base with the shared source", () => {
    const pairs = buildPairs(entriesOf(dir("root",
      file("star.png"), file("star_AI.png"), file("star_AI_2.png"),
    )));
    expect(pairs.map((p) => p.id).sort()).toEqual(["star", "star#2"]);
    expect(pairs.every((p) => p.source?.relPath === "star.png")).toBe(true);
    expect(pairs.every((p) => p.kind === "paired")).toBe(true);
  });

  it("reports unpaired sides honestly (spec §10)", () => {
    const pairs = buildPairs(entriesOf(dir("root",
      file("lonely_AI.png"), file("orphan.png"), file("paired.png"), file("paired_AI.png"),
    )));
    const byId = Object.fromEntries(pairs.map((p) => [p.id, p]));
    expect(byId["lonely"].kind).toBe("ai-only");
    expect(byId["lonely"].source).toBeNull();
    expect(byId["lonely"].ai?.relPath).toBe("lonely_AI.png");
    expect(byId["orphan"].kind).toBe("source-only");
    expect(byId["orphan"].ai).toBeNull();
    expect(byId["paired"].kind).toBe("paired");
  });

  it("never returns the same pair twice, even with duplicate or case-only listings", () => {
    const entries = entriesOf(dir("root", file("star.png"), file("star_AI.png")));
    const doubled = [...entries, ...entries.map((e) => ({ ...e, relPath: e.relPath.toUpperCase() }))];
    expect(buildPairs(doubled)).toHaveLength(1);
    expect(doubled.length).toBe(4);
  });

  it("uses the newest side mtime as the pair creation date (spec §2)", () => {
    const pairs = buildPairs(entriesOf(dir("root", file("star.png", 10, 1000), file("star_AI.png", 20, 5000))));
    expect(pairs[0].createdAt).toBe(5000);
  });

  it("orders pairs by folder, base and variant deterministically", () => {
    const pairs = buildPairs(entriesOf(dir("root",
      file("b.png"), file("b_AI.png"), file("a.png"), file("a_AI_2.png"), file("a_AI.png"),
      dir("z", file("c.png"), file("c_AI.png")),
    )));
    expect(pairs.map((p) => p.id)).toEqual(["a", "a#2", "b", "z/c"]);
  });
});

describe("pairId — stable identity (spec §8)", () => {
  it("folds case and includes the AI variant", () => {
    expect(pairId("Category-A", "Star", null)).toBe("category-a/star");
    expect(pairId("", "Star", 2)).toBe("star#2");
    expect(pairId("cat", "star", null)).toBe(pairId("CAT", "STAR", null));
  });
});

describe("diffPairs — rescan reporting (spec §9)", () => {
  const pair = (id: string, mtime: number, size = 10): ReviewPair => ({
    id, dirPath: "", base: id, variant: null, kind: "paired",
    source: { relPath: `${id}.png`, name: `${id}.png`, size, mtime },
    ai: { relPath: `${id}_AI.png`, name: `${id}_AI.png`, size: size * 2, mtime },
    createdAt: mtime,
  });

  it("separates added, removed, changed and unchanged pairs", () => {
    const prev = [pair("a", 1), pair("b", 1), pair("c", 1)];
    const next = [pair("a", 1), pair("b", 2), pair("d", 1, 300)];
    const d = diffPairs(prev, next);
    expect(d.added).toEqual(["d"]);
    expect(d.removed).toEqual(["c"]);
    expect(d.changed).toEqual(["b"]);
    expect(d.kept).toBe(1);
  });

  it("recognises a renamed pair by its unchanged fingerprint", () => {
    const d = diffPairs([pair("old", 7)], [pair("new", 7)]);
    expect(d.renamed).toEqual([{ from: "old", to: "new" }]);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });
});

describe("nextPendingId — roll over all pending images (spec §6)", () => {
  const item = (id: string, status: ReviewItem["status"]): ReviewItem => ({
    id, dirPath: "", base: id, variant: null, kind: "paired",
    source: null, ai: null, createdAt: 0, status, reviewedAt: null,
  });

  it("moves forward to the next pending item", () => {
    const items = [item("a", "approved"), item("b", "pending"), item("c", "declined"), item("d", "pending")];
    expect(nextPendingId(items, "b")).toBe("d");
  });

  it("wraps around and includes the current item when it is the only pending one", () => {
    const items = [item("a", "pending"), item("b", "approved"), item("c", "approved")];
    expect(nextPendingId(items, "a")).toBe("a");
    expect(nextPendingId(items, "c")).toBe("a");
  });

  it("returns null when nothing is pending", () => {
    expect(nextPendingId([item("a", "approved")], "a")).toBeNull();
  });
});
