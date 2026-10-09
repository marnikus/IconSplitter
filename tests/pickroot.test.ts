// pickroot.test.ts — RULE 4/10/13: ONE way to point the app at a folder. The
// pick captures the folder's real path from the clipboard when that text names
// it exactly, and otherwise from a folder the app already captured — below it,
// above it, or the same one (I-51/I-63). Nothing is ever completed from a parent
// (I-59), a folder is never named from a lookalike NAME, and a pick that has
// been superseded by a newer one never writes over the newer capture.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adoptCopiedText } from "../src/lib/clipboardpath";
import { copyFolderText } from "../src/lib/copypath";
import { pathFor, peekPath, rememberPath, resetPathMemory, type PathStore } from "../src/lib/pathmemory";
import { pickFolderFor, pickMessage, pickRootWithPath, restoredRoot } from "../src/ui/pickroot";
import { FakeDir } from "./helpers/fakefs";
import type { DirHandleLike } from "../src/lib/fs";

const ROOT = "test_processing";
const FULL = "F:\\Stocks 2026\\icons testing\\single\\test_processing";
const SINGLE = "F:\\Stocks 2026\\icons testing\\single";
/** The previous run's folders — the export one is what the app itself copied (report #1). */
const OLD_RUN = `${SINGLE}\\test_processing_2\\_split_output\\2026-10\\2026-10-08_18-46-23`;
const OLD_SPLIT = `${OLD_RUN}\\icon-bank-institution_AI_10\\split_03`;
const OLD_EXPORT = `${OLD_SPLIT}\\export`;

function usePicker(pick: () => Promise<DirHandleLike | null>): void {
  Object.defineProperty(window, "showDirectoryPicker", { value: pick, configurable: true });
}

function stubClipboard(readText: () => Promise<string>): void {
  Object.defineProperty(navigator, "clipboard", { value: { readText }, configurable: true });
}

/** The store double every test starts from: nothing captured yet. */
const emptyStore = (): PathStore => ({ read: async () => [], write: async () => undefined });

beforeEach(() => {
  localStorage.clear();
  resetPathMemory(emptyStore());
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  usePicker(async () => new FakeDir(ROOT));
});

