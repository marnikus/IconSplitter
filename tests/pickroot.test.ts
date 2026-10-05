// pickroot.test.ts — RULE 4/10: one way to point the app at a folder. The pick
// captures the folder's real path from the clipboard (see I-35), and a pick in
// any tab behaves the same: a cancel is a cancel, and a clipboard problem never
// costs the user the folder they just chose.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adoptCopiedPath } from "../src/lib/clipboardpath";
import { loadRootPath } from "../src/lib/rootpath";
import { pickRootWithPath } from "../src/ui/pickroot";
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
    expect(picked?.handle.name).toBe(ROOT);
    expect(picked?.path).toBe(FULL);
    expect(picked?.how).toBe("copied");
    expect(loadRootPath(ROOT)).toBe(FULL);
  });

  it("reads the clipboard after the dialog too, when the first read saw nothing", async () => {
    const reads: number[] = [];
    stubClipboard(async () => {
      reads.push(1);
      // empty before the dialog (the user had not copied yet), the path after
      return reads.length === 1 ? "" : FULL;
    });
    const picked = await pickRootWithPath();
    expect(reads.length).toBe(2);
    expect(picked?.path).toBe(FULL);
  });

  it("returns the handle with no path when the clipboard holds nothing useful", async () => {
    stubClipboard(async () => "icon-airplane-landing.png");
    const picked = await pickRootWithPath();
    expect(picked?.handle.name).toBe(ROOT);
    expect(picked?.path).toBe("");
    expect(picked?.how).toBeNull();
  });

  it("survives a clipboard that throws — the folder is still picked", async () => {
    stubClipboard(async () => { throw new Error("denied"); });
    const picked = await pickRootWithPath();
    expect(picked?.handle.name).toBe(ROOT);
    expect(picked?.path).toBe("");
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

// The adopt action itself is covered by clipboardpath.test.ts, but pickroot
// depends on it — this keeps the two honest about each other.
describe("pickroot and clipboardpath agree", () => {
  it("adopting twice is idempotent", async () => {
    stubClipboard(async () => FULL);
    await adoptCopiedPath(ROOT);
    await adoptCopiedPath(ROOT);
    expect(loadRootPath(ROOT)).toBe(FULL);
  });
});
