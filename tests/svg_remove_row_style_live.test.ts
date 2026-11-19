// @vitest-environment happy-dom
// svg_remove_row_style_live.test.ts — the LIVE removal chain in STYLE mode
// (2026-11-18), on style pair files made by the REAL registration writer:
// registration names the style image but never hashes it (`sideOf(rel, "")`),
// so `pairRefOf`/`toRecord` refuse to build its record ("a record must name a
// file") — and a removal then declines ONLY the base pair: the toast says
// "Removed", yet the style row the user looks at stays in the list and its own
// pair file stays approved. Witness for the user's bug report.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadHandles } from "../src/batch/store";
import { pairId } from "../src/lib/pairing";
import { styleRowId } from "../src/lib/svgstyles";
import { loadMetaAt, saveMetaAt } from "../src/selection/pairstore";
import { applyDecisionPatch, clearDecisionsSinceScan, onDecisionsWritten, type DecisionPatch } from "../src/selection/offline";
import { saveSourceIndex } from "../src/state/sourceindex";
import { patchSvg } from "../src/state/appstore";
import { SVG_HANDLE_KEY } from "../src/state/handlekeys";
import { reactToDecisions, removeFromList, type RemoveCtx } from "../src/svg/removerows";
import { registerStyles, resetStylePrefs, rowsForAllStyles, rowsForStyle, STYLES_KEY } from "../src/svg/styles";
import { toRow } from "../src/svg/rowmodel";
import type { HistoryEntry } from "../src/lib/history";
import type { Discovery, SvgSource } from "../src/svg/sources";
import type { SvgRefs, SvgRow } from "../src/svg/types";
import { pairFile } from "./helpers/pairfile";
import { svgSource } from "./helpers/svgpair";
import { FakeDir, FakeFile } from "./helpers/fakefs";

vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return { ...actual, loadHandles: vi.fn(async () => null) };
});
const handlesSpy = vi.mocked(loadHandles);

const STYLE = "v4";
const BASE_META_PATH = "a/a_AI.svg.json";
const STYLE_META_PATH = `a/_${STYLE}/a_AI_${STYLE}.svg.json`;
const ID = pairId("a", "a", "");
const STYLE_ID = styleRowId(ID, STYLE);

/** One approved base pair on disk + its `_<style>` folder, as registration finds it. */
function tree(): FakeDir {
  const root = new FakeDir("root");
  const dir = new FakeDir("a");
  dir.children.set("a.png", new FakeFile("a.png", 10, 1000, "o"));
  dir.children.set("a_AI.png", new FakeFile("a_AI.png", 20, 1000, "a"));
  const style = new FakeDir(`_${STYLE}`);
  style.children.set(`a_AI_${STYLE}.png`, new FakeFile(`a_AI_${STYLE}.png`, 30, 1000, "s"));
  style.children.set(`a_AI_${STYLE}_01.png`, new FakeFile(`a_AI_${STYLE}_01.png`, 31, 1000, "v"));
  dir.children.set(`_${STYLE}`, style);
  root.children.set("a", dir);
  return root;
}

const source: SvgSource = svgSource(ID, { dir: "a", name: "a_AI.png", sourceName: "a.png", fingerprint: "4:1000" });

/** The style mode as the user sees it: real registration, then the styled rows a scan would show. */
async function styleMode() {
  const root = tree();
  handlesSpy.mockImplementation(async (key: string) => (key === SVG_HANDLE_KEY ? { source: root as never } : null));
  const baseMeta = pairFile("a", "a_AI.png", { decision: "approved", sourceName: "a.png" });
  await saveMetaAt(root, BASE_META_PATH, baseMeta);
  saveSourceIndex([{ id: ID, relPath: "a/a_AI.png", name: "a_AI.png", fingerprint: "4:1000" }]);
  const refs = { root: { current: root }, metas: new Map([[ID, baseMeta]]) } as unknown as SvgRefs;
  const discovery = { sources: [source], metas: new Map([[ID, baseMeta]]), corruptFiles: [] } as unknown as Discovery;
  let rows: SvgRow[] = [toRow(source, baseMeta, false)];
  const said: string[] = [];
  await registerStyles({ refs, get rows() { return rows; }, discovery, say: (m: string) => said.push(m), setRows: (r: SvgRow[]) => { rows = r; } }, [ID]);
  rows = rowsForStyle(discovery, refs, STYLE); // the picked style shows its rows
  const pushed: HistoryEntry[] = [];
  const off = onDecisionsWritten((written) => {
    reactToDecisions({ rows, setRowsFn: (fn) => { rows = fn(rows); } }, written);
  });
  const c: RemoveCtx = { refs, get rows() { return rows; }, say: (m: string) => said.push(m), hist: { push: (e: HistoryEntry) => pushed.push(e) } } as unknown as RemoveCtx;
  return { root, refs, discovery, baseMeta, said, pushed, off, c, rowsOf: () => rows };
}

