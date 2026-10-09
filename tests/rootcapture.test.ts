// rootcapture.test.ts — RULE 4/13: a capture the pick missed can still land,
// and only ever from the user's own clipboard, on the user's own gesture (I-52).
// Two channels, one rule each: `Rescan` re-attempts a capture for the folder on
// screen, and a `paste` by the user adopts the text for that folder when its
// leaf is the folder's own name. Both write to the HANDLE, so a capture repairs
// the folder it was made for and cannot reach a lookalike (I-63/D4).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pathFor, peekPath, rememberPath, resetPathMemory, type PathStore } from "../src/lib/pathmemory";
import { FakeDir } from "./helpers/fakefs";
import type { DirHandleLike } from "../src/lib/fs";
import { bindPasteCapture, captureFromPaste, retryCapture } from "../src/ui/rootcapture";

const ROOT = "_split_output";
const FULL = "F:\\Stocks 2026\\icons testing\\single\\test_processing_2\\_split_output";
const PARENT = "F:\\Stocks 2026\\icons testing\\single\\test_processing_2";

const emptyStore = (): PathStore => ({ read: async () => [], write: async () => undefined });

function stubClipboard(readText: () => Promise<string>): () => void {
  Object.defineProperty(navigator, "clipboard", { value: { readText }, configurable: true });
  return () => { Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }); };
}

beforeEach(() => {
  localStorage.clear();
  resetPathMemory(emptyStore());
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
});

describe("captureFromPaste — the user's own Ctrl+V (I-52)", () => {
  it("adopts a pasted path whose leaf IS the folder on screen", async () => {
    const root = new FakeDir(ROOT);
    expect(await captureFromPaste(FULL, root)).toEqual({ path: FULL, how: "copied" });
    expect((await pathFor(root)).path).toBe(FULL);
  });

  it("forgives Explorer's quotes and a trailing backslash", async () => {
    expect(await captureFromPaste(`"${FULL}\\`, new FakeDir(ROOT))).toEqual({ path: FULL, how: "copied" });
  });

  it("ignores a pasted PARENT folder — the picker's derivation does not apply here", async () => {
    expect(await captureFromPaste(PARENT, new FakeDir(ROOT))).toBeNull();
  });

  it("ignores a pasted word, a URL, markup and an empty paste", async () => {
    const root = new FakeDir(ROOT);
    for (const junk of ["hello", "https://example.com/x", '<svg xmlns="http://www.w3.org/2000/svg"></svg>', ""]) {
      expect(await captureFromPaste(junk, root)).toBeNull();
    }
    expect(peekPath(root)).toEqual({ path: "", how: null });
  });

  it("does nothing at all when no folder is on screen", async () => {
    expect(await captureFromPaste(FULL, null)).toBeNull();
  });

  it("replaces a wrong capture for its own folder, and only for that folder", async () => {
    const wrong = new FakeDir(ROOT);
    const other = new FakeDir(ROOT); // a different tree, the same name
    await rememberPath(wrong, "F:\\elsewhere\\_split_output");
    await rememberPath(other, `${PARENT}\\_split_output`);
    await captureFromPaste(FULL, wrong); // the user pastes the real one
    expect((await pathFor(wrong)).path).toBe(FULL);
    expect((await pathFor(other)).path).toBe(`${PARENT}\\_split_output`); // untouched
  });
});

describe("retryCapture — Rescan's one extra attempt (I-52)", () => {
  it("captures the path when the folder has none, and says the one line", async () => {
    const root = new FakeDir(ROOT);
    stubClipboard(async () => `"${FULL}"`);
    expect(await retryCapture(root)).toBe(`Folder path captured: ${FULL}`);
    expect((await pathFor(root)).path).toBe(FULL);
  });

  it("reads nothing and says nothing when the folder already has an exact capture", async () => {
    const root = new FakeDir(ROOT);
    const read = vi.fn(async () => FULL);
    stubClipboard(read);
    await retryCapture(root); // first call captures it
    expect(await retryCapture(root)).toBeNull();
    expect(read).toHaveBeenCalledTimes(1); // the second call never touched the clipboard
  });

  it("upgrades a DERIVED path to an exact capture — a derivation is not a copy", async () => {
    const parent = new FakeDir("test_processing_2");
    const child = await parent.getDirectoryHandle(ROOT, { create: true });
    await rememberPath(parent, PARENT);
    expect((await pathFor(child)).how).toBe("derived");
    stubClipboard(async () => FULL);
    expect(await retryCapture(child)).toBe(`Folder path captured: ${FULL}`);
    expect((await pathFor(child)).how).toBe("copied");
  });

  it("names the folder it captured, so the next pick inside it is exact", async () => {
    const root = new FakeDir(ROOT);
    const month = await root.getDirectoryHandle("2026-10", { create: true });
    stubClipboard(async () => FULL);
    await retryCapture(root);
    expect((await pathFor(month)).path).toBe(`${FULL}\\2026-10`);
  });

  it("stays quiet when the clipboard cannot name this folder", async () => {
    stubClipboard(async () => PARENT); // a parent is not an exact match, and not a guess here
    expect(await retryCapture(new FakeDir(ROOT))).toBeNull();
  });

  it("stays quiet when there is no folder at all", async () => {
    expect(await retryCapture(null)).toBeNull();
  });

  it("never touches the clipboard without the user's own gesture (RULE 13)", async () => {
    const read = vi.fn(async () => `"${FULL}"`);
    stubClipboard(read);
    // what the browser reports on a boot-time scan: no activation at all
    Object.defineProperty(navigator, "userActivation", { value: { isActive: false }, configurable: true });
    expect(await retryCapture(new FakeDir(ROOT))).toBeNull();
    expect(read).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "userActivation", { value: undefined, configurable: true });
  });

  it("stays quiet when the read is blocked", async () => {
    stubClipboard(async () => { throw new Error("denied"); });
    expect(await retryCapture(new FakeDir(ROOT))).toBeNull();
  });
});

describe("bindPasteCapture — the listener the row mounts (I-52)", () => {
  const folderOf = (handle: DirHandleLike) => ({ name: handle.name, handle });

  /** One paste event, as the browser delivers it when the user presses Ctrl+V. */
  function paste(text: string, target: Element = document.body): void {
    const event = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
    event.clipboardData = { getData: (type: string) => (type === "text/plain" ? text : "") };
    target.dispatchEvent(event);
  }

  it("captures the path from a paste anywhere in the page", async () => {
    const root = new FakeDir(ROOT);
    const off = bindPasteCapture(folderOf(root));
    paste(`"${FULL}"`);
    off();
    expect((await pathFor(root)).path).toBe(FULL);
  });

  it("ignores a paste made inside a text field — the app's own inputs keep their text", async () => {
    const root = new FakeDir(ROOT);
    const off = bindPasteCapture(folderOf(root));
    const input = document.createElement("input");
    document.body.appendChild(input);
    paste(FULL, input);
    off();
    expect(peekPath(root)).toEqual({ path: "", how: null });
    input.remove();
  });

  it("stops listening once the row is gone", async () => {
    const root = new FakeDir(ROOT);
    const off = bindPasteCapture(folderOf(root));
    off();
    paste(FULL);
    expect(peekPath(root)).toEqual({ path: "", how: null });
  });

  it("does nothing while no folder is loaded", () => {
    expect(bindPasteCapture({ name: "", handle: null })).toBeInstanceOf(Function);
  });
});
