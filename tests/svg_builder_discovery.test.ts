// @vitest-environment node
// svg_builder_discovery.test.ts — TDD for all-folder approved discovery.
// Runs the REAL walk/pair loader over a fake folder tree: the builder sees
// approved pairs outside split scope, ignores its own output folders, and
// keeps the upload tab's default scope rule unchanged.
import { describe, expect, it } from "vitest";
import { serializePairMeta } from "../src/lib/pairmeta";
import { discoverUploadSources } from "../src/upload/discovery";
import { discoverBuilderAssets, BUILDER_IGNORE } from "../src/svgBuilder/discovery";
import { assetsFromRows } from "../src/lib/svgBuilder/assets";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';
const RUN = "_split_output/2026-11/2026-11-07_10-00-00";
const INSIDE = `${RUN}/fog_AI/split_01`;
const OUTSIDE = "icons/ui";

function sidecar(dir: string, aiName: string): string {
  const stem = aiName.replace(/\.png$/i, "");
  const meta = pairFile(dir, aiName, {
    versions: [svgVersion(`${dir}/${stem}.svg`, { version: 1, review: "approved" })],
  });
  return serializePairMeta(meta);
}

function pairDir(root: FakeDir, dir: string, aiName: string, metaText: string): void {
  let node = root;
  for (const part of dir.split("/")) {
    const child = node.children.get(part);
    if (child instanceof FakeDir) node = child;
    else {
      const made = new FakeDir(part);
      node.children.set(part, made);
      node = made;
    }
  }
  const stem = aiName.replace(/\.png$/i, "");
  node.children.set(aiName, new FakeFile(aiName, 20, 3100, "ai"));
  node.children.set(`${stem}.svg`, new FakeFile(`${stem}.svg`, SVG.length, 3400, SVG));
  node.children.set(`${stem}.svg.json`, new FakeFile(`${stem}.svg.json`, metaText.length, 3500, metaText));
}

function root(): FakeDir {
  const r = new FakeDir("my_icons");
  pairDir(r, INSIDE, "fog_AI.png", sidecar(INSIDE, "fog_AI.png"));
  pairDir(r, OUTSIDE, "star_AI.png", sidecar(OUTSIDE, "star_AI.png"));
  pairDir(r, "export", "old_AI.png", sidecar("export", "old_AI.png"));
  pairDir(r, "svg-builder", "sheet_AI.png", sidecar("svg-builder", "sheet_AI.png"));
  return r;
}

describe("approved-SVG discovery options", () => {
  it("keeps the upload tab's split-scope rule by default", async () => {
    const found = await discoverUploadSources(root());
    expect(found.rows.map((r) => r.dirPath)).toEqual([INSIDE]);
    expect(found.excluded.some((e) => e.kind === "outside-split")).toBe(true);
  });

  it("lets the builder include all folders while ignoring export and its own output", async () => {
    const found = await discoverUploadSources(root(), { hideOutside: false, ignoreDirs: BUILDER_IGNORE });
    expect(found.rows.map((r) => r.dirPath).sort()).toEqual([INSIDE, OUTSIDE].sort());
    expect(found.rows.some((r) => r.dirPath.startsWith("export"))).toBe(false);
    expect(found.rows.some((r) => r.dirPath.startsWith("svg-builder"))).toBe(false);
  });

  it("turns rows into labelled, categorised, approved-only assets", async () => {
    const found = await discoverBuilderAssets(root());
    expect(found.assets).toHaveLength(2);
    expect(found.assets.every((a) => a.approved)).toBe(true);
    const star = found.assets.find((a) => a.base === "star");
    expect(star?.category).toBe("icons");
    expect(star?.label).toMatch(/star/i);
    expect(star?.tags).toContain("ui");
    expect(assetsFromRows(found.rows)).toHaveLength(2);
  });

  it("reports an honest empty result instead of inventing Lucide icons", async () => {
    const empty = new FakeDir("empty");
    const found = await discoverBuilderAssets(empty);
    expect(found.assets).toEqual([]);
    expect(found.audit.rows).toBe(0);
    expect(found.audit.files).toBe(0);
  });
});
