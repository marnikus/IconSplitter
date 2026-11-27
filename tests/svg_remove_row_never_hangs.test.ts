// svg_remove_row_never_hangs.test.ts — Remove in Generate SVG never runs
// endless (2026-11-27, the report "Removing 1 image — marking declined… runs
// endless and does nothing"). The decline is written under Generate SVG's OWN
// folder (no stored-handle lookup in front of it), every disk step has a time
// limit and a stalled step is named, a failure always reaches the status line,
// and a second click while one removal runs starts nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadHandles } from "../src/batch/store";
import { loadMetaAt, saveMetaAt } from "../src/selection/pairstore";
import { saveSourceIndex } from "../src/state/sourceindex";
import { patchSvg } from "../src/state/appstore";
import { activities } from "../src/lib/activity";
import { makeRemoveRunner, removeFromList, type RemoveCtx } from "../src/svg/removerows";
import { toRow } from "../src/svg/rowmodel";
import type { HistoryEntry } from "../src/lib/history";
import type { SvgRow } from "../src/svg/types";
import { pairFile } from "./helpers/pairfile";
import { svgSource } from "./helpers/svgpair";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairId } from "../src/lib/pairing";

vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return { ...actual, loadHandles: vi.fn(async () => null) };
});
const handlesSpy = vi.mocked(loadHandles);

const META_PATH = "a/a_AI.svg.json";
const ID = pairId("a", "a", "");
const never = <T>(): Promise<T> => new Promise<T>(() => undefined);

/** A folder whose file writes can be made to never answer (a stalled disk / an unseen browser prompt). */
class StallDir extends FakeDir {
  stall = false;
  override async getFileHandle(n: string, opts?: { create?: boolean }): Promise<FakeFile> {
    const f = await super.getFileHandle(n, opts);
    if (!this.stall) return f;
    const stalled = Object.create(f) as FakeFile;
    stalled.createWritable = never;
    return stalled;
  }
}

async function makeRoot(): Promise<{ root: FakeDir; dir: StallDir }> {
  const root = new FakeDir("root");
  const dir = new StallDir("a");
  dir.children.set("a.png", new FakeFile("a.png", 10, 10, "o"));
  dir.children.set("a_AI.png", new FakeFile("a_AI.png", 20, 20, "a"));
  root.children.set("a", dir);
  await saveMetaAt(root, META_PATH, pairFile("a", "a_AI.png", { decision: "approved", sourceName: "a.png" }));
  saveSourceIndex([{ id: ID, relPath: "a/a_AI.png", name: "a_AI.png", fingerprint: "20:20" }]);
  return { root, dir };
}

function ctx(root: FakeDir | null) {
  const pushed: HistoryEntry[] = [];
  const said: { msg: string; err: boolean }[] = [];
  const source = svgSource(ID, { dir: "a", name: "a_AI.png", sourceName: "a.png", fingerprint: "20:20" });
  const rows: SvgRow[] = [toRow(source, null, false)];
  const c: RemoveCtx = {
    refs: { root: { current: root }, metas: new Map() } as unknown as RemoveCtx["refs"],
    rows,
    say: (msg, err = false) => said.push({ msg, err }),
    hist: { push: (e) => { pushed.push(e as HistoryEntry); } },
  };
  return { c, pushed, said };
}

const decisionOf = async (root: FakeDir) => (await loadMetaAt(root, META_PATH)).meta?.decision;

beforeEach(() => {
  handlesSpy.mockReset();
  handlesSpy.mockResolvedValue(null);
  patchSvg({ checked: [], activeId: null, anchorId: null });
});
afterEach(() => { vi.useRealTimers(); });

describe("Remove writes under Generate SVG's own folder", () => {
  it("declines even when no folder handle is stored and the store never answers", async () => {
    const { root } = await makeRoot();
    handlesSpy.mockImplementation(never);
    const { c, pushed } = ctx(root);
    expect(await removeFromList(c, [ID])).toBe(true);
    expect(await decisionOf(root)).toBe("declined");
    expect(pushed).toHaveLength(1);
  });

  it("says so, writing nothing, when Generate SVG has no folder", async () => {
    const { c, pushed, said } = ctx(null);
    expect(await removeFromList(c, [ID])).toBe(false);
    expect(pushed).toHaveLength(0);
    expect(said.at(-1)?.err).toBe(true);
  });
});

describe("Remove never runs endless", () => {
  it("a write that never answers ends with a named error, no undo entry, and the progress bar closed", async () => {
    const { root, dir } = await makeRoot();
    dir.stall = true;
    vi.useFakeTimers();
    const { c, pushed, said } = ctx(root);
    let result: boolean | undefined;
    void removeFromList(c, [ID]).then((r) => { result = r; });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(result).toBe(false);
    expect(pushed).toHaveLength(0);
    expect(said.at(-1)?.err).toBe(true);
    expect(said.at(-1)?.msg).toMatch(/writing the pair file/i);
    expect(activities.list().filter((a) => a.source === "svg")).toHaveLength(0);
  });
});

describe("the Remove button", () => {
  it("a failure that throws reaches the status line", async () => {
    const { root } = await makeRoot();
    const { c, said } = ctx(root);
    c.hist = { push: () => { throw new Error("history broke"); } };
    const run = makeRemoveRunner(() => c);
    await run([ID]);
    expect(said.at(-1)?.err).toBe(true);
    expect(said.at(-1)?.msg).toContain("history broke");
  });

  it("a second click while a removal runs starts nothing", async () => {
    const { root } = await makeRoot();
    const { c, pushed, said } = ctx(root);
    const run = makeRemoveRunner(() => c);
    await Promise.all([run([ID]), run([ID])]);
    expect(pushed).toHaveLength(1);
    expect(said.some((s) => /already/i.test(s.msg))).toBe(true);
  });
});

describe("Undo of a Remove never runs endless", () => {
  it("settles even when the stored folder handles never answer", async () => {
    const { applyEntry } = await import("../src/state/apply");
    const { root } = await makeRoot();
    const { c, pushed } = ctx(root);
    await removeFromList(c, [ID]);
    handlesSpy.mockImplementation(never);
    vi.useFakeTimers();
    let settled = false;
    void applyEntry(pushed[0], pushed[0].before).finally(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(25_000);
    expect(settled).toBe(true);
  });
});
