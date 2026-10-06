// clipboardpath.test.ts — RULE 4/9: the picked folder's real path can only come
// from Explorer's "Copy as path" (the File System Access API never reveals the
// drive), so reading the clipboard is a normal, guarded action and the text is
// adopted only when it really names the picked folder.
import { beforeEach, describe, expect, it } from "vitest";
import { adoptCopiedText, readClipboardText } from "../src/lib/clipboardpath";
import { loadRootPath, ROOT_PATH_KEY } from "../src/lib/rootpath";

const ROOT = "test_processing";
const FULL = "F:\\Stocks 2026\\icons testing\\single\\test_processing";
const PARENT = "F:\\Stocks 2026\\icons testing\\single";

beforeEach(() => {
  localStorage.clear();
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

describe("adoptCopiedText — the pick-time capture (I-35)", () => {
  it("adopts the copied path when its leaf is the picked folder", () => {
    expect(adoptCopiedText(ROOT, `"${FULL}\\"`)).toEqual({ path: FULL, how: "copied" }); // Explorer's quotes
    expect(loadRootPath(ROOT)).toBe(FULL);
  });

  it("completes the path from the copied parent folder and says so", () => {
    expect(adoptCopiedText(ROOT, PARENT)).toEqual({ path: `${PARENT}\\${ROOT}`, how: "completed" });
  });

  it("refuses a copied file path and a copied non-path, writing nothing", () => {
    expect(adoptCopiedText(ROOT, "F:\\Stocks 2026\\icons testing\\single\\icon-airplane-landing.png"))
      .toEqual({ path: "", how: null });
    expect(adoptCopiedText(ROOT, "hello")).toEqual({ path: "", how: null });
    expect(localStorage.getItem(ROOT_PATH_KEY)).toBeNull();
  });

  it("refuses an SVG document or a URL on the clipboard, writing nothing", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25">';
    expect(adoptCopiedText(ROOT, svg)).toEqual({ path: "", how: null });
    expect(adoptCopiedText(ROOT, "http://www.w3.org/2000/svg")).toEqual({ path: "", how: null });
    expect(localStorage.getItem(ROOT_PATH_KEY)).toBeNull();
  });
});
