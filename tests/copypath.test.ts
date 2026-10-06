// copypath.test.ts — RULE 4/9: "Open in File Explorer" is impossible from a
// browser, so the fallback copies the FOLDER (full path when the pick captured
// one) and says so; a blocked clipboard is reported as an error, never
// swallowed. The folder is the one the FILE lives in (I-56): inside a run's
// output tree that is `…\<piece>\split_NN`, never the run folder.
import { beforeEach, describe, expect, it } from "vitest";
import { copyFolderText } from "../src/lib/copypath";
import { saveRootPathInfo } from "../src/lib/rootpath";

type Said = { msg: string; err?: boolean };

function useClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

const ROOT = "test_processing";
const FULL = "F:\\Stocks 2026\\icons testing\\single\\test_processing";
/** The user's own tree (2026-10-06): the file and the folder the copy must name. */
const PIECE = "_split_output/2026-10/2026-10-05_18-45-20/icon-bunny-face_AI_7/split_04";
const PIECE_FULL = `${FULL}\\_split_output\\2026-10\\2026-10-05_18-45-20\\icon-bunny-face_AI_7\\split_04`;

beforeEach(() => {
  localStorage.clear();
});

describe("copyFolderText", () => {
  it("copies the full path of the folder the file lives in, and says it (I-56)", async () => {
    saveRootPathInfo(ROOT, FULL, "copied"); // the pick-time capture
    const written: string[] = [];
    useClipboard(async (t) => { written.push(t); });
    const said: Said[] = [];
    const rel = `${PIECE}/icon-bunny-face_AI_7_04_v2.svg`;
    await copyFolderText(ROOT, rel, (msg, err) => said.push({ msg, err }));
    expect(written).toEqual([PIECE_FULL]); // the file's own folder, never the run's
    expect(said).toHaveLength(1);
    expect(said[0].msg).toContain("Folder path copied");
    expect(said[0].msg).toContain(PIECE_FULL);
    expect(said[0].msg).toContain("can't open Explorer");
    expect(said[0].err).toBeUndefined(); // success, with an honest note
  });

  it("names the folder of the sidecar and of the AI piece the same way", async () => {
    saveRootPathInfo(ROOT, FULL, "copied");
    const written: string[] = [];
    useClipboard(async (t) => { written.push(t); });
    await copyFolderText(ROOT, `${PIECE}/icon-bunny-face_AI_7_04.svg.json`, () => undefined);
    await copyFolderText(ROOT, `${PIECE}/icon-bunny-face_AI_7_04_AI.png`, () => undefined);
    expect(written).toEqual([PIECE_FULL, PIECE_FULL]);
  });

  it("still copies an honest folder path when no full path was pasted", async () => {
    const written: string[] = [];
    useClipboard(async (t) => { written.push(t); });
    await copyFolderText(ROOT, "Category-A/icon_AI.png", () => undefined);
    expect(written).toEqual([`${ROOT}\\Category-A`]);
  });

  it("reports a blocked clipboard as an error", async () => {
    useClipboard(async () => { throw new Error("denied"); });
    const said: Said[] = [];
    await copyFolderText("root", "a.png", (msg, err) => said.push({ msg, err }));
    expect(said).toEqual([{ msg: "Could not copy the path", err: true }]);
  });
});
