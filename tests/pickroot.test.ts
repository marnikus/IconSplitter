// pickroot.test.ts — RULE 4/10: one way to point the app at a folder. The pick
// captures the folder's real path from the clipboard (see I-35) or from a folder
// the app already placed exactly (I-51), binds it to the picked folder's HANDLE
// (I-63 — never to its name), and a pick in any tab behaves the same: a cancel
// is a cancel, and a clipboard problem never costs the user the folder they
// just chose. The third report (2026-10-09) is locked here: a name-keyed
// memory must never show another folder's path, and one level up or down of the
// same root is exact — "it should not change anything".
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adoptCopiedText } from "../src/lib/clipboardpath";
import { copyFolderText } from "../src/lib/copypath";
import type { DirHandleLike } from "../src/lib/fs";
import { boundRootPathInfo, clearKnownRoots, rememberKnownRoot } from "../src/lib/knownroots";
import { pickMessage, pickRootWithPath } from "../src/ui/pickroot";

const ROOT = "test_processing";
const FULL = "F:\\Stocks 2026\\icons testing\\single\\test_processing";
const SINGLE = "F:\\Stocks 2026\\icons testing\\single";

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
    expect(boundRootPathInfo(picked!.handle).path).toBe(FULL);
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

  it("re-reads after the dialog when the pre-dialog text named something else", async () => {
    // the stale-text trap: the clipboard held a file name (or another folder)
    // at the click and the real copy landed just after — the fresh copy wins
    const reads = ["icon-airplane-landing.png", `"${FULL}"`];
    stubClipboard(async () => reads.shift() ?? "");
    const picked = await pickRootWithPath();
    expect(reads).toEqual([]); // both reads happened
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
    expect(boundRootPathInfo(handle(ROOT))).toEqual({ path: "", how: null });
  });

  it("reads the clipboard only for the pre-read when the pick is cancelled", async () => {
    const spy = vi.fn(async () => FULL);
    usePicker(async () => null);
    stubClipboard(spy);
    expect(await pickRootWithPath()).toBeNull();
    // one pre-read (the click's activation), no second read, nothing stored
    expect(spy).toHaveBeenCalledTimes(1);
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
    expect(picked?.how).toBe("derived"); // from real handles, never from typed text
    expect(boundRootPathInfo(picked!.handle)).toEqual({ path: `${OUT}\\2026-10\\2026-10-05_18-45-20`, how: "derived" });
  });

  it("prefers the exact derivation when the clipboard names another folder entirely", async () => {
    // the reported mistake: the batch folder on the clipboard while the RUN is
    // picked — the derivation from real handles overrules the stray text
    stubClipboard(async () => OUT);
    rememberKnownRoot(ancestorOf("_split_output", ["2026-10", "2026-10-05_18-45-20"]), OUT);
    usePicker(async () => handle("2026-10-05_18-45-20"));
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe(`${OUT}\\2026-10\\2026-10-05_18-45-20`);
  });

  it("adopts NOTHING when no known folder can place the pick and the clipboard names another folder (I-59)", async () => {
    stubClipboard(async () => OUT);
    usePicker(async () => handle("2026-10-05_18-45-20"));
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe(""); // never `${OUT}\\2026-10-05_18-45-20` — a guess
    expect(picked?.how).toBeNull();
    expect(pickMessage(picked!)).toContain("Ctrl+Shift+C");
  });

  it("derives from a known folder whose exact path arrived LATER (Rescan / Ctrl+V)", async () => {
    const parent = ancestorOf("test_process_3", ["_split_output"]);
    rememberKnownRoot(parent, "F:\\single\\test_process_3");
    stubClipboard(async () => "");
    usePicker(async () => handle("_split_output"));
    expect((await pickRootWithPath())?.path).toBe("F:\\single\\test_process_3\\_split_output");
  });

  it("adopts the app's OWN copied folder path only when it names the picked folder exactly", async () => {
    // the first report: the app's "copy folder path" (an export folder) was on
    // the clipboard while a sibling tree was picked
    const out = handle("_split_output");
    rememberKnownRoot(out, OUT);
    const clip = { text: "" };
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: async () => clip.text, writeText: async (t: string) => { clip.text = t; } },
      configurable: true,
    });
    await copyFolderText(out, "2026-10/run/piece/split_03/export/icon.svg", () => undefined);
    expect(clip.text).toBe(`${OUT}\\2026-10\\run\\piece\\split_03\\export`);
    usePicker(async () => handle("test_process_3"));
    expect((await pickRootWithPath())?.path).toBe(""); // not `…\\export\\test_process_3`
    usePicker(async () => handle("export"));
    expect((await pickRootWithPath())?.path).toBe(clip.text); // the exact folder: adopted
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

