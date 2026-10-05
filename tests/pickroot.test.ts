// pickroot.test.ts — RULE 4/10: one way to point the app at a folder. The pick
// captures the folder's real path from the clipboard (see I-35), and a pick in
// any tab behaves the same: a cancel is a cancel, and a clipboard problem never
// costs the user the folder they just chose. Nothing here is announced any more
// — the path itself appears in the tab's own row (design 2026-10-05-folder-ui).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRootPath } from "../src/lib/rootpath";
import { pickFolderFor, pickRootWithPath } from "../src/ui/pickroot";
import type { DirHandleLike } from "../src/lib/fs";

const ROOT = "test_processing";
const FULL = "F:\\Stocks 2026\\icons testing\\single\\test_processing";

function handle(name: string): DirHandleLike {
  return { kind: "directory", name } as DirHandleLike;
}

function usePicker(pick: () => Promise<DirHandleLike | null>): void {
  Object.defineProperty(window, "showDirectoryPicker", { value: pick, configurable: true });
}

function stubClipboard(readText: () => Promise<string>): void {
  Object.defineProperty(navigator, "clipboard", { value: { readText }, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  usePicker(async () => handle(ROOT));
});

describe("pickRootWithPath", () => {
  it("adopts the copied path of the folder the user picked", async () => {
    stubClipboard(async () => `"${FULL}\\"`);
    const picked = await pickRootWithPath();
    expect(picked?.name).toBe(ROOT);
    expect(loadRootPath(ROOT)).toBe(FULL);
  });

  it("reads the clipboard after the dialog too, when the first read saw nothing", async () => {
    const reads: number[] = [];
    stubClipboard(async () => {
      reads.push(1);
      // empty before the dialog (the user had not copied yet), the path after
      return reads.length === 1 ? "" : FULL;
    });
    expect(await pickRootWithPath()).not.toBeNull();
    expect(reads.length).toBe(2);
    expect(loadRootPath(ROOT)).toBe(FULL);
  });

  it("returns the picked folder with no path when the clipboard did not name it", async () => {
    stubClipboard(async () => "F:\\Stocks 2026\\icons testing\\single"); // the parent
    const picked = await pickRootWithPath();
    expect(picked?.name).toBe(ROOT);
    expect(loadRootPath(ROOT)).toBe("");
  });

  it("survives a clipboard that throws — the folder is still picked", async () => {
    stubClipboard(async () => { throw new Error("denied"); });
    const picked = await pickRootWithPath();
    expect(picked?.name).toBe(ROOT);
    expect(loadRootPath(ROOT)).toBe("");
  });

  it("returns null on cancel (and adopts nothing)", async () => {
    usePicker(async () => null);
    stubClipboard(async () => FULL);
    expect(await pickRootWithPath()).toBeNull();
    expect(loadRootPath(ROOT)).toBe("");
  });

  it("reads the clipboard only for the pre-read when the pick is cancelled", async () => {
    const spy = vi.fn(async () => FULL);
    usePicker(async () => null);
    stubClipboard(spy);
    expect(await pickRootWithPath()).toBeNull();
    // one pre-read (the click's activation), no second read, nothing stored
    expect(spy).toHaveBeenCalledTimes(1);
    expect(loadRootPath(ROOT)).toBe("");
  });

  it("does not read the clipboard after a failed pick either", async () => {
    const spy = vi.fn(async () => "");
    usePicker(async () => { throw new Error("no handle"); });
    stubClipboard(spy);
    expect(await pickRootWithPath()).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1); // pre-read only
  });
});

describe("pickFolderFor — the whole step every caller needs", () => {
  it("hands the picked folder to the caller (which stores or scans with it)", async () => {
    const taken: string[] = [];
    const picked = await pickFolderFor((h) => { taken.push(h.name); });
    expect(picked?.name).toBe(ROOT);
    expect(taken).toEqual([ROOT]);
  });

  it("takes nothing and returns null when the user cancels", async () => {
    usePicker(async () => null);
    const take = vi.fn();
    expect(await pickFolderFor(take)).toBeNull();
    expect(take).not.toHaveBeenCalled();
  });
});
