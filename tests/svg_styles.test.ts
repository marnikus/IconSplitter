// @vitest-environment happy-dom
// svg_styles.test.ts — image styles in the Generate SVG tab (2026-11-16): a
// `_<style>` folder beside a row holds that style's images; only the numbered
// ones (`_01`…) are variants; the style becomes the row's own style pair file
// and the picked style swaps the rows that have it.
import { beforeEach, describe, expect, it } from "vitest";
import { styleFilesOf, styleOfFolder, styleRowId, baseRowId } from "../src/lib/svgstyles";
import { registerStyles, resetStylePrefs, rowsForStyle, stylePrefs, switchStyle, STYLES_KEY } from "../src/svg/styles";
import { toRow } from "../src/svg/rowmodel";
import { cancelRegister, registerSlot, type RegisterProgress } from "../src/svg/registerprogress";
import type { SvgSource } from "../src/svg/sources";
import type { Discovery } from "../src/svg/sources";
import type { SvgRefs, SvgRow } from "../src/svg/types";
import { FakeDir, FakeFile } from "./helpers/fakefs";

const STEM = "download-icon-31_AI_03";
const NAMES = [`${STEM}_v2_colored_wiggle.png`, `${STEM}_v2_colored_wiggle_01.png`, `${STEM}_v2_colored_wiggle_02.png`,
  `${STEM}_v2_colored_wiggle_03.png`, `${STEM}_v2_colored_wiggle_04.png`, "other-icon_colored_wiggle_01.png", `${STEM}_v2_colored_wiggle_01.svg`];

describe("style names", () => {
  it("a style folder is `_<words>`; the style is the LAST suffix, after the version; only numbered images are variants", () => {
    expect([styleOfFolder("_colored_wiggle"), styleOfFolder("export"), styleOfFolder("_")]).toEqual(["colored_wiggle", null, null]);
    const files = styleFilesOf(STEM, "colored_wiggle", NAMES);
    expect(files.main).toBe(`${STEM}_v2_colored_wiggle.png`);
    expect(files.variants.map((v) => v.n)).toEqual([1, 2, 3, 4]);
    expect(styleFilesOf(STEM, "colored_wiggle", [`${STEM}_colored_wiggle_01.png`]).variants).toHaveLength(1); // no version: right after _NN
    expect(baseRowId(styleRowId("pair_1", "colored_wiggle"))).toBe("pair_1");
  });
});

const DIR = "_split_output/2026-11/asset 5/download-icon-31_AI/split_03";
function tree(): FakeDir {
  const root = new FakeDir("test_process_6");
  let d = root;
  for (const part of DIR.split("/")) { const n = new FakeDir(part); d.children.set(part, n); d = n; }
  const style = new FakeDir("_colored_wiggle");
  d.children.set("_colored_wiggle", style);
  for (const n of NAMES) style.children.set(n, new FakeFile(n, 10, 1, "png"));
  d.children.set("export", new FakeDir("export"));
  return root;
}
const source: SvgSource = { id: "pair_1", name: `${STEM}.png`, stem: STEM, relPath: `${DIR}/${STEM}.png`, dirPath: DIR, fingerprint: "1:1", problems: [],
  metaPath: `${DIR}/${STEM}.svg.json`, base: "download-icon-31", suffix: "_03", sourcePath: null, sourceFingerprint: null };

beforeEach(() => { localStorage.removeItem(STYLES_KEY); resetStylePrefs(); });

describe("register and switch styles", () => {
  it("writes the style pair file with its 4 variants, lists the style, and the switch shows the style row", async () => {
    const root = tree();
    const refs = { root: { current: root }, metas: new Map() } as unknown as SvgRefs;
    const discovery = { sources: [source], metas: new Map() } as unknown as Discovery;
    let rows: SvgRow[] = [toRow(source, null, false)];
    const said: string[] = [];
    const c = { refs, get rows() { return rows; }, discovery, say: (m: string) => said.push(m), setRows: (r: SvgRow[]) => { rows = r; } };
    await registerStyles(c, ["pair_1"]);
    expect(stylePrefs().styles).toEqual(["colored_wiggle"]);
    const meta = refs.metas.get("pair_1~colored_wiggle")!;
    expect(meta.imageVersions.map((v: { version: number }) => v.version)).toEqual([1, 2, 3, 4]);
    expect(meta.imagePreferred).toBe(1);
    expect(rows[0].source.id).toBe("pair_1"); // still the base style until switched
    switchStyle(c, "colored_wiggle");
    expect(rows[0].source.id).toBe("pair_1~colored_wiggle");
    expect(rows[0].source.dirPath).toBe(`${DIR}/_colored_wiggle`);
    expect(rows[0].source.stem).toBe(`${STEM}_v2_colored_wiggle`); // its SVGs: <stem>.svg, _v2.svg
    switchStyle(c, null);
    expect(rowsForStyle(discovery, refs, null)[0].source.id).toBe("pair_1");
  });
});

