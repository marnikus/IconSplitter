// reviewstore.test.ts — RULE 8/13: decision-file IO with atomic write protocol.
import { describe, expect, it } from "vitest";
import { BrokenFile, FakeDir, FakeFile } from "./helpers/fakefs";
import { DECISIONS_FILE, loadDecisions, saveDecisions, TMP_FILE } from "../src/selection/reviewstore";
import { serializeDecisions, type ReviewRecord } from "../src/lib/reviewfile";

const REC: ReviewRecord = {
  pair_id: "pair_1", source: "a.png", ai_result: "a_AI.png",
  decision: "approved", reviewed_at: "2026-10-01T10:00:00.000Z",
};

describe("loadDecisions", () => {
  it("missing file -> missing flag, empty records, file created pending", async () => {
    const root = new FakeDir("root");
    const out = await loadDecisions(root);
    expect(out.missing).toBe(true);
    expect(out.corrupt).toBe(false);
    expect(out.records).toEqual([]);
    expect(root.children.has(DECISIONS_FILE)).toBe(true);
  });

  it("corrupt file -> corrupt flag, no records, file left untouched", async () => {
    const root = new FakeDir("root");
    root.children.set(DECISIONS_FILE, new FakeFile(DECISIONS_FILE, 5, 1, "{oops"));
    const out = await loadDecisions(root);
    expect(out.corrupt).toBe(true);
    expect(out.records).toEqual([]);
    expect((root.children.get(DECISIONS_FILE) as FakeFile).text).toBe("{oops");
  });

  it("valid file -> parsed records", async () => {
    const root = new FakeDir("root");
    root.children.set(DECISIONS_FILE, new FakeFile(DECISIONS_FILE, 10, 1, serializeDecisions([REC])));
    const out = await loadDecisions(root);
    expect(out.records).toEqual([REC]);
  });
});

describe("saveDecisions — atomic protocol", () => {
  it("writes main file and removes the tmp sidecar", async () => {
    const root = new FakeDir("root");
    await saveDecisions(root, [REC]);
    const main = root.children.get(DECISIONS_FILE) as FakeFile;
    expect(JSON.parse(main.text).records).toEqual([REC]);
    expect(root.children.has(TMP_FILE)).toBe(false);
  });

  it("keeps previous main content when the main write fails", async () => {
    const root = new FakeDir("root");
    await saveDecisions(root, [REC]);
    root.children.set(DECISIONS_FILE, new BrokenFile(DECISIONS_FILE, 5, 1, "old"));
    await expect(saveDecisions(root, [{ ...REC, decision: "declined" }])).rejects.toThrow();
    expect((root.children.get(DECISIONS_FILE) as FakeFile).text).toBe("old");
  });
});
