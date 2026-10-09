// copypath.test.ts — RULE 4/9: "Open in File Explorer" is impossible from a
// browser, so the fallback copies the FOLDER and says so; a blocked clipboard is
// reported as an error, never swallowed. The folder is the one the FILE lives in
// (I-56): inside a run's output tree that is `…\<piece>\split_NN`, never the run
// folder. Its base is the folder the row is showing — resolved from the root's
// HANDLE, so a copy can never name a folder the row is not (I-63/D7).
import { beforeEach, describe, expect, it } from "vitest";
import { copyFolderText } from "../src/lib/copypath";
import { rememberPath, resetPathMemory } from "../src/lib/pathmemory";
import { FakeDir } from "./helpers/fakefs";

type Said = { msg: string; err?: boolean };

function useClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

const ROOT = "test_processing";
const FULL = "F:\\Stocks 2026\\icons testing\\single\\test_processing";
/** The user's own tree (2026-10-06): the file and the folder the copy must name. */
const PIECE = "_split_output/2026-10/2026-10-05_18-45-20/icon-bunny-face_AI_7/split_04";
const PIECE_FULL = `${FULL}\\_split_output\\2026-10\\2026-10-05_18-45-20\\icon-bunny-face_AI_7\\split_04`;

/** The root a tab is showing: its name, and the handle that proves its path. */
function root(handle: FakeDir | null = new FakeDir(ROOT)) {
  return { name: handle?.name ?? ROOT, handle };
}

const said: Said[] = [];
const written: string[] = [];

beforeEach(() => {
  localStorage.clear();
  resetPathMemory({ read: async () => [], write: async () => undefined });
  said.length = 0;
  written.length = 0;
  useClipboard(async (t) => { written.push(t); });
});

const say = (msg: string, err?: boolean): void => { said.push({ msg, err }); };

describe("copyFolderText", () => {
  it("copies the full path of the folder the file lives in, and says it (I-56)", async () => {
    const folder = root();
    await rememberPath(folder.handle!, FULL); // the pick-time capture
    await copyFolderText(folder, `${PIECE}/icon-bunny-face_AI_7_04_v2.svg`, say);
    expect(written).toEqual([PIECE_FULL]); // the file's own folder, never the run's
    expect(said).toHaveLength(1);
    expect(said[0].msg).toContain("Folder path copied");
    expect(said[0].msg).toContain(PIECE_FULL);
    expect(said[0].msg).toContain("can't open Explorer");
    expect(said[0].err).toBeUndefined(); // success, with an honest note
  });

  it("names the folder of the sidecar and of the AI piece the same way", async () => {
    const folder = root();
    await rememberPath(folder.handle!, FULL);
    await copyFolderText(folder, `${PIECE}/icon-bunny-face_AI_7_04.svg.json`, say);
    await copyFolderText(folder, `${PIECE}/icon-bunny-face_AI_7_04_AI.png`, say);
    expect(written).toEqual([PIECE_FULL, PIECE_FULL]);
  });

  it("copies a folder one level BELOW the captured root, from the same proof", async () => {
    const out = new FakeDir("_split_output");
    const month = await out.getDirectoryHandle("2026-10", { create: true });
    await rememberPath(out, `${FULL}\\_split_output`);
    await copyFolderText({ name: month.name, handle: month }, "run/piece_AI_1/split_02/icon_AI_02.svg", say);
    expect(written).toEqual([`${FULL}\\_split_output\\2026-10\\run\\piece_AI_1\\split_02`]);
  });

  it("still copies an honest folder path when no full path was captured", async () => {
    await copyFolderText(root(), "Category-A/icon_AI.png", say);
    expect(written).toEqual([`${ROOT}\\Category-A`]);
  });

  it("never falls back to the NAME of a folder whose path belongs to another tree", async () => {
    // the reported bug: a same-named folder's captured path was reused blindly
    await rememberPath(new FakeDir(ROOT), "F:\\somewhere\\else\\test_processing");
    await copyFolderText(root(new FakeDir(ROOT)), "Category-A/icon_AI.png", say);
    expect(written).toEqual([`${ROOT}\\Category-A`]);
  });

  it("copies from the folder's name alone when the tab has no handle", async () => {
    await copyFolderText({ name: ROOT, handle: null }, "Category-A/icon_AI.png", say);
    expect(written).toEqual([`${ROOT}\\Category-A`]);
  });

  it("reports a blocked clipboard as an error", async () => {
    useClipboard(async () => { throw new Error("denied"); });
    await copyFolderText(root(), "a.png", say);
    expect(said).toEqual([{ msg: "Could not copy the path", err: true }]);
  });
});
