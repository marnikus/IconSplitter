// copypath.test.ts — RULE 4/9: "Open in File Explorer" is impossible from a
// browser, so the fallback copies the FOLDER (full path when the pick captured
// one) and says so; a blocked clipboard is reported as an error, never
// swallowed. The folder is the one the FILE lives in (I-56). The base comes
// from the root HANDLE's own binding (I-63): never a same-named folder's path
// (the third report, 2026-10-09), falling back to the folder's name.
import { beforeEach, describe, expect, it } from "vitest";
import { copyFolderText } from "../src/lib/copypath";
import type { DirHandleLike } from "../src/lib/fs";
import { clearKnownRoots, rememberKnownRoot } from "../src/lib/knownroots";

type Said = { msg: string; err?: boolean };

function useClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

const ROOT = "test_processing";
const FULL = "F:\\Stocks 2026\\icons testing\\single\\test_processing";
/** The user's own tree (2026-10-06): the file and the folder the copy must name. */
const PIECE = "_split_output/2026-10/2026-10-05_18-45-20/icon-bunny-face_AI_7/split_04";
const PIECE_FULL = `${FULL}\\_split_output\\2026-10\\2026-10-05_18-45-20\\icon-bunny-face_AI_7\\split_04`;

function dir(name: string): DirHandleLike {
  return { kind: "directory", name } as DirHandleLike;
}

beforeEach(() => {
  localStorage.clear();
  clearKnownRoots();
});

describe("copyFolderText", () => {
  it("copies the full path of the folder the file lives in, and says it (I-56)", async () => {
    const root = dir(ROOT);
    rememberKnownRoot(root, FULL); // the pick-time capture
    const written: string[] = [];
    useClipboard(async (t) => { written.push(t); });
    const said: Said[] = [];
    const rel = `${PIECE}/icon-bunny-face_AI_7_04_v2.svg`;
    await copyFolderText(root, rel, (msg, err) => said.push({ msg, err }));
    expect(written).toEqual([PIECE_FULL]); // the file's own folder, never the run's
    expect(said).toHaveLength(1);
    expect(said[0].msg).toContain("Folder path copied");
    expect(said[0].msg).toContain(PIECE_FULL);
    expect(said[0].msg).toContain("can't open Explorer");
    expect(said[0].err).toBeUndefined(); // success, with an honest note
  });

  it("names the folder of the sidecar and of the AI piece the same way", async () => {
    const root = dir(ROOT);
    rememberKnownRoot(root, FULL);
    const written: string[] = [];
    useClipboard(async (t) => { written.push(t); });
    await copyFolderText(root, `${PIECE}/icon-bunny-face_AI_7_04.svg.json`, () => undefined);
    await copyFolderText(root, `${PIECE}/icon-bunny-face_AI_7_04_AI.png`, () => undefined);
    expect(written).toEqual([PIECE_FULL, PIECE_FULL]);
  });

  it("still copies an honest folder path when no full path was captured", async () => {
    const written: string[] = [];
    useClipboard(async (t) => { written.push(t); });
    await copyFolderText(dir(ROOT), `${PIECE}/x.svg`, () => undefined);
    expect(written).toEqual([`${ROOT}\\_split_output\\2026-10\\2026-10-05_18-45-20\\icon-bunny-face_AI_7\\split_04`]);
  });

  it("never prefixes a same-named folder's path (I-63) — the third report", async () => {
    rememberKnownRoot(dir(ROOT), "F:\\somewhere-else\\test_processing"); // a NAME-SAME, not this handle
    const root = dir(ROOT);
    const written: string[] = [];
    useClipboard(async (t) => { written.push(t); });
    await copyFolderText(root, `${PIECE}/x.svg`, () => undefined);
    expect(written).toEqual([`${ROOT}\\_split_output\\2026-10\\2026-10-05_18-45-20\\icon-bunny-face_AI_7\\split_04`]);
  });

  it("reports a blocked clipboard as an error instead of failing silently (RULE 2)", async () => {
    const root = dir(ROOT);
    rememberKnownRoot(root, FULL);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async () => { throw new Error("denied"); } }, configurable: true,
    });
    const said: Said[] = [];
    await copyFolderText(root, `${PIECE}/x.svg`, (msg, err) => said.push({ msg, err }));
    expect(said[0].err).toBe(true);
    expect(said[0].msg).toContain("Could not copy");
  });
});
