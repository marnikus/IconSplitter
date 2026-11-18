// @vitest-environment happy-dom
// svg_remove_row_styles.test.ts — Remove works in EVERY mode and removes the
// row item FULLY (2026-11-17): declining a row declines its base pair AND every
// style pair it has, as ONE undo step, so a removal made while a style is picked
// (or in the all-styles list) takes the row out of every mode; and a pair
// declined since the last scan never returns when the pinned style bar rebuilds
// the rows from the scan's records (the old bug: remove in base, switch to a
// style, the row is back).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadHandles } from "../src/batch/store";
import { pairId } from "../src/lib/pairing";
import { loadMetaAt, saveMetaAt } from "../src/selection/pairstore";
import { applyEntry } from "../src/state/apply";
import { patchSvg } from "../src/state/appstore";
import { saveSourceIndex } from "../src/state/sourceindex";
import { SVG_HANDLE_KEY } from "../src/state/handlekeys";
import { styleRowId } from "../src/lib/svgstyles";
import { reactToDecisions, removeFromList, type RemoveCtx } from "../src/svg/removerows";
import { resetStylePrefs, rowsForAllStyles, rowsForStyle, STYLES_KEY } from "../src/svg/styles";
import { toRow } from "../src/svg/rowmodel";
import type { Discovery } from "../src/svg/sources";
import type { HistoryEntry } from "../src/lib/history";
import type { SvgRefs, SvgRow } from "../src/svg/types";
import { pairFile } from "./helpers/pairfile";
import { sideOf, type PairMeta } from "../src/lib/pairmeta";
import { svgSource } from "./helpers/svgpair";
import { FakeDir, FakeFile } from "./helpers/fakefs";

vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return { ...actual, loadHandles: vi.fn(async () => null) };
});
const handlesSpy = vi.mocked(loadHandles);

const STYLE = "flat";
const META_PATH = "a/a_AI.svg.json";
const STYLE_META_PATH = `a/_${STYLE}/a_AI_${STYLE}.svg.json`;
const ID = pairId("a", "a", "");
const STYLE_ID = styleRowId(ID, STYLE);

/** One approved pair `a` with one approved style pair in `a/_flat`. */
async function makeRoot(): Promise<FakeDir> {
  const root = new FakeDir("root");
  const dir = new FakeDir("a");
  dir.children.set("a.png", new FakeFile("a.png", 10, 10, "o"));
  dir.children.set("a_AI.png", new FakeFile("a_AI.png", 20, 20, "a"));
  const style = new FakeDir(`_${STYLE}`);
  style.children.set(`a_AI_${STYLE}.png`, new FakeFile(`a_AI_${STYLE}.png`, 30, 30, "s"));
  dir.children.set(`_${STYLE}`, style);
  root.children.set("a", dir);
  await saveMetaAt(root, META_PATH, pairFile("a", "a_AI.png", { decision: "approved", sourceName: "a.png" }));
  await saveMetaAt(root, STYLE_META_PATH, styleMetaOf());
  saveSourceIndex([{ id: ID, relPath: "a/a_AI.png", name: "a_AI.png", fingerprint: "20:20" }]);
  return root;
}

function ctx(rows: SvgRow[], root: FakeDir, metas: Map<string, PairMeta>) {
  const pushed: HistoryEntry[] = [];
  const said: { msg: string; err: boolean }[] = [];
  const c: RemoveCtx = {
    refs: { root: { current: root }, metas } as unknown as RemoveCtx["refs"],
    rows,
    say: (msg, err = false) => said.push({ msg, err }),
    hist: { push: (e) => { pushed.push(e as HistoryEntry); } },
  };
  return { c, pushed, said };
}

/** The scan's records: both pair files as they were read (approved). */
function discoveryOf(metas: Map<string, PairMeta>): Discovery {
  return { sources: [svgSource(ID, { dir: "a", name: "a_AI.png", sourceName: "a.png", fingerprint: "20:20" })], metas, corruptFiles: [] } as unknown as Discovery;
}

let metas: Map<string, PairMeta>;
beforeEach(async () => {
  handlesSpy.mockReset();
  handlesSpy.mockImplementation(async (key: string) => (key === SVG_HANDLE_KEY ? { source: null as never } : null));
  saveSourceIndex([]);
  patchSvg({ checked: [], activeId: null, anchorId: null });
  localStorage.setItem(STYLES_KEY, JSON.stringify({ styles: [STYLE], active: null, showAll: false }));
  resetStylePrefs();
  metas = new Map();
});

const decisionAt = async (root: FakeDir, path: string) => (await loadMetaAt(root, path)).meta?.decision;

/** The style pair file as registration writes it: the BASE row's identity, its own face in `_<style>` (pairrebase re-derives the id from both). */
const styleMetaOf = (): PairMeta => ({ ...pairFile("a", "a_AI.png", { decision: "approved", sourceName: null }), id: STYLE_ID,
  ai: sideOf(`a/_${STYLE}/a_AI_${STYLE}.png`, "30:30") });

