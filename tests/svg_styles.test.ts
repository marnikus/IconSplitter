// @vitest-environment happy-dom
// svg_styles.test.ts — image styles in the Generate SVG tab (2026-11-16): a
// `_<style>` folder beside a row holds that style's images; only the numbered
// ones (`_01`…) are variants; the style becomes the row's own style pair file
// and the picked style swaps the rows that have it.
import { beforeEach, describe, expect, it } from "vitest";
import { styleFilesOf, styleOfFolder, styleRowId, baseRowId } from "../src/lib/svgstyles";
import { registerStyles, resetStylePrefs, rowsForAllStyles, rowsForStyle, stylePrefs, switchStyle, STYLES_KEY } from "../src/svg/styles";
import { toRow } from "../src/svg/rowmodel";
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
    const allRows = rowsForAllStyles(discovery, (id) => refs.metas.get(id) ?? discovery.metas.get(id), ["colored_wiggle"]);
    expect(allRows.map((r) => r.source.id)).toEqual(["pair_1", "pair_1~colored_wiggle"]);
    expect(allRows[0].review).toBe("pending");
    expect(allRows[1].review).toBe("pending");
    switchStyle(c, null);
    expect(rowsForStyle(discovery, refs, null)[0].source.id).toBe("pair_1");
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
    expect(applySvgFilters([{ ...row("a", "none"), styleName: "base", hasAi: true }, { ...row("b~colored_wiggle", "ai"), styleName: "colored_wiggle", hasAi: true }], { ...ALL_SVG_FILTER, style: ["base", "ai"] }).map((r) => r.id)).toEqual(["a"]);
    expect(applySvgFilters([{ ...row("a", "none"), styleName: "base", hasAi: true }, { ...row("b~colored_wiggle", "ai"), styleName: "colored_wiggle", hasAi: true }], { ...ALL_SVG_FILTER, style: ["style:colored_wiggle", "ai"] }).map((r) => r.id)).toEqual(["b~colored_wiggle"]);
  });
});

describe("style persistence and 3-slot preview", () => {
  it("PairedThumbs renders all 3 slots when Base · Stroke, AI source, and SVG are passed", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { default: PairedThumbs } = await import("../src/ui/PairedThumbs");
    const html = renderToStaticMarkup(
      PairedThumbs({
        slots: [
          { tag: "Base · Stroke", testid: "slot-base", width: 100, height: 100, children: null },
          { tag: "AI source", testid: "slot-ai", width: 100, height: 100, children: null },
          { tag: "SVG", testid: "slot-svg", width: 100, height: 100, children: null },
        ],
      }),
    );
    expect(html).toContain("Base · Stroke");
    expect(html).toContain("AI source");
    expect(html).toContain("SVG");
  });
});
