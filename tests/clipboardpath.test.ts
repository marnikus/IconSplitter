// clipboardpath.test.ts — RULE 4/9: the picked folder's real path can only come
// from Explorer's "Copy as path" (the File System Access API never reveals the
// drive), so reading the clipboard is a normal, guarded action and the text is
// adopted only when it really names the picked folder.
import { beforeEach, describe, expect, it } from "vitest";
import { adoptCopiedPath, readCopiedText } from "../src/lib/clipboardpath";
import { loadRootPath, loadRootPathInfo, ROOT_PATH_KEY, subscribeRootPaths } from "../src/lib/rootpath";

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

describe("adoptCopiedPath", () => {
  it("adopts the copied path when its leaf is the picked folder", async () => {
    stubClipboard(async () => `"${FULL}\\"`); // Explorer's quotes and trailing slash
    expect(await adoptCopiedPath(ROOT)).toBe(FULL);
    expect(loadRootPath(ROOT)).toBe(FULL);
    expect(loadRootPathInfo(ROOT).how).toBe("copied");
  });

  it("completes the path from the copied parent folder and says so", async () => {
    stubClipboard(async () => PARENT);
    expect(await adoptCopiedPath(ROOT)).toBe(`${PARENT}\\${ROOT}`);
    expect(loadRootPathInfo(ROOT)).toMatchObject({ path: `${PARENT}\\${ROOT}`, how: "completed" });
  });

  it("refuses a copied file path and a copied non-path, writing nothing", async () => {
    stubClipboard(async () => "F:\\Stocks 2026\\icons testing\\single\\icon-airplane-landing.png");
    expect(await adoptCopiedPath(ROOT)).toBeNull();
    refuseClipboard();
    stubClipboard(async () => "hello");
    expect(await adoptCopiedPath(ROOT)).toBeNull();
    expect(localStorage.getItem(ROOT_PATH_KEY)).toBeNull();
  });

  it("stays silent when adoption changes nothing", async () => {
    stubClipboard(async () => FULL);
    expect(await adoptCopiedPath(ROOT)).toBe(FULL);
    // the same text again is not a change: no new revision, no announcement
    expect(await adoptCopiedPath(ROOT)).toBe(FULL);
    let notifications = 0;
    const stop = subscribeRootPaths(() => { notifications++; });
    expect(await adoptCopiedPath(ROOT)).toBe(FULL);
    stop();
    expect(notifications).toBe(0);
  });

  it("refuses an SVG document or a URL on the clipboard, writing nothing", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25">';
    stubClipboard(async () => svg);
    expect(await adoptCopiedPath(ROOT)).toBeNull();
    stubClipboard(async () => "http://www.w3.org/2000/svg");
    expect(await adoptCopiedPath(ROOT)).toBeNull();
    expect(localStorage.getItem(ROOT_PATH_KEY)).toBeNull();
  });

  it("reports nothing when the clipboard cannot be read at all", async () => {
    expect(await adoptCopiedPath(ROOT)).toBeNull();
  });
});