describe("Remove takes the row out of every style", () => {
  it("removing a base row declines the base pair AND every style pair, as one undo step", async () => {
    const root = await makeRoot();
    handlesSpy.mockImplementation(async (key: string) => (key === SVG_HANDLE_KEY ? { source: root as never } : null));
    const baseMeta = pairFile("a", "a_AI.png", { decision: "approved", sourceName: "a.png" });
    const styleMeta = styleMetaOf();
    metas.set(ID, baseMeta); metas.set(STYLE_ID, styleMeta);
    const { c, pushed } = ctx([toRow(svgSource(ID, { dir: "a", name: "a_AI.png", sourceName: "a.png", fingerprint: "20:20" }), baseMeta, false)], root, metas);
    expect(await removeFromList(c, [ID])).toBe(true);
    expect(await decisionAt(root, META_PATH)).toBe("declined");
    expect(await decisionAt(root, STYLE_META_PATH)).toBe("declined"); // the style goes with it
    expect(pushed).toHaveLength(1);
    expect(pushed[0].ids).toEqual(expect.arrayContaining([ID, STYLE_ID]));
    const after = (pushed[0].after as { recs: { pair_id: string; decision: string }[] }).recs;
    expect(after.map((r) => r.decision)).toEqual(["declined", "declined"]);
    const before = (pushed[0].before as { recs: { decision: string }[] }).recs;
    expect(before.map((r) => r.decision)).toEqual(["approved", "approved"]);
    await expect(applyEntry(pushed[0], pushed[0].before)).resolves.toBe(true); // one undo brings both back
    expect(await decisionAt(root, META_PATH)).toBe("approved");
    expect(await decisionAt(root, STYLE_META_PATH)).toBe("approved");
  });

  it("removing the row while a style is picked declines the whole family too", async () => {
    const root = await makeRoot();
    handlesSpy.mockImplementation(async (key: string) => (key === SVG_HANDLE_KEY ? { source: root as never } : null));
    const baseMeta = pairFile("a", "a_AI.png", { decision: "approved", sourceName: "a.png" });
    const styleMeta = styleMetaOf();
    metas.set(ID, baseMeta); metas.set(STYLE_ID, styleMeta);
    const refs = { root: { current: root }, metas } as unknown as SvgRefs;
    const styled = rowsForStyle(discoveryOf(metas), refs, STYLE);
    expect(styled.map((r) => r.source.id)).toEqual([STYLE_ID]); // the list shows the style row
    const { c } = ctx(styled, root, metas);
    expect(await removeFromList(c, [STYLE_ID])).toBe(true);
    expect(await decisionAt(root, META_PATH)).toBe("declined");
    expect(await decisionAt(root, STYLE_META_PATH)).toBe("declined");
  });

  it("the listed family rows leave the list together", async () => {
    const baseMeta = pairFile("a", "a_AI.png", { decision: "approved", sourceName: "a.png" });
    const styleMeta = styleMetaOf();
    metas.set(ID, baseMeta); metas.set(STYLE_ID, styleMeta);
    const base = toRow(svgSource(ID, { dir: "a", name: "a_AI.png", sourceName: "a.png", fingerprint: "20:20" }), baseMeta, false);
    const style = toRow(svgSource(STYLE_ID, { dir: `a/_${STYLE}`, name: `a_AI_${STYLE}.png`, sourceName: null, fingerprint: "30:30" }), styleMeta, false);
    let rows = [base, style];
    reactToDecisions({ rows, setRowsFn: (fn) => { rows = fn(rows); } },
      [{ id: ID, decision: "declined" }, { id: STYLE_ID, decision: "declined" }]);
    expect(rows).toEqual([]);
  });
});

describe("a declined pair never returns on a style switch", () => {
  it("the rebuild from the scan's records skips pairs declined since the scan", async () => {
    const root = await makeRoot();
    handlesSpy.mockImplementation(async (key: string) => (key === SVG_HANDLE_KEY ? { source: root as never } : null));
    const baseMeta = pairFile("a", "a_AI.png", { decision: "approved", sourceName: "a.png" });
    const styleMeta = styleMetaOf();
    metas.set(ID, baseMeta); metas.set(STYLE_ID, styleMeta);
    const refs = { root: { current: root }, metas } as unknown as SvgRefs;
    const discovery = discoveryOf(metas);
    const base = toRow(svgSource(ID, { dir: "a", name: "a_AI.png", sourceName: "a.png", fingerprint: "20:20" }), baseMeta, false);
    const { c } = ctx([base], root, metas);
    expect(await removeFromList(c, [ID])).toBe(true);
    // the scan's records still say approved — the rebuild must know better
    expect(rowsForStyle(discovery, refs, STYLE)).toEqual([]);
    expect(rowsForStyle(discovery, refs, null)).toEqual([]);
    const metaOf = (id: string) => metas.get(id) ?? discovery.metas.get(id) ?? null;
    expect(rowsForAllStyles(discovery, metaOf, [STYLE])).toEqual([]);
  });
});
