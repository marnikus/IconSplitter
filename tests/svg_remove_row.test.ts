// svg_remove_row.test.ts — "Remove" in Generate SVG (2026-11-04): taking a row
// out of the list IS declining its image in Selection V2. It writes the same
// pair decision through the same path a Selection V2 decline uses, records the
// same "decisions" history entry (so undo restores approved and the row comes
// back), and is refused for a row that is generating or waiting in the queue.
// The list itself reacts to written decisions — a click, an undo or a redo:
// a pair that is no longer approved leaves, one that became approved returns
// on a rescan.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyDecisionPatch, onDecisionsWritten, SELECTION_HANDLE_KEY } from "../src/selection/offline";
import { loadMetaAt, saveMetaAt } from "../src/selection/pairstore";
import { loadHandles } from "../src/batch/store";
import { applyEntry } from "../src/state/apply";
import { getAppState, patchSvg } from "../src/state/appstore";
import { saveSourceIndex } from "../src/state/sourceindex";
import { SVG_HANDLE_KEY } from "../src/state/handlekeys";
import { reactToDecisions, removeFromList, type RemoveCtx } from "../src/svg/removerows";
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
/** The id a real scan gives pair `a/a_AI.png` — the row and its file agree on it. */
const ID = pairId("a", "a", "");

/** One approved pair `a` on disk, known to the id -> path index. */
async function makeRoot(): Promise<FakeDir> {
  const root = new FakeDir("root");
  const dir = new FakeDir("a");
  dir.children.set("a.png", new FakeFile("a.png", 10, 10, "o"));
  dir.children.set("a_AI.png", new FakeFile("a_AI.png", 20, 20, "a"));
  root.children.set("a", dir);
  await saveMetaAt(root, META_PATH, pairFile("a", "a_AI.png", { decision: "approved", sourceName: "a.png" }));
  saveSourceIndex([{ id: ID, relPath: "a/a_AI.png", name: "a_AI.png", fingerprint: "20:20" }]);
  return root;
}

/** Only the Generate SVG folder is remembered — Selection V2 was never opened. */
function svgRootOnly(root: FakeDir): void {
  handlesSpy.mockImplementation(async (key: string) => (key === SVG_HANDLE_KEY ? { source: root as never } : null));
}

async function decisionOf(root: FakeDir): Promise<string | null | undefined> {
  return (await loadMetaAt(root, META_PATH)).meta?.decision;
}

function rowA(patch: Partial<SvgRow> = {}): SvgRow {
  const source = svgSource(ID, { dir: "a", name: "a_AI.png", sourceName: "a.png", fingerprint: "20:20" });
  return { ...toRow(source, null, false), ...patch };
}

function ctx(rows: SvgRow[], root: FakeDir) {
  const pushed: HistoryEntry[] = [];
  const said: { msg: string; err: boolean }[] = [];
  const c: RemoveCtx = {
    refs: { root: { current: root }, metas: new Map() } as unknown as RemoveCtx["refs"],
    rows,
    say: (msg, err = false) => said.push({ msg, err }),
    hist: { push: (e) => { pushed.push(e as HistoryEntry); } },
  };
  return { c, pushed, said };
}

beforeEach(() => {
  handlesSpy.mockReset();
  handlesSpy.mockResolvedValue(null);
  saveSourceIndex([]);
  patchSvg({ checked: [], activeId: null, anchorId: null });
});

describe("the shared decision file path", () => {
  it("also finds the pair under the Generate SVG folder, and announces what it wrote", async () => {
    const root = await makeRoot();
    svgRootOnly(root);
    const heard: { id: string; decision: string }[][] = [];
    const off = onDecisionsWritten((written) => heard.push(written));
    const rec = { pair_id: ID, source: "a/a.png", ai_result: "a/a_AI.png", decision: "declined" as const, reviewed_at: "2026-11-04T10:00:00.000Z" };
    await expect(applyDecisionPatch([ID], { recs: [rec] })).resolves.toBe(true);
    off();
    expect(await decisionOf(root)).toBe("declined");
    expect(heard).toEqual([[{ id: ID, decision: "declined" }]]);
    expect(handlesSpy).toHaveBeenCalledWith(SELECTION_HANDLE_KEY);
  });
});

