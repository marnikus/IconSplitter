// clipboardpath.test.ts — RULE 4/9: the picked folder's real path can only come
// from Explorer's "Copy as path" (the File System Access API never reveals the
// drive), so reading the clipboard is a normal, guarded action and the text is
// adopted only when it really names the picked folder — never completed into a
// guess (design 2026-10-05-folder-ui, D4).
import { beforeEach, describe, expect, it } from "vitest";
import { adoptCopiedText, readCopiedText } from "../src/lib/clipboardpath";
import { loadRootPath, ROOT_PATH_KEY, subscribeRootPaths } from "../src/lib/rootpath";

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

describe("readCopiedText", () => {
  it("reads the clipboard, and reports an empty one as nothing", async () => {
    stubClipboard(async () => `"${FULL}\\" `);
    expect(await readCopiedText()).toBe(`"${FULL}\\" `);
    stubClipboard(async () => "");
    expect(await readCopiedText()).toBe("");
  });

  it("reports \"none\" when there is no clipboard API or the read is refused", async () => {
    expect(await readCopiedText()).toBe("none"); // navigator.clipboard is undefined here
    refuseClipboard();
    expect(await readCopiedText()).toBe("none");
  });
});

function refuseClipboard(): void {
  stubClipboard(async () => { throw new Error("denied: not focused"); });
}

describe("adoptCopiedText — the text the pick already read", () => {
  it("adopts the copied path when its leaf is the picked folder, and remembers it", () => {
    expect(adoptCopiedText(ROOT, `"${FULL}\\"`)).toBe(FULL); // quotes + trailing slash
    expect(loadRootPath(ROOT)).toBe(FULL);
  });

  it("refuses the copied PARENT folder — the app completes nothing by guessing", () => {
    expect(adoptCopiedText(ROOT, PARENT)).toBe("");
    expect(loadRootPath(ROOT)).toBe("");
  });

  it("refuses a copied file path and a copied non-path, writing nothing", () => {
    expect(adoptCopiedText(ROOT, "F:\\Stocks 2026\\icons testing\\single\\icon-airplane-landing.png")).toBe("");
    expect(adoptCopiedText(ROOT, "hello")).toBe("");
    expect(localStorage.getItem(ROOT_PATH_KEY)).toBeNull();
  });

  it("refuses an SVG document or a URL on the clipboard, writing nothing", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25">';
    expect(adoptCopiedText(ROOT, svg)).toBe("");
    expect(adoptCopiedText(ROOT, "http://www.w3.org/2000/svg")).toBe("");
    expect(localStorage.getItem(ROOT_PATH_KEY)).toBeNull();
  });

  it("stays silent when adoption changes nothing", () => {
    expect(adoptCopiedText(ROOT, FULL)).toBe(FULL);
    let notifications = 0;
    const stop = subscribeRootPaths(() => { notifications++; });
    expect(adoptCopiedText(ROOT, FULL)).toBe(FULL); // the same text again is not a change
    stop();
    expect(notifications).toBe(0);
  });
});
