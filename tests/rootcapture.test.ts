// rootcapture.test.ts — RULE 4/13: a capture the pick missed can still land,
// and only ever from the user's own clipboard, on the user's own gesture (I-52).
// Two channels, one rule each: `Rescan` re-attempts ONE exact-match capture for
// the root on screen, and a `paste` by the user adopts the text for that root
// when its leaf is the root's own name. Anything else — a pasted parent folder,
// a pasted word, a URL, a leaf-only copy — is ignored and writes nothing.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRootPath, loadRootPathInfo, ROOT_PATH_KEY, saveRootPathInfo } from "../src/lib/rootpath";
import { bindPasteCapture, captureFromPaste, retryCapture } from "../src/ui/rootcapture";

const ROOT = "_split_output";
const FULL = "F:\\Stocks 2026\\icons testing\\single\\test_processing_2\\_split_output";
const PARENT = "F:\\Stocks 2026\\icons testing\\single\\test_processing_2";

function stubClipboard(readText: () => Promise<string>): () => void {
  Object.defineProperty(navigator, "clipboard", { value: { readText }, configurable: true });
  return () => { Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }); };
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
});

describe("captureFromPaste — the user's own Ctrl+V (I-52)", () => {
  it("adopts a pasted path whose leaf IS the root on screen", () => {
    expect(captureFromPaste(FULL, ROOT)).toEqual({ path: FULL, how: "copied" });
    expect(loadRootPath(ROOT)).toBe(FULL);
  });

  it("forgives Explorer's quotes and a trailing backslash", () => {
    expect(captureFromPaste(`"${FULL}\\`, ROOT)).toEqual({ path: FULL, how: "copied" });
  });

  it("ignores a pasted PARENT folder — the picker's guess rule does not apply here", () => {
    expect(captureFromPaste(PARENT, ROOT)).toBeNull();
    expect(localStorage.getItem(ROOT_PATH_KEY)).toBeNull();
  });

  it("ignores a pasted word, a URL, markup and an empty paste", () => {
    expect(captureFromPaste("hello", ROOT)).toBeNull();
    expect(captureFromPaste("https://example.com/x", ROOT)).toBeNull();
    expect(captureFromPaste("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>", ROOT)).toBeNull();
    expect(captureFromPaste("", ROOT)).toBeNull();
    expect(localStorage.getItem(ROOT_PATH_KEY)).toBeNull();
  });

  it("does nothing at all when no folder is on screen", () => {
    expect(captureFromPaste(FULL, "")).toBeNull();
  });
});

describe("retryCapture — Rescan's one extra attempt (I-52)", () => {
  it("captures the path when the root has none, and says the one line", async () => {
    stubClipboard(async () => `"${FULL}"`);
    expect(await retryCapture(ROOT)).toBe(`Folder path captured: ${FULL}`);
    expect(loadRootPath(ROOT)).toBe(FULL);
  });

  it("reads nothing and says nothing when the path is already known", async () => {
    const read = vi.fn(async () => FULL);
    stubClipboard(read);
    await retryCapture(ROOT); // first call captures it
    expect(await retryCapture(ROOT)).toBeNull();
    expect(read).toHaveBeenCalledTimes(1); // the second call never touched the clipboard
  });

  it("replaces a COMPLETED guess with an exact match — a guess is not a capture", async () => {
    saveRootPathInfo(ROOT, `${PARENT}\\wrong\\${ROOT}`, "completed");
    stubClipboard(async () => FULL);
    expect(await retryCapture(ROOT)).toBe(`Folder path captured: ${FULL}`);
    expect(loadRootPathInfo(ROOT)).toEqual({ path: FULL, how: "copied" });
  });

  it("keeps the completed guess when the clipboard cannot name the folder exactly", async () => {
    const guess = `${PARENT}\\wrong\\${ROOT}`;
    saveRootPathInfo(ROOT, guess, "completed");
    stubClipboard(async () => PARENT);
    expect(await retryCapture(ROOT)).toBeNull();
    expect(loadRootPathInfo(ROOT)).toEqual({ path: guess, how: "completed" });
  });

  it("stays quiet when the clipboard cannot name this folder", async () => {
    stubClipboard(async () => PARENT); // a parent is not an exact match, and not a guess here
    expect(await retryCapture(ROOT)).toBeNull();
    expect(localStorage.getItem(ROOT_PATH_KEY)).toBeNull();
  });

  it("never touches the clipboard without the user's own gesture (RULE 13)", async () => {
    const read = vi.fn(async () => `"${FULL}"`);
    stubClipboard(read);
    // what the browser reports on a boot-time scan: no activation at all
    Object.defineProperty(navigator, "userActivation", { value: { isActive: false }, configurable: true });
    expect(await retryCapture(ROOT)).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(localStorage.getItem(ROOT_PATH_KEY)).toBeNull();
    Object.defineProperty(navigator, "userActivation", { value: undefined, configurable: true });
  });

  it("stays quiet when the read is blocked", async () => {
    stubClipboard(async () => { throw new Error("denied"); });
    expect(await retryCapture(ROOT)).toBeNull();
  });
});

describe("bindPasteCapture — the listener the row mounts (I-52)", () => {
  /** One paste event, as the browser delivers it when the user presses Ctrl+V. */
  function paste(text: string, target: Element = document.body): void {
    const event = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
    event.clipboardData = { getData: (type: string) => (type === "text/plain" ? text : "") };
    target.dispatchEvent(event);
  }

  it("captures the path from a paste anywhere in the page", () => {
    const off = bindPasteCapture(ROOT);
    paste(`"${FULL}"`);
    expect(loadRootPath(ROOT)).toBe(FULL);
    off();
  });

  it("ignores a paste made inside a text field — the app's own inputs keep their text", () => {
    const off = bindPasteCapture(ROOT);
    const input = document.createElement("input");
    document.body.appendChild(input);
    paste(FULL, input);
    expect(loadRootPath(ROOT)).toBe("");
    off();
    input.remove();
  });

  it("stops listening once the row is gone", () => {
    const off = bindPasteCapture(ROOT);
    off();
    paste(FULL);
    expect(loadRootPath(ROOT)).toBe("");
  });
});
