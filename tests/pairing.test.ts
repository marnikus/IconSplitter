// pairing.test.ts — RULE 8: discovery + pairing semantics for Selection mode.
import { describe, expect, it } from "vitest";
import { walkTree, type FileEntry, type TreeNode } from "../src/lib/scan";
import { attentionInfo, identityKey, pairEntries, problemsOf, type ReviewPair } from "../src/lib/pairing";

function file(dirPath: string, name: string, size = 100, mtime = 1000): FileEntry {
  return { name, dirPath, relPath: dirPath ? `${dirPath}/${name}` : name, size, mtime, error: null };
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

  it("links reference case-insensitively when folder names carry _AI casing", () => {
    // real batch output tree: folder icon-bunny-face_AI_5 holds both files
    const dir = "2026-10/2026-10-01_10-24-31/icon-bunny-face_AI_5/split_04";
    const pairs = pairEntries([
      file(dir, "icon-bunny-face.png", 74, 1),
      file(dir, "icon-bunny-face_AI_5_04.png", 224, 2),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].source?.relPath).toBe(`${dir}/icon-bunny-face.png`);
    expect(pairs[0].ai?.relPath).toBe(`${dir}/icon-bunny-face_AI_5_04.png`);
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

// 2026-10-05 — the pair list is a function of the file SET, never of the order
// the filesystem enumerated it (design: recursive-scan-determinism D2/D3).
function shuffled<T>(list: T[], seed: number): T[] {
  const out = [...list];
  let x = seed;
  for (let i = out.length - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) % 2147483648;
    const j = x % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe("pairEntries — deterministic under any enumeration order", () => {
  const layout = (): FileEntry[] => [
    file("split_01", "icon-airplane-landing.png", 74, 100),
    file("split_01", "icon-airplane-landing_AI_8_01.png", 999, 111),
    file("split_01", "icon-airplane-landing_AI_8_01.svg", 50, 112),
    file("split_01", "icon-airplane-landing_AI_8_01.svg.json", 5, 113),
    file("split_01", "icon-airplane-landing_AI_8_02.png", 998, 114),
    file("split_01", "icon-airplane-landing_AI_8_02.svg", 51, 115),
    file("split_01", "icon-airplane-landing_AI_8.svg", 52, 116),
    file("split_01", "icon-airplane-landing_AI_8_v2.svg", 53, 117),
    file("", "notes.txt", 1, 1),
  ];

  it("returns an identical list for every enumeration order", () => {
    const base = JSON.stringify(pairEntries(layout()));
    expect(JSON.stringify(pairEntries([...layout()].reverse()))).toBe(base);
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      expect(JSON.stringify(pairEntries(shuffled(layout(), seed)))).toBe(base);
    }
  });

  it("prefers the raster result over the SVG artifact of the same pair id", () => {
    const inSplit = pairEntries(layout())
      .filter((p) => p.relDir === "split_01")
      .map((p) => p.ai?.relPath);
    expect(inSplit).toEqual([
      "split_01/icon-airplane-landing_AI_8.svg", // the only result of that variation
      "split_01/icon-airplane-landing_AI_8_01.png",
      "split_01/icon-airplane-landing_AI_8_02.png",
    ]);
  });

  it("ignores the app's own version artifacts instead of inventing source rows", () => {
    const pairs = pairEntries(layout());
    expect(pairs.some((p) => p.base.startsWith("icon-airplane-landing_AI_8_v2"))).toBe(false);
    expect(pairs.map((p) => p.ai?.relPath ?? p.source?.relPath))
      .not.toContain("split_01/icon-airplane-landing_AI_8_v2.svg");
  });

  it("resolves a case-only name collision deterministically", () => {
    const a = pairEntries([file("", "Fog_AI.png", 1, 1), file("", "fog_AI.png", 2, 2)]);
    const b = pairEntries([file("", "fog_AI.png", 2, 2), file("", "Fog_AI.png", 1, 1)]);
    expect(a).toHaveLength(1); // one pair id: the paths differ only by case
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a[0].ai?.relPath).toBe("Fog_AI.png");
  });

  it("falls back to the SVG when no raster result exists", () => {
    const only = pairEntries([file("", "hand_AI.svg", 7, 9)]);
    expect(only).toHaveLength(1);
    expect(only[0].ai?.relPath).toBe("hand_AI.svg");
  });
});

describe("problemsOf — one reason per file", () => {
  it("names the missing AI result beside an existing reference", () => {
    const p = pairEntries([file("", "solo.png", 5, 5)])[0];
    expect(problemsOf(p)).toEqual([
      { kind: "ai-missing", relPath: null, reason: "no AI result (solo_AI.png) beside solo.png" },
    ]);
  });

  it("names the missing reference of an AI-only pair", () => {
    const orphan = pairEntries([file("d", "k_AI.png", 5, 5)])[0];
    expect(problemsOf(orphan)).toEqual([
      { kind: "original-missing", relPath: null, reason: "no reference image (k.png) beside d/k_AI.png" },
    ]);
  });

  it("reports an unreadable side with its path, and nothing for a healthy pair", () => {
    const locked = pairEntries([
      file("d", "k2.png", 5, 5),
      { ...file("d", "k2_AI.png", 9, 9), error: "unreadable" },
    ])[0];
    expect(problemsOf(locked)).toEqual([
      { kind: "unreadable", relPath: "d/k2_AI.png", reason: "d/k2_AI.png could not be read (locked or still being written)" },
    ]);
    expect(problemsOf(pairEntries([file("", "ok.png"), file("", "ok_AI.png")])[0])).toEqual([]);
  });
});
