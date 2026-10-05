// legacyfile.test.ts — the legacy global `review-decisions.json` is a READ-ONLY
// fallback (I-42, design §2.2): every pair that has a file of its own speaks for
// itself, a pair without one still gets its decision from here, and nothing —
// not a scan, not an approval, not a reset — writes this file again. It is
// parsed by lib/reviewfile and merged by selection/pairstore.
import { describe, expect, it } from "vitest";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { LEGACY_FILE, loadPairDecisions } from "../src/selection/pairstore";
import { loadMetaAt, saveMetaAt } from "../src/selection/pairfile";
import { pairFile } from "./helpers/pairfile";
import { serializeDecisions, type ReviewRecord } from "../src/lib/reviewfile";
import { readDirTree } from "../src/lib/fs";
import { walkTree } from "../src/lib/scan";

const REC: ReviewRecord = {
  pair_id: "pair_1", source: "a/o.png", ai_result: "a/a_AI.png",
  decision: "approved", reviewed_at: "2026-10-01T10:00:00.000Z",
};

/** A root with the legacy file exactly as a previous version left it. */
function rootWithLegacy(...records: ReviewRecord[]): FakeDir {
  const root = new FakeDir("root");
  const dir = new FakeDir("a");
  dir.children.set("o.png", new FakeFile("o.png", 10, 10, "o"));
  dir.children.set("a_AI.png", new FakeFile("a_AI.png", 10, 10, "a"));
  root.children.set("a", dir);
  root.children.set(LEGACY_FILE, new FakeFile(LEGACY_FILE, 10, 1, serializeDecisions(records)));
  return root;
}

/** What a scan does: read the tree, then every decision it holds. */
async function scan(root: FakeDir) {
  return loadPairDecisions(root, walkTree(await readDirTree(root, []), []));
}

describe("reading the legacy file", () => {
  it("a missing file is simply absent — nothing is created", async () => {
    const root = new FakeDir("root");
    const out = await scan(root);
    expect(out.legacy).toBe(false);
    expect(out.legacyCorrupt).toBe(false);
    expect(out.records).toEqual([]);
    expect(root.children.size).toBe(0); // a scan cannot mutate the folder (D5)
  });

  it("a corrupt file is reported, and it is left untouched on disk", async () => {
    const root = rootWithLegacy(REC);
    root.children.set(LEGACY_FILE, new FakeFile(LEGACY_FILE, 5, 1, "{oops"));
    const out = await scan(root);
    expect(out.legacyCorrupt).toBe(true);
    expect(out.records).toEqual([]);
    expect((root.children.get(LEGACY_FILE) as FakeFile).text).toBe("{oops");
  });

  it("a valid file supplies the decision of a pair that has no file of its own", async () => {
    const out = await scan(rootWithLegacy(REC));
    expect(out.legacy).toBe(true);
    expect(out.records).toEqual([REC]);
    expect(out.corruptFiles).toEqual([]);
  });

  it("a pair's own file wins — even when it says pending (a reset outlives the fallback)", async () => {
    const root = rootWithLegacy(REC);
    await saveMetaAt(root, "a/a_AI.svg.json", pairFile("a", "a_AI.png", { id: REC.pair_id, decision: "pending" }));
    const out = await scan(root);
    expect(out.records).toEqual([]); // pending owns no record (I-13)
    expect((await loadMetaAt(root, "a/a_AI.svg.json")).meta?.decision).toBe("pending");
  });

  it("a fresh pair file with no decision lets the legacy record through", async () => {
    const root = rootWithLegacy(REC);
    await saveMetaAt(root, "a/a_AI.svg.json", pairFile("a", "a_AI.png", { id: REC.pair_id, decision: null }));
    const out = await scan(root);
    expect(out.records.map((r) => r.decision)).toEqual(["approved"]); // no approval lost to the migration
  });
});
