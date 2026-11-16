// @vitest-environment node
// svg_builder_discovery.test.ts — TDD for all-folder approved discovery.
// Runs the REAL walk/pair loader over a fake folder tree: the builder sees
// approved pairs outside split scope, ignores its own output folders, and
// keeps the upload tab's default scope rule unchanged.
import { describe, expect, it } from "vitest";
import { serializePairMeta } from "../src/lib/pairmeta";
import { discoverUploadSources } from "../src/upload/discovery";
import { discoverBuilderAssets, BUILDER_IGNORE } from "../src/svgBuilder/discovery";
import { assetsFromRows, filterAssets } from "../src/lib/svgBuilder/assets";
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

  it("uses export/export.json metadata: title is the name; title, description and tags are searchable tags", async () => {
    const r = root();
    const first = await discoverBuilderAssets(r);
    const star = first.assets.find((a) => a.base === "star")!;
    const exportDir = new FakeDir("export");
    const record = exportRecord(star.id, { title: "Shining favourite rating star", description: "A bright star marks a favourite item", tags: ["favourite", "rating", "icon"] });
    exportDir.children.set("export.json", new FakeFile("export.json", record.length, 3600, record));
    ((r.children.get("icons") as FakeDir).children.get("ui") as FakeDir).children.set("export", exportDir);
    const found = await discoverBuilderAssets(r);
    const named = found.assets.find((a) => a.id === star.id)!;
    expect(named.label).toBe("Shining favourite rating star");
    expect(named.description).toBe("A bright star marks a favourite item");
    expect(named.keywords).toEqual(["favourite", "rating", "icon"]);
    expect(named.tags).toEqual(expect.arrayContaining(["favourite", "rating", "shining", "bright"]));
    expect(found.withMetadata).toBe(1);
    expect(filterAssets(found.assets, "bright", "All").map((a) => a.id)).toEqual([star.id]);
    expect(filterAssets(found.assets, "#rating", "All").map((a) => a.id)).toEqual([star.id]);
    const fog = found.assets.find((a) => a.base === "fog")!;
    expect(fog.label).toMatch(/fog/i); // no export.json → file-name fallback
  });

  it("reads the one-word Icon Name from export.json for the captions (2026-11-13)", async () => {
    const r = root();
    const first = await discoverBuilderAssets(r);
    const star = first.assets.find((a) => a.base === "star")!;
    const exportDir = new FakeDir("export");
    const record = exportRecord(star.id, { title: "Shining favourite rating star", description: "A bright star", tags: ["star"], name: " Star, bright " });
    exportDir.children.set("export.json", new FakeFile("export.json", record.length, 3600, record));
    ((r.children.get("icons") as FakeDir).children.get("ui") as FakeDir).children.set("export", exportDir);
    const found = await discoverBuilderAssets(r);
    const named = found.assets.find((a) => a.id === star.id)!;
    expect(named.name).toBe("star"); // the stored Icon Name rule: first word, lowercase, letters/digits only
    expect(named.label).toBe("Shining favourite rating star"); // the library keeps the title
    expect(found.assets.find((a) => a.base === "fog")!.name).toBeUndefined();
  });

  it("ignores an export.json written for a different pair", async () => {
    const r = root();
    const exportDir = new FakeDir("export");
    const record = exportRecord("someone-else", { title: "Wrong icon title here now", description: "", tags: ["wrong"] });
    exportDir.children.set("export.json", new FakeFile("export.json", record.length, 3600, record));
    ((r.children.get("icons") as FakeDir).children.get("ui") as FakeDir).children.set("export", exportDir);
    const found = await discoverBuilderAssets(r);
    expect(found.assets.find((a) => a.base === "star")!.label).toMatch(/star/i);
    expect(found.withMetadata).toBe(0);
  });

  it("reports an honest empty result instead of inventing Lucide icons", async () => {
    const empty = new FakeDir("empty");
    const found = await discoverBuilderAssets(empty);
    expect(found.assets).toEqual([]);
    expect(found.audit.rows).toBe(0);
    expect(found.audit.files).toBe(0);
  });
});

/** The minimum export.json `parseExportRecord` accepts, with a metadata block. */
function exportRecord(pairId: string, meta: { title: string; description: string; tags: string[]; name?: string }): string {
  return JSON.stringify({
    v: 1, pair: { id: pairId, base: "star", suffix: "", dir: OUTSIDE }, source: { svgPath: "", version: 1, approval: "approved", fingerprint: "f" },
    settings: { fingerprint: "s" }, tools: { svgo: {}, eps: {} }, outputs: { svg: null, jpg: null, eps: null }, timestamps: { preparedAt: "" },
    metadata: { state: "accepted", ...meta },
  });
}
