// @vitest-environment node
// builder_commit.test.ts — RULE 8 + RULE 23: writing a sheet into the user's own
// `builder/` folder. Proven over a fake filesystem: the folder is created when it
// is missing, an existing file is NEVER overwritten (a collision gets a suffix),
// and a write that fails is reported rather than silently swallowed.
import { describe, expect, it } from "vitest";
import { commitSheet, freeNameIn, safeFileName } from "../src/builder/commit";
import { FakeDir, FakeFile } from "./helpers/fakefs";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>`;

describe("safeFileName — a name that cannot escape the folder", () => {
  it("keeps a plain name", () => {
    expect(safeFileName("icon-sheet-1000x800.svg")).toBe("icon-sheet-1000x800.svg");
  });

  it("strips any path separator and leading dots", () => {
    expect(safeFileName("../../etc/passwd")).toBe("etcpasswd");
    expect(safeFileName("..\\..\\x.svg")).toBe("x.svg");
  });

  it("refuses characters a Windows filesystem rejects", () => {
    expect(safeFileName('a<b>c:d"e|f?g*h.svg')).toBe("abcdefgh.svg");
  });

  it("never returns an empty name", () => {
    expect(safeFileName("///")).toBe("sheet.svg");
  });
});

describe("freeNameIn — a collision never overwrites", () => {
  it("keeps the wanted name when it is free", () => {
    expect(freeNameIn(new Set(), "sheet.svg")).toBe("sheet.svg");
  });

  it("adds an index before the extension when it is taken", () => {
    expect(freeNameIn(new Set(["sheet.svg"]), "sheet.svg")).toBe("sheet-1.svg");
    expect(freeNameIn(new Set(["sheet.svg", "sheet-1.svg"]), "sheet.svg")).toBe("sheet-2.svg");
  });

  it("handles a name with no extension", () => {
    expect(freeNameIn(new Set(["sheet"]), "sheet")).toBe("sheet-1");
  });
});

describe("commitSheet — one create-only write into builder/", () => {
  it("creates the folder when it is missing and writes the file", async () => {
    const root = new FakeDir("library");
    const done = await commitSheet(root, "icon-sheet.svg", SVG);
    expect(done.ok).toBe(true);
    const folder = root.children.get("builder");
    expect(folder).toBeInstanceOf(FakeDir);
    expect((folder as FakeDir).children.has("icon-sheet.svg")).toBe(true);
  });

  it("never overwrites: a second export gets a suffixed name", async () => {
    const root = new FakeDir("library");
    await commitSheet(root, "icon-sheet.svg", SVG);
    const second = await commitSheet(root, "icon-sheet.svg", SVG);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.name).toBe("icon-sheet-1.svg");
    const folder = root.children.get("builder") as FakeDir;
    expect(folder.children.size).toBe(2);
  });

  it("writes the exact bytes it was given", async () => {
    const root = new FakeDir("library");
    const done = await commitSheet(root, "icon-sheet.svg", SVG);
    if (!done.ok) return;
    const folder = root.children.get("builder") as FakeDir;
    const file = folder.children.get(done.name) as FakeFile;
    const read = await (await file.getFile()).text();
    expect(read).toBe(SVG);
  });

  it("reports a failure instead of pretending the file landed", async () => {
    const root = new FakeDir("library");
    root.children.set("builder", new FakeFile("builder") as unknown as FakeFile); // a FILE where the folder goes
    const done = await commitSheet(root, "icon-sheet.svg", SVG);
    expect(done.ok).toBe(false);
    if (done.ok) return;
    expect(done.reason).not.toBe("");
  });

  it("an existing builder/ folder is reused, not recreated", async () => {
    const root = new FakeDir("library");
    const existing = new FakeDir("builder");
    existing.children.set("old.svg", new FakeFile("old.svg", 5, 1, "<svg/>"));
    root.children.set("builder", existing);
    const done = await commitSheet(root, "new.svg", SVG);
    expect(done.ok).toBe(true);
    expect(existing.children.has("old.svg")).toBe(true);
  });
});