beforeEach(() => {
  handlesSpy.mockReset();
  handlesSpy.mockImplementation(async () => null);
  saveSourceIndex([]);
  patchSvg({ checked: [], activeId: null, anchorId: null });
  localStorage.setItem(STYLES_KEY, JSON.stringify({ styles: [], active: null, showAll: false }));
  resetStylePrefs();
  clearDecisionsSinceScan(); // the overlay is module state: each case starts from a fresh scan
});

describe("Remove in style mode, live chain on registration's own pair files", () => {
  it("registration writes the style pair unhashed — the shape removal must serve", async () => {
    const m = await styleMode();
    m.off();
    const styleMeta = m.refs.metas.get(STYLE_ID)!;
    expect(styleMeta.decision).toBe("approved"); // inherited from the base pair
    expect(styleMeta.ai.fingerprint).toBe(""); // named, never hashed: toRecord refuses it
    expect(styleMeta.source).toBeNull();
    expect(m.rowsOf().map((r) => r.source.id)).toEqual([STYLE_ID]);
  });

  it("the row the user looks at leaves the list, and its own pair file is declined", async () => {
    const m = await styleMode();
    expect(await removeFromList(m.c, [STYLE_ID])).toBe(true);
    m.off();
    // the toast the user saw…
    expect(m.said.some((s) => s.includes("Removed 1 image"))).toBe(true);
    // …must be true for the style pair as well: declined on disk…
    expect((await loadMetaAt(m.root, STYLE_META_PATH)).meta?.decision).toBe("declined");
    expect((await loadMetaAt(m.root, BASE_META_PATH)).meta?.decision).toBe("declined");
    // …and gone from the list the user looks at
    expect(m.rowsOf()).toEqual([]);
    // one undo brings the whole family back
    const entry = m.pushed[0]!;
    expect(entry.ids).toEqual([ID, STYLE_ID]);
    expect(await applyDecisionPatch(entry.ids, entry.before as DecisionPatch)).toBe(true);
    expect((await loadMetaAt(m.root, STYLE_META_PATH)).meta?.decision).toBe("approved");
    expect((await loadMetaAt(m.root, BASE_META_PATH)).meta?.decision).toBe("approved");
  });

  it("a rebuild from the scan records right after the removal keeps the row out", async () => {
    const m = await styleMode();
    expect(await removeFromList(m.c, [STYLE_ID])).toBe(true);
    m.off();
    // the scan's in-memory records still say approved: the overlay must know better
    expect(rowsForStyle(m.discovery, m.refs, STYLE)).toEqual([]);
    expect(rowsForAllStyles(m.discovery, (id) => m.refs.metas.get(id) ?? null, [STYLE]).map((r) => r.source.id)).toEqual([]);
  });

  it("a style pair declined on its own never shows as a style row again", async () => {
    const m = await styleMode();
    m.off();
    // the base re-approved in Selection V2 while its style pair stays declined
    const styleMeta = { ...m.refs.metas.get(STYLE_ID)!, decision: "declined" as const };
    m.refs.metas.set(STYLE_ID, styleMeta);
    m.discovery.metas.set(STYLE_ID, styleMeta);
    clearDecisionsSinceScan(); // a scan has read the files fresh: only the files speak now
    // the picked style falls back to the base row; the all-styles list drops the style row
    expect(rowsForStyle(m.discovery, m.refs, STYLE).map((r) => r.source.id)).toEqual([ID]);
    expect(rowsForAllStyles(m.discovery, (id) => m.refs.metas.get(id) ?? null, [STYLE]).map((r) => r.source.id)).toEqual([ID]);
  });
});
