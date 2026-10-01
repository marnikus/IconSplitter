// TDD cycle R7 — end-to-end review flow over an in-memory split root:
// scan → pair → decide → save → restart → rescan (added/removed/renamed/
// changed) → corrupt file → write failure. Proves the pieces compose, not
// just that they pass alone (RULE 8).
import { describe, expect, it } from "vitest";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { scanPairs } from "../src/review/scan";
import { flushItems, loadAndSync, resetReviewFile } from "../src/review/persist";
import { applyDecisions, tally, withDecision, type ReviewItem } from "../src/lib/reviewmerge";
import { diffPairs } from "../src/lib/review";
import { REVIEW_FILE, tmpName } from "../src/lib/reviewio";
import { parseReviewFile, type DecisionRecord } from "../src/lib/reviewfile";

async function seed(root: FakeDir, relPath: string, size = 10, mtime = 1000): Promise<void> {
  const cut = relPath.lastIndexOf("/");
  const dir = cut < 0 ? root : await root.getDirectoryHandle(relPath.slice(0, cut), { create: true });
  const name = relPath.slice(cut + 1);
  const file = new FakeFile(name, size, mtime);
  file.text = "x".repeat(size); // the fake reports the text length as the file size
  dir.children.set(name, file);
}

/** The decisions as they are stored on disk right now. */
function storedRecords(root: FakeDir): DecisionRecord[] {
  const file = root.children.get(REVIEW_FILE) as FakeFile | undefined;
  const parsed = file ? parseReviewFile(file.text) : null;
  return parsed?.ok ? parsed.file.records : [];
}

async function project(root: FakeDir, now: string) {
  const pairs = await scanPairs(root);
  const state = await loadAndSync(root, pairs, now);
  return { pairs, state, items: applyDecisions(pairs, state.file.records) };
}

const T1 = "2026-10-01T10:00:00.000Z";
const T2 = "2026-10-01T11:00:00.000Z";

describe("review flow — scan, decide, restart (spec §8)", () => {
  it("creates the review file with every pair pending and keeps decisions after a restart", async () => {
    const root = new FakeDir("icons");
    await seed(root, "cat/star.png");
    await seed(root, "cat/star_AI.png", 20, 2000);
    await seed(root, "cat/lonely_AI.png", 30, 3000);

    const first = await project(root, T1);
    expect(root.children.has(REVIEW_FILE)).toBe(true); // missing file was created
    expect(first.items.map((i) => i.status)).toEqual(["pending", "pending"]);
    expect(tally(first.items)).toMatchObject({ total: 2, pending: 2 });
    expect(first.items.find((i) => i.id === "cat/lonely")!.kind).toBe("ai-only");
    expect(first.items.find((i) => i.id === "cat/star")!.kind).toBe("paired");
    expect(storedRecords(root)).toHaveLength(2);

    const approved = withDecision(first.items, "cat/star", "approved", T2);
    await flushItems(root, approved, T2);

    // "restart": a fresh scan reads the same decisions back
    const second = await project(root, "2026-10-01T12:00:00.000Z");
    const star = second.items.find((i) => i.id === "cat/star")!;
    expect(star.status).toBe("approved");
    expect(star.reviewedAt).toBe(T2);
    expect(second.items.find((i) => i.id === "cat/lonely")!.status).toBe("pending");
  });

  it("never lists its own review file as an unpaired image", async () => {
    const root = new FakeDir("icons");
    await seed(root, "a.png");
    await seed(root, "a_AI.png", 20, 2000);
    await project(root, T1);
    const again = await project(root, T2);
    expect(again.pairs.map((p) => p.id)).toEqual(["a"]);
  });
});

