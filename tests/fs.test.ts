// TDD cycle 6 — fs adapter (spec §5/§6 plumbing): RULE 8 via structural fakes.
// The fakes implement the same interfaces the browser File System Access API
// satisfies, so the adapter logic really executes — no mocks of the code itself.
import { describe, expect, it } from "vitest";
import { copyFileTo, ensureDirPath, nameExists, readDirTree, writeFileNew } from "../src/lib/fs";
import { FakeDir } from "./helpers/fakefs";

describe("readDirTree — recursive snapshot with size/mtime and ignore list", () => {
  it("builds the tree and skips ignored folders", async () => {
    const root = new FakeDir("root");
    const cat = await root.getDirectoryHandle("Category-A", { create: true });
    await cat.getFileHandle("a_AI.png", { create: true });
    const out = await root.getDirectoryHandle("_split_output", { create: true });
    await out.getFileHandle("old_AI.png", { create: true });
    const tree = await readDirTree(root, ["_split_output"]);
    expect(tree.dir).toBe(true);
    expect(tree.children!.map((c) => c.name)).toEqual(["Category-A"]);
    const sub = tree.children![0];
    expect(sub.children![0].name).toBe("a_AI.png");
    expect(sub.children![0].size).toBe(4); // "data"
    expect(sub.children![0].mtime).toBe(1000);
  });
});

describe("writeFileNew — never overwrite (RULE 23)", () => {
  it("creates a new file and refuses the same name twice", async () => {
    const dir = new FakeDir("x");
    await writeFileNew(dir, "a.png", new Blob(["1"]));
    expect(dir.children.has("a.png")).toBe(true);
    await expect(writeFileNew(dir, "a.png", new Blob(["2"]))).rejects.toThrow(/exists/i);
  });
});

describe("ensureDirPath / nameExists / copyFileTo", () => {
  it("creates nested dirs idempotently", async () => {
    const root = new FakeDir("root");
    const d1 = await ensureDirPath(root, "a/b/c");
    const d2 = await ensureDirPath(root, "a/b/c");
    expect(d1.name).toBe("c");
    expect(d2).toBe(d1);
    expect(await nameExists("dir", root, "a")).toBe(true);
    expect(await nameExists("dir", root, "zz")).toBe(false);
  });
  it("copies file bytes under a new name; collision throws", async () => {
    const srcDir = new FakeDir("s");
    const dstDir = new FakeDir("d");
    const f = await srcDir.getFileHandle("ref.png", { create: true });
    await copyFileTo(f, dstDir, "ref.png");
    expect(dstDir.children.has("ref.png")).toBe(true);
    await expect(copyFileTo(f, dstDir, "ref.png")).rejects.toThrow(/exists/i);
    expect(await nameExists("file", dstDir, "ref.png")).toBe(true);
  });
});