describe("style registration progress", () => {
  function context(root: FakeDir, sources: SvgSource[]) {
    const refs = { root: { current: root }, metas: new Map() } as unknown as SvgRefs;
    const discovery = { sources, metas: new Map() } as unknown as Discovery;
    const said: string[] = [];
    const c = { refs, rows: sources.map((s) => toRow(s, null, false)), discovery, say: (m: string) => said.push(m), setRows: () => {} };
    const snapshots: RegisterProgress[] = [];
    const slot = registerSlot(refs);
    slot.listeners.add(() => { if (slot.value) snapshots.push(slot.value); });
    return { c, refs, snapshots, said };
  }

  it("reports each processed folder and newly added style pair, including on a repeat pass", async () => {
    const root = tree();
    const empty = { ...source, id: "empty", dirPath: "empty", name: "empty.png" };
    root.children.set("empty", new FakeDir("empty"));
    const { c, refs, snapshots } = context(root, [source, empty]);
    await registerStyles(c, [source.id, empty.id]);
    expect(snapshots.some((p) => p.phase === "running" && p.done === 1 && p.registered === 1)).toBe(true);
    expect(registerSlot(refs).value).toMatchObject({ kind: "styles", phase: "complete", done: 2, total: 2, registered: 1 });
    await registerStyles(c, [source.id]);
    expect(registerSlot(refs).value).toMatchObject({ done: 1, total: 1, registered: 0 });
  });

  it("reports failed style folders without losing another folder's work or overwriting corrupt metadata", async () => {
    const root = tree();
    let dir = root;
    for (const part of DIR.split("/")) dir = dir.children.get(part) as FakeDir;
    const broken = new FakeDir("_broken");
    const image = `${STEM}_broken_01.png`;
    broken.children.set(image, new FakeFile(image));
    const corrupt = new FakeFile(`${STEM}_broken.svg.json`, 10, 1, "bad metadata");
    broken.children.set(corrupt.name, corrupt);
    dir.children.set("_broken", broken);
    const { c, refs, said } = context(root, [source]);
    await registerStyles(c, [source.id]);
    expect(registerSlot(refs).value).toMatchObject({ phase: "failed", done: 1, registered: 1, skipped: 1 });
    expect(refs.metas.has("pair_1~colored_wiggle")).toBe(true);
    expect(corrupt.text).toBe("bad metadata");
    expect(said.at(-1)).toContain("1 folder(s) could not be read or saved");
  });

  it("does not allow another registration to replace a running progress bar", async () => {
    const { c, refs, said } = context(tree(), [source]);
    const first = registerStyles(c, [source.id]);
    const id = registerSlot(refs).value?.id;
    await registerStyles(c, [source.id]);
    expect(said.at(-1)).toContain("already running");
    expect(registerSlot(refs).value?.id).toBe(id);
    await first;
  });

  it("cancels before the next folder and keeps the actual progress", async () => {
    const root = tree();
    const next = { ...source, id: "next", dirPath: "next", name: "next.png" };
    root.children.set("next", new FakeDir("next"));
    const { c, refs, said } = context(root, [source, next]);
    registerSlot(refs).listeners.add(() => {
      if (registerSlot(refs).value?.done === 1) cancelRegister(refs);
    });
    await registerStyles(c, [source.id, next.id]);
    expect(registerSlot(refs).value).toMatchObject({ phase: "cancelled", done: 1, total: 2, registered: 1 });
    expect(said.at(-1)).toContain("cancelled");
  });
});

describe("the style filter (2026-11-16)", () => {
  it("splits rows in the picked style: AI source only, SVG generated, has it, or without it", async () => {
    const { applySvgFilters, ALL_SVG_FILTER } = await import("../src/lib/svglist");
    const row = (id: string, style: "none" | "ai" | "svg") => ({ id, name: id, relPath: id, generation: "generated" as const, review: "pending" as const,
      generatedAt: null, cost: null, costEstimated: false, tokens: null, version: 1, svgCreatedAt: null, aiCreatedAt: null, style });
    const rows = [row("a", "none"), row("b~s", "ai"), row("c~s", "svg")];
    const ids = (style: "ai" | "svg" | "styled" | "none") => applySvgFilters(rows, { ...ALL_SVG_FILTER, style }).map((r) => r.id);
    expect([ids("ai"), ids("svg"), ids("styled"), ids("none")]).toEqual([["b~s"], ["c~s"], ["b~s", "c~s"], ["a"]]);
    expect(applySvgFilters([row("a", "none")], { ...ALL_SVG_FILTER, style: "ai" })).toHaveLength(1); // base style shown: no effect
  });
});