describe("removeFromList", () => {
  it("declines the image, records Selection V2's own undo entry and says where it went", async () => {
    const root = await makeRoot();
    svgRootOnly(root);
    const { c, pushed, said } = ctx([rowA()], root);
    expect(await removeFromList(c, [ID])).toBe(true);
    expect(await decisionOf(root)).toBe("declined");
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ type: "decisions", ids: [ID] });
    expect((pushed[0].before as { recs: { decision: string }[] }).recs.map((r) => r.decision)).toEqual(["approved"]);
    expect((pushed[0].after as { recs: { decision: string }[] }).recs.map((r) => r.decision)).toEqual(["declined"]);
    expect(said.at(-1)?.msg).toContain("declined in Selection V2");
  });

  it("undo through the history restores approved", async () => {
    const root = await makeRoot();
    svgRootOnly(root);
    const { c, pushed } = ctx([rowA()], root);
    await removeFromList(c, [ID]);
    await expect(applyEntry(pushed[0], pushed[0].before)).resolves.toBe(true);
    expect(await decisionOf(root)).toBe("approved");
    await expect(applyEntry(pushed[0], pushed[0].after)).resolves.toBe(true); // redo
    expect(await decisionOf(root)).toBe("declined");
  });

  it("refuses a row that is generating or queued, writing nothing", async () => {
    const root = await makeRoot();
    svgRootOnly(root);
    for (const busy of [{ running: true }, { queued: true }]) {
      const { c, pushed, said } = ctx([rowA(busy)], root);
      expect(await removeFromList(c, [ID])).toBe(false);
      expect(pushed).toHaveLength(0);
      expect(said.at(-1)?.err).toBe(true);
    }
    expect(await decisionOf(root)).toBe("approved");
  });

  it("records nothing when the decision could not be written", async () => {
    const root = await makeRoot(); // no folder remembered at all
    const { c, pushed, said } = ctx([rowA()], root);
    expect(await removeFromList(c, [ID])).toBe(false);
    expect(pushed).toHaveLength(0);
    expect(said.at(-1)).toMatchObject({ err: true });
  });
});

describe("the list follows written decisions", () => {
  it("drops a row that is no longer approved and unchecks it", () => {
    patchSvg({ checked: [ID, "b"], activeId: ID, anchorId: ID });
    let rows = [rowA(), { ...rowA(), source: { ...rowA().source, id: "b" } }];
    const out = reactToDecisions({ rows, setRowsFn: (fn) => { rows = fn(rows); } }, [{ id: ID, decision: "declined" }]);
    expect(rows.map((r) => r.source.id)).toEqual(["b"]);
    expect(getAppState().svg.checked).toEqual(["b"]);
    expect(getAppState().svg.activeId).toBeNull();
    expect(out.rescan).toBe(false);
  });

  it("asks for a rescan when an approved pair is missing from the list", () => {
    let rows: SvgRow[] = [];
    const out = reactToDecisions({ rows, setRowsFn: (fn) => { rows = fn(rows); } }, [{ id: ID, decision: "approved" }]);
    expect(out.rescan).toBe(true);
    expect(reactToDecisions({ rows: [rowA()], setRowsFn: () => undefined }, [{ id: ID, decision: "approved" }]).rescan).toBe(false);
  });
});

describe("wired into the tab", () => {
  const src = (p: string) => readFileSync(p, "utf8");
  it("every row has a Remove button and the bulk bar a Remove selected", () => {
    expect(src("src/svg/SvgRow.tsx")).toContain("svg-remove-${id}");
    expect(src("src/svg/SvgBulkBar.tsx")).toContain('data-testid="svg-remove-selected"');
  });
  it("the panel listens to written decisions", () => {
    expect(src("src/svg/actions.ts")).toContain("useDecisionFollower(");
  });
});
