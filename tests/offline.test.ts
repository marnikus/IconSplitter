// offline.test.ts — a decision still reaches its store when the Selection panel
// is unmounted (design doc §3): the write lands in the pair's OWN file, and a
// pair that goes back to pending is found through the id -> path index. A
// mounted panel keeps the canonical path; the legacy global file is never
// written by anything (I-42).
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyDecisionPatch, bindDecisionApplier, hasLiveApplier, SELECTION_HANDLE_KEY,
  type DecisionPatch,
} from "../src/selection/offline";
import { LEGACY_FILE } from "../src/selection/pairstore";
import { loadMetaAt, saveMetaAt } from "../src/selection/pairfile";
import { pairFile } from "./helpers/pairfile";
import { loadHandles } from "../src/batch/store";
import { saveSourceIndex } from "../src/state/sourceindex";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import type { DirHandleLike } from "../src/lib/fs";

vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return { ...actual, loadHandles: vi.fn(async () => null) };
});

const handlesSpy = vi.mocked(loadHandles);

const REC = { pair_id: "a", source: "a/o.png", ai_result: "a/a_AI.png", decision: "approved" as const, reviewed_at: "2026-10-01T12:00:00.000Z" };
const PATCH: DecisionPatch = { recs: [REC] };
const A_FILE = "a/a_AI.svg.json";

/** A root with pair `a` and an untouched pair `b` on disk. */
async function makeRoot(): Promise<FakeDir> {
  const root = new FakeDir("root");
  const dir = new FakeDir("a");
  dir.children.set("o.png", new FakeFile("o.png", 10, 10, "o"));
  dir.children.set("a_AI.png", new FakeFile("a_AI.png", 20, 20, "a"));
  root.children.set("a", dir);
  const other = new FakeDir("b");
  other.children.set("b_AI.png", new FakeFile("b_AI.png", 20, 30, "b"));
  root.children.set("b", other);
  await saveMetaAt(root, "b/b_AI.svg.json", pairFile("b", "b_AI.png", { decision: "declined" }));
  saveSourceIndex([{ id: "a", relPath: "a/a_AI.png", name: "a_AI.png", fingerprint: "20:20" }]);
  return root;
}

beforeEach(() => {
  handlesSpy.mockReset();
  handlesSpy.mockResolvedValue(null);
  saveSourceIndex([]);
});

describe("the mounted panel wins", () => {
  it("routes through a bound applier and returns its verdict", async () => {
    const applier = vi.fn(async () => true);
    const off = bindDecisionApplier(applier);
    expect(hasLiveApplier()).toBe(true);
    await expect(applyDecisionPatch(["a"], PATCH)).resolves.toBe(true);
    expect(applier).toHaveBeenCalledWith(["a"], PATCH);
    off();
    expect(hasLiveApplier()).toBe(false);
  });

  it("only releases its own applier when several panels come and go", async () => {
    const first = vi.fn(async () => true);
    const offFirst = bindDecisionApplier(first);
    const second = vi.fn(async () => false);
    const offSecond = bindDecisionApplier(second);
    offFirst(); // the older panel unmounts late — it must not steal the path
    expect(hasLiveApplier()).toBe(true);
    await expect(applyDecisionPatch(["a"], PATCH)).resolves.toBe(false);
    expect(second).toHaveBeenCalledOnce();
    offSecond(); // every panel releases the path it claimed
    expect(hasLiveApplier()).toBe(false);
  });
});

describe("the file path", () => {
  it("refuses when no folder is known", async () => {
    await expect(applyDecisionPatch(["a"], PATCH)).resolves.toBe(false);
    expect(handlesSpy).toHaveBeenCalledWith(SELECTION_HANDLE_KEY);
  });

  it("refuses when nothing is touched", async () => {
    handlesSpy.mockResolvedValue({ source: new FakeDir("root"), dest: undefined });
    await expect(applyDecisionPatch([], PATCH)).resolves.toBe(false);
  });

  it("writes the touched pair's own file and leaves the others alone", async () => {
    const root = await makeRoot();
    handlesSpy.mockResolvedValue({ source: root, dest: undefined });

    // undo to pending: no record is carried, so the index locates the file
    await expect(applyDecisionPatch(["a"], { recs: [] })).resolves.toBe(true);
    expect((await loadMetaAt(root, A_FILE)).meta?.decision).toBe("pending");

    // redo: the record itself names the decision
    await expect(applyDecisionPatch(["a"], PATCH)).resolves.toBe(true);
    expect((await loadMetaAt(root, A_FILE)).meta?.decision).toBe("approved");
    expect((await loadMetaAt(root, "b/b_AI.svg.json")).meta?.decision).toBe("declined");
    expect(root.children.has(LEGACY_FILE)).toBe(false); // never the global file
  });

  it("never creates a pair file in a folder the pair does not live in", async () => {
    const root = new FakeDir("root");
    handlesSpy.mockResolvedValue({ source: root, dest: undefined });
    saveSourceIndex([{ id: "a", relPath: "gone/a_AI.png", name: "a_AI.png", fingerprint: "" }]);
    await expect(applyDecisionPatch(["a"], PATCH)).resolves.toBe(false);
    expect([...root.children.keys()]).toEqual([]);
  });

  it("reports a failed write instead of leaving a half-written file", async () => {
    const denied = {
      kind: "directory" as const,
      getDirectoryHandle: async () => { throw new Error("read-only"); },
      getFileHandle: async () => { throw new Error("read-only"); },
    } as unknown as DirHandleLike;
    handlesSpy.mockResolvedValue({ source: denied, dest: undefined });
    await expect(applyDecisionPatch(["a"], PATCH)).resolves.toBe(false);
  });
});

// 2026-10-05 — the legacy file is a fallback, never a target (I-42, design D5).
describe("the legacy file is read-only", () => {
  it("a fresh folder gains no file at all — not even on a scan", async () => {
    const root = new FakeDir("fresh-root");
    await expect(applyDecisionPatch([], { recs: [] })).resolves.toBe(false);
    expect(root.children.size).toBe(0);
    expect(root.children.has(LEGACY_FILE)).toBe(false);
  });

  it("a decision write creates the pair's file, never review-decisions.json", async () => {
    const root = await makeRoot();
    handlesSpy.mockResolvedValue({ source: root, dest: undefined });
    await applyDecisionPatch(["a"], PATCH);
    const dir = await root.getDirectoryHandle("a");
    expect([...dir.children.keys()].sort()).toEqual(["a_AI.png", "a_AI.svg.json", "o.png"]);
    expect(root.children.has(LEGACY_FILE)).toBe(false);
  });
});