describe("pickRootWithPath", () => {
  it("adopts the copied path of the folder the user picked", async () => {
    const picked = await withClipboard(`"${FULL}\\"`);
    expect(picked?.handle.name).toBe(ROOT);
    expect(picked?.path).toBe(FULL);
    expect(picked?.how).toBe("copied");
    expect((await pathFor(picked!.handle)).path).toBe(FULL);
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
    const picked = await withClipboard("icon-airplane-landing.png");
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

  it("returns null on cancel (and captures nothing)", async () => {
    usePicker(async () => null);
    stubClipboard(async () => FULL);
    expect(await pickRootWithPath()).toBeNull();
  });

  it("reads the clipboard only for the pre-read when the pick is cancelled", async () => {
    const spy = vi.fn(async () => FULL);
    usePicker(async () => null);
    stubClipboard(spy);
    expect(await pickRootWithPath()).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1); // one pre-read, no second read, nothing stored
  });

  it("does not read the clipboard after a failed pick either", async () => {
    const spy = vi.fn(async () => "");
    usePicker(async () => { throw new Error("no handle"); });
    stubClipboard(spy);
    expect(await pickRootWithPath()).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("a pick whose path could not be captured says what to do (I-52)", () => {
  it("names the Explorer copy and the Rescan that captures it", async () => {
    const picked = await withClipboard(""); // nothing was copied
    expect(picked?.path).toBe("");
    expect(pickMessage(picked!)).toContain("Ctrl+Shift+C");
    expect(pickMessage(picked!)).toContain("Rescan");
  });

  it("names the reason — a blocked clipboard — and the paste that still works", async () => {
    stubClipboard(async () => { throw new Error("denied"); });
    const picked = await pickRootWithPath();
    expect(pickMessage(picked!)).toContain("blocked");
    expect(pickMessage(picked!)).toContain("Ctrl+V");
  });

  it("stays quiet about the capture when a known folder already placed the pick", async () => {
    const parent = new FakeDir("single");
    usePicker(async () => await parent.getDirectoryHandle(ROOT, { create: true }));
    stubClipboard(async () => "");
    await rememberPath(parent, SINGLE);
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe(FULL);
    expect(pickMessage(picked!)).toContain("captured");
  });
});

describe("the full path of a pick whose clipboard says nothing (I-51/I-63)", () => {
  it("derives the exact path of a folder BELOW one the app already captured", async () => {
    const out = new FakeDir("_split_output");
    const run = await (await out.getDirectoryHandle("2026-10", { create: true }))
      .getDirectoryHandle("2026-10-05_18-45-20", { create: true });
    await rememberPath(out, `${SINGLE}\\test_processing_2\\_split_output`);
    usePicker(async () => run);
    const picked = await withClipboard(""); // nothing path-like at all
    expect(picked?.path).toBe(`${SINGLE}\\test_processing_2\\_split_output\\2026-10\\2026-10-05_18-45-20`);
    expect(picked?.how).toBe("derived"); // proven from handles, not typed text
  });

  it("derives the exact path of a folder ONE LEVEL UP from one it captured (Failure B)", async () => {
    const run = new FakeDir("2026-10-08_18-46-23");
    const split = await (await run.getDirectoryHandle("icon-bank-institution_AI_10", { create: true }))
      .getDirectoryHandle("split_03", { create: true });
    await rememberPath(split, OLD_SPLIT);
    usePicker(async () => run);
    const picked = await withClipboard("");
    expect(picked?.path).toBe(OLD_RUN);
    expect(picked?.how).toBe("derived");
  });

  it("answers the captured path itself when the SAME folder is picked again", async () => {
    const out = new FakeDir("_split_output");
    await rememberPath(out, `${SINGLE}\\test_processing_2\\_split_output`);
    usePicker(async () => out.alias()); // another session's handle for that folder
    const picked = await withClipboard("");
    expect(picked?.path).toBe(`${SINGLE}\\test_processing_2\\_split_output`);
    expect(picked?.how).toBe("copied");
  });

  it("adopts NOTHING for a sibling tree while the app's own copy is on the clipboard (Failure A)", async () => {
    await rememberPath(new FakeDir("export"), OLD_EXPORT);
    usePicker(async () => new FakeDir("test_process_3"));
    stubClipboard(async () => OLD_EXPORT); // what the app itself copied last
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe(""); // never `${OLD_EXPORT}\\test_process_3`
    expect(picked?.how).toBeNull();
    expect(pickMessage(picked!)).toContain("Ctrl+Shift+C");
  });

  it("adopts the app's OWN copied folder path only when it names the picked folder exactly", async () => {
    const clip = { text: "" };
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: async () => clip.text, writeText: async (t: string) => { clip.text = t; } },
      configurable: true,
    });
    const out = new FakeDir("_split_output");
    await rememberPath(out, `${SINGLE}\\test_processing_2\\_split_output`);
    await copyFolderText({ name: out.name, handle: out }, "2026-10/run/piece/split_03/export/icon.svg", () => undefined);
    expect(clip.text).toBe(`${SINGLE}\\test_processing_2\\_split_output\\2026-10\\run\\piece\\split_03\\export`);
    usePicker(async () => new FakeDir("test_process_3"));
    expect((await pickRootWithPath())?.path).toBe(""); // not `…\export\test_process_3`
    usePicker(async () => new FakeDir("export"));
    expect((await pickRootWithPath())?.path).toBe(clip.text); // the exact folder: adopted
  });

  it("remembers the pick it just captured, so the NEXT pick inside it is exact", async () => {
    const out = new FakeDir("_split_output");
    usePicker(async () => out);
    const first = await withClipboard(`${SINGLE}\\test_processing_2\\_split_output`);
    expect(first?.path).toBe(`${SINGLE}\\test_processing_2\\_split_output`);
    const month = await out.getDirectoryHandle("2026-10", { create: true });
    usePicker(async () => month);
    expect((await withClipboard(""))?.path).toBe(`${SINGLE}\\test_processing_2\\_split_output\\2026-10`);
  });

  it("never writes over a newer pick's capture — a superseded pick is dropped", async () => {
    const first = new FakeDir("test_process_3");
    const again = first.alias(); // the same folder, picked a second time
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let clip = "";
    stubClipboard(async () => clip);
    usePicker(async () => { await gate; return first; });
    const slow = pickRootWithPath(); // stuck in the dialog while the user picks again
    clip = `${SINGLE}\\test_process_3`;
    usePicker(async () => again);
    expect((await pickRootWithPath())?.path).toBe(`${SINGLE}\\test_process_3`);
    clip = "D:\\moved\\test_process_3"; // what the stale pick would adopt when it lands
    release();
    await slow;
    expect((await pathFor(again)).path).toBe(`${SINGLE}\\test_process_3`);
  });
});

describe("pickFolderFor — the whole pick step every tab shares", () => {
  it("hands the handle to the caller before it returns, and reports the capture", async () => {
    const seen: string[] = [];
    stubClipboard(async () => FULL);
    const picked = await pickFolderFor((h) => { seen.push(h.name); });
    expect(seen).toEqual([ROOT]);
    expect(picked?.handle.name).toBe(ROOT);
    expect(picked?.message).toContain(FULL);
  });

  it("returns null on cancel, and calls nothing", async () => {
    const take = vi.fn();
    usePicker(async () => null);
    expect(await pickFolderFor(take)).toBeNull();
    expect(take).not.toHaveBeenCalled();
  });
});

describe("restoredRoot — the boot restore every tab shares (I-63/D6)", () => {
  it("warms the memory, so the row shows the path on its FIRST paint", async () => {
    const root = new FakeDir("test_process_3");
    await rememberPath(root, `${SINGLE}\\test_process_3`);
    const restored = await restoredRoot(root.alias()); // the handle IndexedDB handed back
    expect(peekPath(restored).path).toBe(`${SINGLE}\\test_process_3`); // synchronous, no flicker
  });

  it("hands back the handle unchanged, and null when there is none", async () => {
    const root = new FakeDir("test_process_3");
    expect(await restoredRoot(root)).toBe(root);
    expect(await restoredRoot(null)).toBeNull();
  });
});

// The adopt action itself is covered by clipboardpath.test.ts, but pickroot
// depends on it — this keeps the two honest about each other.
describe("pickroot and clipboardpath agree", () => {
  it("adopting the same copied text twice is idempotent", async () => {
    const root = new FakeDir(ROOT);
    expect(await adoptCopiedText(root, FULL)).toEqual({ path: FULL, how: "copied" });
    expect(await adoptCopiedText(root, FULL)).toEqual({ path: FULL, how: "copied" });
    expect((await pathFor(root)).path).toBe(FULL);
  });
});

/** One pick with this text already on the clipboard. */
async function withClipboard(text: string) {
  stubClipboard(async () => text);
  return pickRootWithPath();
}
