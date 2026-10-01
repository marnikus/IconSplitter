// pairing.test.ts — RULE 8: discovery + pairing semantics for Selection mode.
import { describe, expect, it } from "vitest";
import { walkTree, type FileEntry, type TreeNode } from "../src/lib/scan";
import { attentionInfo, identityKey, pairEntries, type ReviewPair } from "../src/lib/pairing";

function file(dirPath: string, name: string, size = 100, mtime = 1000): FileEntry {
  return { name, dirPath, relPath: dirPath ? `${dirPath}/${name}` : name, size, mtime };
}

describe("pairEntries", () => {
  it("pairs source and AI images across nested folders, preserving rel paths", () => {
    const entries = [
      file("a/b", "hero.png", 5, 111),
      file("a/b", "hero_AI.png", 9, 222),
      file("c", "logo.png", 6, 333),
      file("c", "logo_AI.png", 7, 444),
    ];
    const pairs = pairEntries(entries);
    expect(pairs).toHaveLength(2);
    const hero = pairs.find((p) => p.base === "hero")!;
    expect(hero.relDir).toBe("a/b");
    expect(hero.source?.relPath).toBe("a/b/hero.png");
    expect(hero.ai?.relPath).toBe("a/b/hero_AI.png");
    expect(hero.created).toBe(111);
    expect(hero.generated).toBe(222);
  });

  it("walks a recursive tree via walkTree and pairs nested results", () => {
    const tree: TreeNode = {
      name: "root", dir: true, children: [
        { name: "x", dir: true, children: [{ name: "y", dir: true, children: [
          { name: "n1.png", dir: false, size: 1, mtime: 10 },
          { name: "n1_AI.png", dir: false, size: 2, mtime: 20 },
        ] }] },
      ],
    };
    const pairs = pairEntries(walkTree(tree, []));
    expect(pairs).toHaveLength(1);
    expect(pairs[0].relDir).toBe("x/y");
    expect(pairs[0].source?.relPath).toBe("x/y/n1.png");
  });

  it("gives AI variants their own pair while sharing the source", () => {
    const entries = [
      file("", "s.png"), file("", "s_AI.png", 1, 2), file("", "s_AI_2.png", 3, 4),
    ];
    const pairs = pairEntries(entries);
    expect(pairs).toHaveLength(2);
    expect(pairs.every((p) => p.source?.relPath === "s.png")).toBe(true);
    expect(new Set(pairs.map((p) => p.pairId)).size).toBe(2);
  });

  it("pairs the real-world layout: reference + multi-tail _AI_9_01 result", () => {
    const pairs = pairEntries([
      file("", "icon-airplane-landing.png", 5, 111),
      file("", "icon-airplane-landing_AI_9_01.png", 9, 222),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].base).toBe("icon-airplane-landing");
    expect(pairs[0].source?.relPath).toBe("icon-airplane-landing.png");
    expect(pairs[0].ai?.relPath).toBe("icon-airplane-landing_AI_9_01.png");
    expect(attentionInfo(pairs[0])).toBeNull();
  });

  it("never emits the same pair twice for duplicated input", () => {
    const e = [file("", "d.png"), file("", "d_AI.png"), file("", "d_AI.png")];
    const pairs = pairEntries(e);
    expect(pairs).toHaveLength(1);
  });

  it("marks unpaired source as AI-result-missing and unpaired AI as original-missing", () => {
    const pairs = pairEntries([file("", "solo.png"), file("", "orphan_AI.png")]);
    const solo = pairs.find((p) => p.base === "solo")!;
    const orphan = pairs.find((p) => p.base === "orphan")!;
    expect(solo.ai).toBeNull();
    expect(solo.source).not.toBeNull();
    expect(orphan.source).toBeNull();
    expect(orphan.ai).not.toBeNull();
  });

  it("ignores non-image files; plain images surface as unpaired sources", () => {
    const pairs = pairEntries([
      file("", "notes.txt"), file("", "icon-ai.png"), file("", "data.json"),
    ]);
    expect(pairs).toHaveLength(1); // icon-ai.png has no _AI result -> shown missing
    expect(pairs[0].ai).toBeNull();
  });

  it("produces stable, dir-scoped ids with the pair_ prefix", () => {
    const a = pairEntries([file("m", "k.png"), file("m", "k_AI.png")])[0];
    const b = pairEntries([file("m", "k.png"), file("m", "k_AI.png")])[0];
    const c = pairEntries([file("other", "k.png"), file("other", "k_AI.png")])[0];
    expect(a.pairId).toBe(b.pairId);
    expect(a.pairId).not.toBe(c.pairId);
    expect(a.pairId).toMatch(/^pair_[0-9a-f]{8}$/);
  });
});

describe("identity + attention", () => {
  const p: ReviewPair = pairEntries([file("q", "i.png", 42, 777), file("q", "i_AI.png", 9, 888)])[0];

  it("identityKey uses the source side when present", () => {
    expect(identityKey(p)).toBe("42:777");
  });

  it("identityKey falls back to the AI side for original-missing pairs", () => {
    const orphan = pairEntries([file("q", "j_AI.png", 9, 888)])[0];
    expect(identityKey(orphan)).toBe("9:888");
  });

  it("attentionInfo flags missing sides and is null for complete pairs", () => {
    expect(attentionInfo(p)).toBeNull();
    expect(attentionInfo({ ...p, ai: null })).toBe("AI result missing");
    expect(attentionInfo({ ...p, source: null })).toBe("Original missing");
  });
});
