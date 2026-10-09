// rootcapture.test.ts — RULE 4/13: a capture the pick missed can still land,
// and only ever from the user's own clipboard, on the user's own gesture (I-52).
// Two channels, one rule set: `Rescan` re-attempts ONE capture for the root on
// screen, and a `paste` by the user adopts the text for that root when it names
// it — exactly, or as the parent of a folder one level inside it (the third
// report, 2026-10-09). Anything else — an unrelated folder, a word, a URL,
// markup — is ignored and writes nothing. The capture binds the root's HANDLE:
// a same-named folder never sees it (I-63).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirHandleLike } from "../src/lib/fs";
import { boundRootPathInfo, clearKnownRoots, deriveRootPath, rememberKnownRoot } from "../src/lib/knownroots";
import { bindPasteCapture, captureFromPaste, retryCapture } from "../src/ui/rootcapture";

const ROOT = "_split_output";
const FULL = "F:\\Stocks 2026\\icons testing\\single\\test_processing_2\\_split_output";
const PARENT = "F:\\Stocks 2026\\icons testing\\single\\test_processing_2";

function dir(name: string, resolve?: (other: unknown) => Promise<string[] | null>): DirHandleLike {
  const handle: Record<string, unknown> = { kind: "directory", name };
  if (resolve) handle.resolve = resolve;
  return handle as unknown as DirHandleLike;
}

function stubClipboard(readText: () => Promise<string>): void {
  Object.defineProperty(navigator, "clipboard", { value: { readText }, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
  clearKnownRoots();
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
});

describe("captureFromPaste — the user's own Ctrl+V (I-52)", () => {
  it("adopts a pasted path whose leaf IS the root on screen", async () => {
    const root = dir(ROOT);
    expect(await captureFromPaste(FULL, root)).toEqual({ path: FULL, how: "copied" });
    expect(boundRootPathInfo(root)).toEqual({ path: FULL, how: "copied" });
  });

  it("forgives Explorer's quotes and a trailing backslash", async () => {
    expect(await captureFromPaste(`"${FULL}\\`, dir(ROOT))).toEqual({ path: FULL, how: "copied" });
  });

  it("adopts the PARENT of a pasted child path — the third report (one level down)", async () => {
    // the root on screen is `test_process_3`; the user pasted the path of its
    // `_split_output` — same root, one level down, and the parent is exact
    const root = dir("test_process_3");
    const copied = "F:\\Stocks 2026\\icons testing\\single\\test_process_3\\_split_output";
    expect(await captureFromPaste(copied, root))
      .toEqual({ path: "F:\\Stocks 2026\\icons testing\\single\\test_process_3", how: "derived" });
  });

  it("ignores a pasted UNRELATED folder — nothing is ever completed (I-59)", async () => {
    expect(await captureFromPaste(PARENT, dir(ROOT))).toBeNull(); // a parent is not this folder
    expect(await captureFromPaste("F:\\a\\split_03\\export", dir("test_process_3"))).toBeNull();
  });

  it("ignores a pasted word, a URL, markup and an empty paste", async () => {
    const root = dir(ROOT);
    expect(await captureFromPaste("hello", root)).toBeNull();
    expect(await captureFromPaste("https://example.com/x", root)).toBeNull();
    expect(await captureFromPaste("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>", root)).toBeNull();
    expect(await captureFromPaste("", root)).toBeNull();
    expect(boundRootPathInfo(root)).toEqual({ path: "", how: null });
  });

  it("does nothing at all when no folder is on screen", async () => {
    expect(await captureFromPaste(FULL, null)).toBeNull();
  });

  it("binds the root on screen only — a same-named folder keeps its own path", async () => {
    const mine = dir(ROOT);
    const other = dir(ROOT);
    rememberKnownRoot(other, "F:\\elsewhere\\_split_output");
    await captureFromPaste(FULL, mine);
    expect(boundRootPathInfo(other).path).toBe("F:\\elsewhere\\_split_output");
  });
});

describe("retryCapture — Rescan's one extra attempt (I-52)", () => {
  it("captures the path when the root has none, and says the one line", async () => {
    const root = dir(ROOT);
    stubClipboard(async () => `"${FULL}"`);
    expect(await retryCapture(root)).toBe(`Folder path captured: ${FULL}`);
    expect(boundRootPathInfo(root).path).toBe(FULL);
  });

  it("reads nothing and says nothing when the path is already known", async () => {
    const root = dir(ROOT);
    rememberKnownRoot(root, FULL);
    const read = vi.fn(async () => FULL);
    stubClipboard(read);
    expect(await retryCapture(root)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("hands the capture to the root on screen, so the next pick inside it is exact", async () => {
    const root = dir(ROOT, async () => ["2026-10"]);
    stubClipboard(async () => FULL);
    await retryCapture(root);
    expect(await deriveRootPath(dir("2026-10"))).toBe(`${FULL}\\2026-10`);
  });

  it("stays quiet when the clipboard cannot name this folder", async () => {
    stubClipboard(async () => PARENT); // a parent is not this folder
    expect(await retryCapture(dir(ROOT))).toBeNull();
  });

  it("never touches the clipboard without the user's own gesture (RULE 13)", async () => {
    const read = vi.fn(async () => `"${FULL}"`);
    stubClipboard(read);
    // what the browser reports on a boot-time scan: no activation at all
    Object.defineProperty(navigator, "userActivation", { value: { isActive: false }, configurable: true });
    expect(await retryCapture(dir(ROOT))).toBeNull();
    expect(read).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "userActivation", { value: undefined, configurable: true });
  });

  it("stays quiet when the read is blocked", async () => {
    stubClipboard(async () => { throw new Error("denied"); });
    expect(await retryCapture(dir(ROOT))).toBeNull();
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
    const root = dir(ROOT);
    const off = bindPasteCapture(root);
    paste(`"${FULL}"`);
    expect(boundRootPathInfo(root).path).toBe(FULL);
    off();
  });

  it("ignores a paste made inside a text field — the app's own inputs keep their text", () => {
    const root = dir(ROOT);
    const off = bindPasteCapture(root);
    const input = document.createElement("input");
    document.body.appendChild(input);
    paste(FULL, input);
    expect(boundRootPathInfo(root).path).toBe("");
    off();
    input.remove();
  });

  it("stops listening once the row is gone", () => {
    const root = dir(ROOT);
    const off = bindPasteCapture(root);
    off();
    paste(FULL);
    expect(boundRootPathInfo(root).path).toBe("");
  });
});
