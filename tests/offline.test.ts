// offline.test.ts — a decision still reaches its store when the Selection panel
// is unmounted (design doc §3), and a mounted panel keeps the canonical path.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyDecisionPatch, bindDecisionApplier, hasLiveApplier, SELECTION_HANDLE_KEY,
  type DecisionPatch,
} from "../src/selection/offline";
import { loadDecisions, saveDecisions } from "../src/selection/reviewstore";
import { loadHandles } from "../src/batch/store";
import { FakeDir } from "./helpers/fakefs";
import type { DirHandleLike } from "../src/lib/fs";

vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return { ...actual, loadHandles: vi.fn(async () => null) };
});

const handlesSpy = vi.mocked(loadHandles);

const REC = { pair_id: "a", source: "a/o.png", ai_result: "a/a.png", decision: "approved" as const, reviewed_at: "2026-10-01T12:00:00.000Z" };
const PATCH: DecisionPatch = { recs: [REC] };

beforeEach(() => {
  handlesSpy.mockReset();
  handlesSpy.mockResolvedValue(null);
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

  it("patches the stored records, keeping the ones it was not told about", async () => {
    const root = new FakeDir("root");
    await saveDecisions(root, [REC, { ...REC, pair_id: "b", decision: "declined" }]);
    handlesSpy.mockResolvedValue({ source: root, dest: undefined });

    await expect(applyDecisionPatch(["a"], { recs: [] })).resolves.toBe(true); // undo to pending
    expect((await loadDecisions(root)).records.map((r) => r.pair_id)).toEqual(["b"]);

    await expect(applyDecisionPatch(["a"], PATCH)).resolves.toBe(true); // redo
    const after = (await loadDecisions(root)).records;
    expect(after.map((r) => r.pair_id).sort()).toEqual(["a", "b"]);
    expect(after.find((r) => r.pair_id === "a")?.decision).toBe("approved");
  });

  it("reports a failed write instead of leaving a half-written file", async () => {
    const denied = {
      kind: "directory" as const,
      getFileHandle: async () => { throw new Error("read-only"); },
    } as unknown as DirHandleLike;
    handlesSpy.mockResolvedValue({ source: denied, dest: undefined });
    await expect(applyDecisionPatch(["a"], PATCH)).resolves.toBe(false);
  });
});
