// handles.test.ts — RULE 8: rel-path -> handle resolution + path text.
import { describe, expect, it } from "vitest";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { fullPathText, resolveFile } from "../src/selection/handles";

describe("resolveFile", () => {
  it("resolves nested rel paths to their file handle", async () => {
    const root = new FakeDir("root");
    const a = await root.getDirectoryHandle("a", { create: true });
    const b = await a.getDirectoryHandle("b", { create: true });
    b.children.set("f.png", new FakeFile("f.png", 3, 7, "x"));
    const fh = await resolveFile(root, "a/b/f.png");
    expect(fh?.name).toBe("f.png");
  });

  it("returns null for absent files or absent folders", async () => {
    const root = new FakeDir("root");
    expect(await resolveFile(root, "nope.png")).toBeNull();
    expect(await resolveFile(root, "x/y/nope.png")).toBeNull();
  });
});

describe("fullPathText", () => {
  it("renders explorer-style backslash paths", () => {
    expect(fullPathText("D:", "a/b/f.png")).toBe("D:\\a\\b\\f.png");
  });
});
