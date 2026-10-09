// rootcapture.test.ts — RULE 4/13: a capture the pick missed can still land,
// and only ever from the user's own clipboard, on the user's own gesture (I-52).
// Two channels, one rule each: `Rescan` re-attempts ONE exact-match capture for
// the root on screen, and a `paste` by the user adopts the text for that root
// when its leaf is the root's own name. Anything else — a pasted parent folder,
// a pasted word, a URL, a leaf-only copy — is ignored and writes nothing.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAppCopiedPath, clearRejectedClipboardPaths } from "../src/lib/clipboardpath";
import { loadRootPath, loadRootPathInfo, ROOT_PATH_KEY } from "../src/lib/rootpath";
import { clearKnownRoots, deriveRootPath, rememberKnownRoot } from "../src/ui/knownroots";
import type { DirHandleLike } from "../src/lib/fs";
import { bindPasteCapture, captureFromPaste, retryCapture } from "../src/ui/rootcapture";

const ROOT = "_split_output";
const FULL = "F:\\Stocks 2026\\icons testing\\single\\test_processing_2\\_split_output";
const PARENT = "F:\\Stocks 2026\\icons testing\\single\\test_processing_2";

function root(name = ROOT): DirHandleLike {
  return { kind: "directory", name } as unknown as DirHandleLike;
}

function stubClipboard(readText: () => Promise<string>): () => void {
  Object.defineProperty(navigator, "clipboard", { value: { readText }, configurable: true });
  return () => { Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }); };
}

beforeEach(() => {
  localStorage.clear();
  clearAppCopiedPath();
  clearRejectedClipboardPaths();
  clearKnownRoots();
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
});

describe("captureFromPaste — the user's own Ctrl+V (I-52)", () => {
  it("adopts a pasted path whose leaf IS the root on screen", async () => {
    expect(await captureFromPaste(FULL, root())).toEqual({ path: FULL, how: "copied" });
    expect(loadRootPath(ROOT)).toBe(FULL);
  });

  it("forgives Explorer's quotes and a trailing backslash", async () => {
    expect(await captureFromPaste(`"${FULL}\\`, root())).toEqual({ path: FULL, how: "copied" });
  });

  it("ignores a pasted PARENT folder — the picker's guess rule does not apply here", async () => {
    expect(await captureFromPaste(PARENT, root())).toBeNull();
    expect(localStorage.getItem(ROOT_PATH_KEY)).toBeNull();
  });

  it("ignores a pasted word, a URL, markup and an empty paste", async () => {
    expect(await captureFromPaste("hello", root())).toBeNull();
    expect(await captureFromPaste("https://example.com/x", root())).toBeNull();
    expect(await captureFromPaste("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>", root())).toBeNull();
    expect(await captureFromPaste("", root())).toBeNull();
    expect(localStorage.getItem(ROOT_PATH_KEY)).toBeNull();
  });

  it("does nothing at all when no folder is on screen", async () => {
    expect(await captureFromPaste(FULL, root(""))).toBeNull();
  });
});

describe("retryCapture — Rescan's one extra attempt (I-52)", () => {
  it("captures the path when the root has none, and says the one line", async () => {
    stubClipboard(async () => `"${FULL}"`);
    expect(await retryCapture(root())).toBe(`Folder path captured: ${FULL}`);
    expect(loadRootPath(ROOT)).toBe(FULL);
  });

  it("reads nothing and says nothing when the path is already known", async () => {
    const read = vi.fn(async () => FULL);
    stubClipboard(read);
    await retryCapture(root()); // first call captures it
    expect(await retryCapture(root())).toBeNull();
    expect(read).toHaveBeenCalledTimes(1); // the second call never touched the clipboard
  });

  it("replaces an older build's stored `completed` guess with an exact match — a guess is no capture", async () => {
    localStorage.setItem(ROOT_PATH_KEY, JSON.stringify({ [ROOT]: { path: `${PARENT}\\wrong\\${ROOT}`, how: "completed" } }));
    stubClipboard(async () => FULL);
    expect(await retryCapture(root())).toBe(`Folder path captured: ${FULL}`);
    expect(loadRootPathInfo(ROOT)).toEqual({ path: FULL, how: "copied" });
  });

  it("hands the capture to the known handle of that name, so the next pick inside it is exact", async () => {
    const parent = { kind: "directory", name: ROOT, resolve: async () => ["2026-10"] } as unknown as DirHandleLike;
    rememberKnownRoot(parent, "");
    stubClipboard(async () => FULL);
    await retryCapture(parent);
    expect(await deriveRootPath({ kind: "directory", name: "2026-10" } as DirHandleLike))
      .toEqual({ kind: "derived", path: `${FULL}\\2026-10` });
  });

  it("stays quiet when the clipboard cannot name this folder", async () => {
    stubClipboard(async () => PARENT); // a parent is not an exact match, and not a guess here
    expect(await retryCapture(root())).toBeNull();
    expect(localStorage.getItem(ROOT_PATH_KEY)).toBeNull();
  });

  it("never touches the clipboard without the user's own gesture (RULE 13)", async () => {
    const read = vi.fn(async () => `"${FULL}"`);
    stubClipboard(read);
    // what the browser reports on a boot-time scan: no activation at all
    Object.defineProperty(navigator, "userActivation", { value: { isActive: false }, configurable: true });
    expect(await retryCapture(root())).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(localStorage.getItem(ROOT_PATH_KEY)).toBeNull();
    Object.defineProperty(navigator, "userActivation", { value: undefined, configurable: true });
  });

  it("stays quiet when the read is blocked", async () => {
    stubClipboard(async () => { throw new Error("denied"); });
    expect(await retryCapture(root())).toBeNull();
  });
});

describe("bindPasteCapture — the listener the row mounts (I-52)", () => {
  /** One paste event, as the browser delivers it when the user presses Ctrl+V. */
  async function paste(text: string, target: Element = document.body): Promise<void> {
    const event = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
    event.clipboardData = { getData: (type: string) => (type === "text/plain" ? text : "") };
    target.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 0)); // captureFromPaste verifies handles asynchronously
  }

  it("captures the path from a paste anywhere in the page", async () => {
    const off = bindPasteCapture(root());
    await paste(`"${FULL}"`);
    expect(loadRootPath(ROOT)).toBe(FULL);
    off();
  });

  it("ignores a paste made inside a text field — the app's own inputs keep their text", async () => {
    const off = bindPasteCapture(root());
    const input = document.createElement("input");
    document.body.appendChild(input);
    await paste(FULL, input);
    expect(loadRootPath(ROOT)).toBe("");
    off();
    input.remove();
  });

  it("stops listening once the row is gone", async () => {
    const off = bindPasteCapture(root());
    off();
    await paste(FULL);
    expect(loadRootPath(ROOT)).toBe("");
  });
});
