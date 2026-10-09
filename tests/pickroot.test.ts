// pickroot.test.ts — RULE 4/10: one way to point the app at a folder. The pick
// captures the folder's real path from the clipboard (see I-35), and a pick in
// any tab behaves the same: a cancel is a cancel, and a clipboard problem never
// costs the user the folder they just chose.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adoptCopiedText, clearAppCopiedPath, clearRejectedClipboardPaths } from "../src/lib/clipboardpath";
import { copyFolderText } from "../src/lib/copypath";
import { loadRootPath, loadRootPathInfo, ROOT_PATH_KEY, saveRootPathInfo } from "../src/lib/rootpath";
import { pickMessage, pickRootWithPath } from "../src/ui/pickroot";
import { captureFromPaste, retryCapture } from "../src/ui/rootcapture";
import { clearKnownRoots, rememberKnownRoot, updateKnownRootPath } from "../src/ui/knownroots";
import type { DirHandleLike } from "../src/lib/fs";

const ROOT = "test_processing";
const FULL = "F:\\Stocks 2026\\icons testing\\single\\test_processing";
const PROCESS_ROOT = "F:\\Stocks 2026\\icons testing\\single\\test_process_3";
const OUTPUT_ROOT = "_split_output";
const STALE_OUTPUT = "F:\\Stocks 2026\\icons testing\\single\\test_processing_2\\_split_output\\2026-10\\2026-10-08_18-46-23\\icon-bank-institution_AI_10\\split_03\\export\\test_process_3\\_split_output";

function handle(name: string): DirHandleLike {
  return { kind: "directory", name } as DirHandleLike;
}

function usePicker(pick: () => Promise<DirHandleLike | null>): void {
  Object.defineProperty(window, "showDirectoryPicker", { value: pick, configurable: true });
}

function stubClipboard(readText: () => Promise<string>): void {
  Object.defineProperty(navigator, "clipboard", { value: { readText }, configurable: true });
}

/**
 * A KNOWN folder: the handle the app already picked, whose `resolve` answers the
 * segments from itself down to the folder about to be picked (the real API is
 * `parent.resolve(child)`), or null when the pick is not below it.
 */
function ancestorOf(name: string, segments: string[] | null): DirHandleLike {
  return {
    kind: "directory", name,
    resolve: async () => segments,
  } as unknown as DirHandleLike;
}

/** The folder the app captured earlier in the session. */
const OUT = "F:\\Stocks 2026\\icons testing\\single\\test_processing_2\\_split_output";