describe("the third report (2026-10-09): a name-keyed memory never wins", () => {
  const GLUED = `${OUT}\\2026-10\\2026-10-08_18-46-23\\icon-bank-institution_AI_10\\split_03\\export\\test_process_3\\_split_output`;

  it("shows the picked folder's OWN copied path — never a same-named folder's", async () => {
    // the old name-keyed store holds another `_split_output`'s (glued) path;
    // the user picks `single\test_process_3\_split_output` with its exact copy
    localStorage.setItem("iconSplitter.rootpaths.v1", JSON.stringify({ _split_output: { path: GLUED, how: "copied" } }));
    stubClipboard(async () => `${SINGLE}\\test_process_3\\_split_output`);
    usePicker(async () => handle("_split_output"));
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe(`${SINGLE}\\test_process_3\\_split_output`);
    expect(picked?.path).not.toContain("export");
  });

  it("with no usable copy it answers 'not captured' — never the stored other folder", async () => {
    localStorage.setItem("iconSplitter.rootpaths.v1", JSON.stringify({ _split_output: { path: GLUED, how: "copied" } }));
    stubClipboard(async () => "");
    usePicker(async () => handle("_split_output"));
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe("");
    expect(pickMessage(picked!)).toContain("Ctrl+Shift+C"); // honest: raise the question
  });

  it("picks the parent one level UP of a known child exactly — 'it should not change anything'", async () => {
    // `test_process_3\_split_output` is known exactly; the user picks
    // `test_process_3` (same root, one level up) with nothing on the clipboard
    const child = ancestorOf("_split_output", null);
    rememberKnownRoot(child, `${SINGLE}\\test_process_3\\_split_output`);
    const parent = {
      kind: "directory", name: "test_process_3",
      resolve: async (other: unknown) => (other === child ? ["_split_output"] : null),
    } as unknown as DirHandleLike;
    stubClipboard(async () => "");
    usePicker(async () => parent);
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe(`${SINGLE}\\test_process_3`);
    expect(picked?.how).toBe("derived");
  });

  it("adopts a copied CHILD path for its PARENT folder — one level down is the same root", async () => {
    // the user copied `…\test_process_3\_split_output` and picks `test_process_3`
    stubClipboard(async () => `${SINGLE}\\test_process_3\\_split_output`);
    usePicker(async () => handle("test_process_3"));
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe(`${SINGLE}\\test_process_3`);
    expect(picked?.how).toBe("derived");
  });

  it("still refuses to complete an unrelated copied folder into `…\\export\\test_process_3`", async () => {
    stubClipboard(async () => `${OUT}\\2026-10\\2026-10-08_18-46-23\\icon-bank-institution_AI_10\\split_03\\export`);
    usePicker(async () => handle("test_process_3"));
    const picked = await pickRootWithPath();
    expect(picked?.path).toBe("");
  });
});

// The adopt action itself is covered by clipboardpath.test.ts, but pickroot
// depends on it — this keeps the two honest about each other.
describe("pickroot and clipboardpath agree", () => {
  it("adopting the same copied text twice is idempotent", async () => {
    const root = handle(ROOT);
    expect(await adoptCopiedText(root, FULL)).toEqual({ path: FULL, how: "copied" });
    expect(await adoptCopiedText(root, FULL)).toEqual({ path: FULL, how: "copied" });
    expect(boundRootPathInfo(root).path).toBe(FULL);
  });
});
