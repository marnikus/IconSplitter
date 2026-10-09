// clipboardpath.test.ts — RULE 4/9: the picked folder's real path can only come
// from Explorer's "Copy as path" (the File System Access API never reveals the
// drive), so reading the clipboard is a normal, guarded action and the text is
// adopted only when it really names the folder that was picked — for THAT
// handle, in the handle-keyed memory (I-63).
import { beforeEach, describe, expect, it } from "vitest";
import { adoptCopiedText, readClipboardText } from "../src/lib/clipboardpath";
import { pathFor, recordedPaths, resetPathMemory } from "../src/lib/pathmemory";
import { FakeDir } from "./helpers/fakefs";

const ROOT = "test_processing";
const FULL = "F:\\Stocks 2026\\icons testing\\single\\test_processing";
const PARENT = "F:\\Stocks 2026\\icons testing\\single";

beforeEach(() => {
  localStorage.clear();
  resetPathMemory({ read: async () => [], write: async () => undefined });
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
    stubClipboard(async () => { throw new Error("denied: not focused"); });
    // the row must be able to say "the browser blocked it" — not "nothing copied"
    expect(await readClipboardText()).toEqual({ text: "", state: "blocked" });
  });

  it("reports a browser without the clipboard API", async () => {
    expect(await readClipboardText()).toEqual({ text: "", state: "unsupported" });
  });
});

describe("adoptCopiedText — the pick-time capture (I-35)", () => {
  it("adopts the copied path when its leaf is the picked folder", async () => {
    const root = new FakeDir(ROOT);
    expect(await adoptCopiedText(root, `"${FULL}\\"`)).toEqual({ path: FULL, how: "copied" });
    expect((await pathFor(root)).path).toBe(FULL);
  });

  it("refuses a copied PARENT folder — nothing is completed into a guess (I-59)", async () => {
    const root = new FakeDir(ROOT);
    expect(await adoptCopiedText(root, PARENT)).toEqual({ path: "", how: null });
    expect(recordedPaths()).toEqual([]);
  });

  it("refuses a copied file path and a copied non-path, recording nothing", async () => {
    const root = new FakeDir(ROOT);
    expect(await adoptCopiedText(root, `${PARENT}\\icon-airplane-landing.png`)).toEqual({ path: "", how: null });
    expect(await adoptCopiedText(root, "hello")).toEqual({ path: "", how: null });
    expect(recordedPaths()).toEqual([]);
  });

  it("refuses an SVG document or a URL on the clipboard, recording nothing", async () => {
    const root = new FakeDir(ROOT);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25">';
    expect(await adoptCopiedText(root, svg)).toEqual({ path: "", how: null });
    expect(await adoptCopiedText(root, "http://www.w3.org/2000/svg")).toEqual({ path: "", how: null });
    expect(recordedPaths()).toEqual([]);
  });

  it("records the capture for the folder that was picked, not for its name", async () => {
    const picked = new FakeDir(ROOT);
    const sameNameElsewhere = new FakeDir(ROOT);
    await adoptCopiedText(picked, FULL);
    expect((await pathFor(picked)).path).toBe(FULL);
    expect(await pathFor(sameNameElsewhere)).toEqual({ path: "", how: null }); // another tree
  });
});