beforeEach(() => {
  clearKnownRoots();
  clearAppCopiedPath();
  clearRejectedClipboardPaths();
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

  it("uses the known parent handle instead of a stale same-name clipboard path", async () => {
    rememberKnownRoot(ancestorOf("test_process_3", [OUTPUT_ROOT]), PROCESS_ROOT);
    saveRootPathInfo(OUTPUT_ROOT, STALE_OUTPUT);
    stubClipboard(async () => `"${STALE_OUTPUT}\\"`);
    usePicker(async () => handle(OUTPUT_ROOT));
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe(`${PROCESS_ROOT}\\${OUTPUT_ROOT}`);
    expect(loadRootPath(OUTPUT_ROOT)).toBe(`${PROCESS_ROOT}\\${OUTPUT_ROOT}`);
  });

  it("derives a selected parent from a previously named child", async () => {
    const childPath = `${PROCESS_ROOT}\\${OUTPUT_ROOT}`;
    rememberKnownRoot(handle(OUTPUT_ROOT), childPath);
    stubClipboard(async () => "");
    usePicker(async () => ancestorOf("test_process_3", [OUTPUT_ROOT]));
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe(PROCESS_ROOT);
    expect(loadRootPath("test_process_3")).toBe(PROCESS_ROOT);
  });

  it("clears an old path when the new pick cannot be verified", async () => {
    saveRootPathInfo(OUTPUT_ROOT, STALE_OUTPUT);
    stubClipboard(async () => "F:\\other\\parent");
    usePicker(async () => handle(OUTPUT_ROOT));
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe("");
    expect(loadRootPath(OUTPUT_ROOT)).toBe("");
  });

  it("does not re-adopt the stored same-name path when the new handle is unrelated", async () => {
    saveRootPathInfo(OUTPUT_ROOT, STALE_OUTPUT);
    stubClipboard(async () => STALE_OUTPUT);
    usePicker(async () => handle(OUTPUT_ROOT));
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe("");
    expect(loadRootPath(OUTPUT_ROOT)).toBe("");
  });

  it("keeps Rescan from resurrecting a rejected old path; explicit paste can still capture it", async () => {
    saveRootPathInfo(OUTPUT_ROOT, STALE_OUTPUT);
    stubClipboard(async () => STALE_OUTPUT);
    usePicker(async () => handle(OUTPUT_ROOT));
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe("");
    expect(await retryCapture(picked?.handle ?? null)).toBeNull();
    expect(loadRootPath(OUTPUT_ROOT)).toBe("");
    expect(await captureFromPaste(STALE_OUTPUT, picked?.handle ?? null)).toEqual({ path: STALE_OUTPUT, how: "copied" });
  });

  it("does not reuse the app's own last location copy as a fresh folder capture", async () => {
    const oldRoot = "F:\\Stocks 2026\\icons testing\\single\\test_processing_2\\_split_output";
    const relFolder = "2026-10/2026-10-08_18-46-23/icon-bank-institution_AI_10/split_03/export/test_process_3/_split_output";
    let clipboard = "";
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: async () => clipboard, writeText: async (text: string) => { clipboard = text; } },
      configurable: true,
    });
    saveRootPathInfo(OUTPUT_ROOT, oldRoot);
    await copyFolderText(OUTPUT_ROOT, `${relFolder}/icon.svg`, () => undefined);
    expect(clipboard).toBe(STALE_OUTPUT);
    usePicker(async () => handle(OUTPUT_ROOT));
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe("");
    expect(loadRootPath(OUTPUT_ROOT)).toBe("");
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

describe("a pick whose path could not be captured says what to do (I-52)", () => {
  it("names the Explorer copy and the Rescan that captures it", async () => {
    stubClipboard(async () => ""); // nothing was copied
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe("");
    const message = pickMessage(picked!);
    expect(message).toContain("Ctrl+Shift+C");
    expect(message).toContain("Rescan");
  });

  it("names the reason — a blocked clipboard — and the paste that still works", async () => {
    stubClipboard(async () => { throw new Error("denied"); });
    const picked = await pickRootWithPath();
    const message = pickMessage(picked!);
    expect(message).toContain("blocked");
    expect(message).toContain("Ctrl+V");
  });

  it("stays quiet when the clipboard was simply empty AND the path is known", async () => {
    stubClipboard(async () => "");
    rememberKnownRoot(ancestorOf("test_processing", [ROOT]), "F:\\parent");
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe("F:\\parent\\test_processing");
    expect(pickMessage(picked!)).toContain("captured");
  });
});

describe("the full path of a pick whose clipboard says nothing (I-51)", () => {
  it("derives the exact path from the folder the app already picked", async () => {
    rememberKnownRoot(ancestorOf("_split_output", ["2026-10", "2026-10-05_18-45-20"]), OUT);
    usePicker(async () => handle("2026-10-05_18-45-20"));
    // nothing path-like on the clipboard at all
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe(`${OUT}\\2026-10\\2026-10-05_18-45-20`);
    expect(picked?.how).toBe("copied"); // derived from real handles, not typed text
    expect(loadRootPathInfo("2026-10-05_18-45-20")).toEqual({ path: `${OUT}\\2026-10\\2026-10-05_18-45-20`, how: "copied" });
  });

  it("overrules a completed guess whose parent is NOT the picked folder's parent", async () => {
    // the reported mistake: the batch folder on the clipboard while the RUN is
    // picked — the old guess dropped the month segment
    stubClipboard(async () => OUT);
    rememberKnownRoot(ancestorOf("_split_output", ["2026-10", "2026-10-05_18-45-20"]), OUT);
    usePicker(async () => handle("2026-10-05_18-45-20"));
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe(`${OUT}\\2026-10\\2026-10-05_18-45-20`);
    expect(picked?.how).toBe("copied");
  });

  it("adopts NOTHING when no known folder can place the pick and the clipboard names another folder (I-59)", async () => {
    stubClipboard(async () => OUT);
    usePicker(async () => handle("2026-10-05_18-45-20"));
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe(""); // never `${OUT}\\2026-10-05_18-45-20` — a guess
    expect(picked?.how).toBeNull();
    expect(pickMessage(picked!)).toContain("Ctrl+Shift+C");
  });

  it("never derives from a stored GUESS — the second report (2026-10-09)", async () => {
    // an older build stored the glued guess for `test_process_3`; the tab
    // restored that folder at boot and registered it as known; the user then
    // picked its `_split_output` with nothing useful on the clipboard
    const glued = `${OUT}\\2026-10\\2026-10-08_18-46-23\\icon-bank-institution_AI_10\\split_03\\export\\test_process_3`;
    localStorage.setItem(ROOT_PATH_KEY, JSON.stringify({ test_process_3: { path: glued, how: "completed" } }));
    const restored = ancestorOf("test_process_3", ["_split_output"]);
    rememberKnownRoot(restored, loadRootPath(restored.name)); // what every tab's boot does
    stubClipboard(async () => "");
    usePicker(async () => handle("_split_output"));
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe(""); // NOT `${glued}\\_split_output`
    expect(loadRootPathInfo("_split_output")).toEqual({ path: "", how: null });
  });

  it("derives from a known folder whose exact path arrived LATER (Rescan / Ctrl+V)", async () => {
    const parent = ancestorOf("test_process_3", ["_split_output"]);
    rememberKnownRoot(parent, ""); // picked with nothing on the clipboard
    await updateKnownRootPath(parent, "F:\\single\\test_process_3"); // the capture Rescan made for this exact handle
    stubClipboard(async () => "");
    usePicker(async () => handle("_split_output"));
    expect((await pickRootWithPath())?.path).toBe("F:\\single\\test_process_3\\_split_output");
  });

  it("does not treat the app's own copied location as fresh picker evidence", async () => {
    saveRootPathInfo("_split_output", OUT);
    const clip = { text: "" };
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: async () => clip.text, writeText: async (t: string) => { clip.text = t; } },
      configurable: true,
    });
    await copyFolderText("_split_output", "2026-10/run/piece/split_03/export/icon.svg", () => undefined);
    expect(clip.text).toBe(`${OUT}\\2026-10\\run\\piece\\split_03\\export`);
    usePicker(async () => handle("export"));
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe(""); // app output location is not proof of the newly picked handle
    expect(loadRootPath("export")).toBe("");
  });

  it("remembers the pick it just captured, so the NEXT pick inside it is exact", async () => {
    stubClipboard(async () => OUT);
    // the first pick IS the output folder, and its handle can answer `resolve`
    // for the folder picked next — exactly what the platform gives the app
    usePicker(async () => ancestorOf("_split_output", ["2026-10"]));
    const first = await pickRootWithPath();
    expect(first?.path).toBe(OUT);
    expect(first?.how).toBe("copied");
    stubClipboard(async () => ""); // the clipboard says nothing this time
    usePicker(async () => handle("2026-10"));
    expect((await pickRootWithPath())?.path).toBe(`${OUT}\\2026-10`);
  });
});

// The adopt action itself is covered by clipboardpath.test.ts, but pickroot
// depends on it — this keeps the two honest about each other.
describe("pickroot and clipboardpath agree", () => {
  it("adopting the same copied text twice is idempotent", () => {
    expect(adoptCopiedText(ROOT, FULL)).toEqual({ path: FULL, how: "copied" });
    expect(adoptCopiedText(ROOT, FULL)).toEqual({ path: FULL, how: "copied" });
    expect(loadRootPath(ROOT)).toBe(FULL);
  });
});
