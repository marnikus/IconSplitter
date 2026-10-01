// copypath.test.ts — RULE 4/9: "Open in File Explorer" is impossible from a
// browser, so the fallback copies the path and says so; a blocked clipboard is
// reported as an error, never swallowed.
import { describe, expect, it } from "vitest";
import { copyPathText } from "../src/selection/copypath";

type Said = { msg: string; err?: boolean };

function useClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

describe("copyPathText", () => {
  it("copies the Explorer-style path and explains the limitation", async () => {
    const written: string[] = [];
    useClipboard(async (t) => { written.push(t); });
    const said: Said[] = [];
    await copyPathText("split_root", "renders/fog_AI.png", (msg, err) => said.push({ msg, err }));
    expect(written).toEqual(["split_root\\renders\\fog_AI.png"]);
    expect(said).toHaveLength(1);
    expect(said[0].msg).toContain("split_root\\renders\\fog_AI.png");
    expect(said[0].msg).toContain("can't open Explorer");
    expect(said[0].err).toBeUndefined(); // success, with an honest note
  });

  it("reports a blocked clipboard as an error", async () => {
    useClipboard(async () => { throw new Error("denied"); });
    const said: Said[] = [];
    await copyPathText("root", "a.png", (msg, err) => said.push({ msg, err }));
    expect(said).toEqual([{ msg: "Could not copy the path", err: true }]);
  });
});
