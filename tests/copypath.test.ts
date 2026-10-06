// copypath.test.ts — RULE 4/9: "Open in File Explorer" is impossible from a
// browser, so the fallback copies the FOLDER (full path when the pick captured
// one) and says so; a blocked clipboard is reported as an error, never
// swallowed.
import { beforeEach, describe, expect, it } from "vitest";
import { copyFolderText } from "../src/lib/copypath";
import { saveRootPathInfo } from "../src/lib/rootpath";

type Said = { msg: string; err?: boolean };

function useClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

const ROOT = "test_processing";
const FULL = "F:\\Stocks 2026\\icons testing\\single\\test_processing";

beforeEach(() => {
  localStorage.clear();
});

describe("copyFolderText", () => {
  it("copies the full folder path and explains the limitation", async () => {
    saveRootPathInfo(ROOT, FULL, "copied"); // the pick-time capture
    const written: string[] = [];
    useClipboard(async (t) => { written.push(t); });
    const said: Said[] = [];
    const rel = "_split_output/2026-10/2026-10-01_10-24-31/a_AI_9/split_02/a.svg.json";
    await copyFolderText(ROOT, rel, (msg, err) => said.push({ msg, err }));
    expect(written).toEqual([`${FULL}\\_split_output\\2026-10\\2026-10-01_10-24-31`]);
    expect(said).toHaveLength(1);
    expect(said[0].msg).toContain("Folder path copied");
    expect(said[0].msg).toContain(`${FULL}\\_split_output\\2026-10\\2026-10-01_10-24-31`);
    expect(said[0].msg).toContain("can't open Explorer");
    expect(said[0].err).toBeUndefined(); // success, with an honest note
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
