// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { newPairMeta, sideOf } from "../src/lib/pairmeta";
import { pairId } from "../src/lib/pairing";
import { rebaseMeta } from "../src/lib/pairrebase";
import { styleRowId } from "../src/lib/svgstyles";
import { switchStyle } from "../src/svg/styles";
import { toRow, rebuildRow } from "../src/svg/rowmodel";
import { chooseMainImage } from "../src/svg/imagechoice";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import type { SvgSource, Discovery } from "../src/svg/sources";
import type { SvgRefs, SvgRow } from "../src/svg/types";
import { parseImageVersions, mainImageOf } from "../src/lib/svgimgreg";

const baseId = pairId("folder", "icon", "");
const source: SvgSource = { id: baseId, name: "icon_AI.png", stem: "icon_AI", relPath: "folder/icon_AI.png", dirPath: "folder", fingerprint: "1:1", problems: [], metaPath: "folder/icon_AI.svg.json", base: "icon", suffix: "", sourcePath: null, sourceFingerprint: null };
const meta = { ...newPairMeta({ id: styleRowId(baseId, "color"), base: "icon", suffix: "", dirPath: "folder/_color", ai: sideOf("folder/_color/icon_AI_color.png", ""), source: null }), imageVersions: parseImageVersions([{ version: 2, file: "old/folder/_color/icon_AI_color_02.png", status: "done", prompt: "", model: "", updatedAt: "2026-01-01" }]), imagePreferred: 2 };

describe("style preview source regressions", () => {
  it("rebases style identity and image files alongside the pair", () => {
    const next = rebaseMeta(meta, "_color");
    expect(next.id).toBe(styleRowId(pairId("", "icon", ""), "color"));
    expect(next.imageVersions[0].file).toBe("_color/icon_AI_color_02.png");
    const nested = { ...meta, imageVersions: [{ ...meta.imageVersions[0], file: "old/folder/_color/AI source regeneration versions/icon.png" }] };
    expect(rebaseMeta(nested, "_color").imageVersions[0].file).toBe("_color/AI source regeneration versions/icon.png");
  });
  it("puts the selected style metadata in the generation cache when switching from Base", () => {
    const current = { ...meta, imageVersions: [{ ...meta.imageVersions[0], file: "folder/_color/icon_AI_color_02.png" }] };
    const discovery = { sources: [source], metas: new Map([[current.id, current]]) } as unknown as Discovery;
    const refs = { metas: new Map([[source.id, null]]) } as unknown as SvgRefs;
    let rows: SvgRow[] = [toRow(source, null, false)];
    switchStyle({ refs, discovery, get rows() { return rows; }, setRows: (v) => { rows = v; }, say: () => {} }, "color");
    expect(rows[0].source.id).toBe(current.id);
    expect(mainImageOf(refs.metas.get(current.id) ?? null, rows[0].source.relPath)).toBe("folder/_color/icon_AI_color_02.png");
  });
  it("updates the base comparison when its own version is accepted", async () => {
    const root = new FakeDir("root"), folder = new FakeDir("folder");
    root.children.set("folder", folder);
    folder.children.set("base_v2.png", new FakeFile("base_v2.png", 10, 1, "image"));
    const baseMeta = { ...newPairMeta({ id: baseId, base: "icon", suffix: "", dirPath: "folder", ai: sideOf(source.relPath, "1:1"), source: null }), imageVersions: [{ ...meta.imageVersions[0], file: "folder/base_v2.png" }] };
    const base = toRow(source, baseMeta, false);
    let rows: SvgRow[] = [{ ...toRow({ ...source, id: meta.id }, meta, false), baseRow: base, baseAiPath: source.relPath }];
    const refs = { root: { current: root }, metas: new Map([[baseId, baseMeta]]), queue: { current: [] } } as unknown as SvgRefs;
    await chooseMainImage({ refs, rows, say: () => {}, setRowsFn: (f) => { rows = f(rows); } }, baseId, 2);
    expect(rows[0].baseAiPath).toBe("folder/base_v2.png");
    expect(rows[0].baseRow?.meta?.imagePreferred).toBe(2);
    expect(rebuildRow(rows[0], meta, false).baseAiPath).toBe("folder/base_v2.png");
  });

  it("finds saved style pair files with a versioned stem on rescan", async () => {
    const { stylePairPaths } = await import("../src/svg/stylepaths");
    const root = new FakeDir("root"), folder = new FakeDir("folder"), style = new FakeDir("_color");
    root.children.set("folder", folder); folder.children.set("_color", style);
    style.children.set("icon_AI_v2_color.svg.json", new FakeFile("icon_AI_v2_color.svg.json"));
    style.children.set("other_AI_color.svg.json", new FakeFile("other_AI_color.svg.json"));
    expect(await stylePairPaths(root, source, "color")).toEqual(["folder/_color/icon_AI_v2_color.svg.json"]);
  });

  it("does not widen control cells beyond narrow preview slots", () => {
    const css = readFileSync("src/index.css", "utf8");
    expect(css).toMatch(/\.svg-pair-bar\s*\{[^}]*min-width:\s*0/);
  });

});
