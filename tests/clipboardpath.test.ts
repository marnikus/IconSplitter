// clipboardpath.test.ts — RULE 4/9: the picked folder's real path can only come
// from Explorer's "Copy as path" (the File System Access API never reveals the
// drive), so reading the clipboard is a normal, guarded action and the text is
// adopted only when it really names the picked folder — exactly (I-35) or as
// its direct parent (one level down, the third report 2026-10-09). The adopted
// path is bound to the picked folder's HANDLE, never to its name.
import { beforeEach, describe, expect, it } from "vitest";
import { adoptCopiedText, readClipboardText } from "../src/lib/clipboardpath";
import type { DirHandleLike } from "../src/lib/fs";
import { boundRootPathInfo, clearKnownRoots } from "../src/lib/knownroots";

const ROOT = "test_processing";
const FULL = "F:\\Stocks 2026\\icons testing\\single\\test_processing";
const PARENT = "F:\\Stocks 2026\\icons testing\\single";

function dir(name: string): DirHandleLike {
  return { kind: "directory", name } as DirHandleLike;
}

beforeEach(() => {
  localStorage.clear();
  clearKnownRoots();
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
});

function stubClipboard(readText: () => Promise<string>): void {
  Object.defineProperty(navigator, "clipboard", { value: { readText }, configurable: true });
}

describe("readClipboardText — the read says why it failed (I-52)", () => {
  it("hands over the text, or reports an empty clipboard as empty", async () => {
    stubClipboard(async () => `"${FULL}\\" `);
    expect(await readClipboardText()).toEqual({ text: `"${FULL}\\" `, state: "text" });
    stubClipboard(async () => "");
    expect(await readClipboardText()).toEqual({ text: "", state: "empty" });
  });

  it("tells a BLOCKED read apart from an empty clipboard", async () => {
    refuseClipboard();
    // the row must be able to say "the browser blocked it" — not "nothing copied"
    expect(await readClipboardText()).toEqual({ text: "", state: "blocked" });
  });

  it("reports a browser without the clipboard API", async () => {
    expect(await readClipboardText()).toEqual({ text: "", state: "unsupported" });
  });
});

function refuseClipboard(): void {
  stubClipboard(async () => { throw new Error("denied: not focused"); });
}

describe("adoptCopiedText — the capture binds the picked folder, not its name (I-35)", () => {
  it("adopts the copied path when its leaf is the picked folder", async () => {
    const handle = dir(ROOT);
    expect(await adoptCopiedText(handle, `"${FULL}\\"`)).toEqual({ path: FULL, how: "copied" }); // Explorer's quotes
    expect(boundRootPathInfo(handle)).toEqual({ path: FULL, how: "copied" });
  });

  it("adopts the parent when the copy is one level down inside the folder (third report)", async () => {
    const handle = dir("test_process_3");
    const copied = "F:\\Stocks 2026\\icons testing\\single\\test_process_3\\_split_output";
    expect(await adoptCopiedText(handle, copied))
      .toEqual({ path: "F:\\Stocks 2026\\icons testing\\single\\test_process_3", how: "derived" });
    expect(boundRootPathInfo(handle).path).toBe("F:\\Stocks 2026\\icons testing\\single\\test_process_3");
  });

  it("refuses a copied PARENT folder — nothing is completed into a guess (I-59)", async () => {
    expect(await adoptCopiedText(dir(ROOT), PARENT)).toEqual({ path: "", how: null });
    expect(boundRootPathInfo(dir(ROOT))).toEqual({ path: "", how: null });
  });

  it("never binds a same-named folder's capture onto another handle", async () => {
    const mine = dir(ROOT);
    const other = dir(ROOT);
    await adoptCopiedText(mine, FULL);
    expect(boundRootPathInfo(other)).toEqual({ path: "", how: null }); // not this folder
  });

  it("refuses a copied file path and a copied non-path, writing nothing", async () => {
    expect(await adoptCopiedText(dir(ROOT), "F:\\Stocks 2026\\icons testing\\single\\icon-airplane-landing.png"))
      .toEqual({ path: "", how: null });
    expect(await adoptCopiedText(dir(ROOT), "hello")).toEqual({ path: "", how: null });
  });

  it("refuses an SVG document or a URL on the clipboard, writing nothing", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25">';
    expect(await adoptCopiedText(dir(ROOT), svg)).toEqual({ path: "", how: null });
    expect(await adoptCopiedText(dir(ROOT), "http://www.w3.org/2000/svg")).toEqual({ path: "", how: null });
  });
});