describe("review flow — rescan behaviour (spec §9)", () => {
  async function rescanChanges() {
    const root = new FakeDir("icons");
    await seed(root, "keep.png");
    await seed(root, "keep_AI.png", 20, 1000);
    await seed(root, "edit.png");
    await seed(root, "edit_AI.png", 20, 1000);
    await seed(root, "gone.png");
    await seed(root, "gone_AI.png", 20, 1000);
    await seed(root, "old.png", 10, 4000);
    await seed(root, "old_AI.png", 40, 4000);
    const before = await project(root, T1);
    const decided = withDecision(before.items, "edit", "declined", T2);
    await flushItems(root, decided, T2);

    root.children.delete("gone.png");
    root.children.delete("gone_AI.png");
    root.children.delete("old.png"); // renamed on disk
    root.children.delete("old_AI.png");
    (root.children.get("edit_AI.png") as FakeFile).mtime = 9999; // changed
    await seed(root, "brand-new.png", 50, 5000);
    await seed(root, "brand-new_AI.png", 60, 5000);
    await seed(root, "renamed.png", 10, 4000); // same bytes+folder-date as old.* → rename
    await seed(root, "renamed_AI.png", 40, 4000);
    return { root, before, after: await project(root, "2026-10-01T13:00:00.000Z") };
  }

  it("reports added, removed, changed and renamed pairs", async () => {
    const { before, after } = await rescanChanges();
    const diff = diffPairs(before.pairs, after.pairs);
    expect(diff.added).toContain("brand-new");
    expect(diff.removed).toContain("gone");
    expect(diff.changed).toEqual(["edit"]);
    expect(diff.renamed).toEqual([{ from: "old", to: "renamed" }]);
    expect(diff.kept).toBe(1); // only "keep" is byte-identical
  });

  it("keeps the decision of an unchanged pair and starts new pairs pending", async () => {
    const { after } = await rescanChanges();
    const status = Object.fromEntries(after.items.map((i) => [i.id, i.status]));
    expect(status["edit"]).toBe("declined");
    expect(status["keep"]).toBe("pending");
    expect(status["brand-new"]).toBe("pending");
    expect(status["renamed"]).toBe("pending");
    expect(after.items.some((i) => i.id === "gone")).toBe(false);
  });

  it("keeps the vanished pair identifiable in the review file", async () => {
    const { root, after } = await rescanChanges();
    const names = storedRecords(root).map((r) => r.pair_id);
    expect(names).toContain("gone");
    expect(after.state.status).toBe("ok");
  });
});

describe("review flow — broken review files (spec §8, §10)", () => {
  it("reports a corrupt file, leaves it untouched and refuses to overwrite it", async () => {
    const root = new FakeDir("icons");
    await seed(root, "a.png");
    await seed(root, "a_AI.png", 20, 2000);
    const broken = new FakeFile(REVIEW_FILE, 6, 1, "{oops");
    root.children.set(REVIEW_FILE, broken);

    const state = await loadAndSync(root, await scanPairs(root), T1);
    expect(state.status).toBe("corrupt");
    expect(broken.text).toBe("{oops");
    expect((root.children.get(REVIEW_FILE) as FakeFile).text).toBe("{oops");
  });

  it("backs the corrupt payload up and starts a fresh file on request", async () => {
    const root = new FakeDir("icons");
    await seed(root, "a.png");
    await seed(root, "a_AI.png", 20, 2000);
    root.children.set(REVIEW_FILE, new FakeFile(REVIEW_FILE, 6, 1, "{oops"));
    const pairs = await scanPairs(root);
    const items: ReviewItem[] = applyDecisions(pairs, []);

    const backup = await resetReviewFile(root, items, T2, "2026-10-01T13-00-00");
    expect(backup).toBe("review-decisions.corrupt-2026-10-01T13-00-00.json");
    expect((root.children.get(backup) as FakeFile).text).toBe("{oops");
    const reloaded = await loadAndSync(root, pairs, T2);
    expect(reloaded.status).toBe("ok");
    expect(reloaded.file.records[0].decision).toBe("pending");
  });

  it("keeps the previous file intact when the new write fails (RULE 23)", async () => {
    const { dir, file } = seedFile();
    await expect(flushItems(dir, applyDecisions(await scanPairs(dir), []), T1)).rejects.toThrow(/disk full/i);
    expect(file.text).toBe('{"version":1,"records":[]}');
    expect(dir.children.get(REVIEW_FILE)).toBe(file);
  });

  function seedFile(): { dir: FakeDir; file: FakeFile } {
    const dir = new FailTmpDir("icons");
    const file = new FakeFile(REVIEW_FILE, 26, 1, '{"version":1,"records":[]}');
    dir.children.set(REVIEW_FILE, file);
    dir.children.set("a.png", new FakeFile("a.png", 10, 1000));
    dir.children.set("a_AI.png", new FakeFile("a_AI.png", 10, 2000));
    return { dir, file };
  }
});

/** A directory whose temp file cannot be closed — the atomic write must fail. */
class FailTmpDir extends FakeDir {
  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<FakeFile> {
    if (name === tmpName()) {
      const broken = new FakeFile(name);
      broken.createWritable = async () => ({
        write: async () => {},
        close: async () => { throw new DOMException("disk full", "NotReadableError"); },
      });
      this.children.set(name, broken);
      return broken;
    }
    return super.getFileHandle(name, opts);
  }
}
