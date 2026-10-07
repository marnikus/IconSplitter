// RULE 8 — approved-SVG discovery runs for real over a fake folder tree:
// one row per pair with a valid approved SVG version (newest = the export
// source), `export/` never discovered (no export loops), splitscope applied,
// sidecar linkage, unapproved pairs reported not listed, deterministic order.
import { describe, expect, it } from "vitest";
import { serializePairMeta } from "../src/lib/pairmeta";
import { discoverUploadSources, type UploadDiscovery } from "../src/upload/discovery";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";

const OUT = "_split_output/2026-10/2026-10-01_10-24-31";
const DIR = `${OUT}/fog_AI/split_01`;
const AI = "fog_AI.png";
const STEM = "fog_AI";

function sidecar(dir: string, aiName: string, versions: Parameters<typeof svgVersion>[1][]): string {
  const meta = pairFile(dir, aiName, {
    versions: versions.map((o, i) => svgVersion(`${dir}/${STEM}_v${o?.version ?? i + 1}.svg`, o)),
  });
  return serializePairMeta(meta);
}

function approved(o: Parameters<typeof svgVersion>[1] = {}): Parameters<typeof svgVersion>[1] {
  return { review: "approved", ...o };
}

/** A pair folder: AI image, sidecar, and the given SVG files. */
function pairDir(root: FakeDir, dir: string, aiName: string, files: Record<string, string>, metaText: string): FakeDir {
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
  node.children.set(aiName, new FakeFile(aiName, 20, 3100, "ai"));
  node.children.set(`${aiName.replace(/\.png$/i, "")}.svg.json`, new FakeFile(`${aiName.replace(/\.png$/i, "")}.svg.json`, 10, 3300, metaText));
  for (const [name, text] of Object.entries(files)) node.children.set(name, new FakeFile(name, text.length, 3400, text));
  return node;
}

/** The happy tree: two approved pairs in split scope + one unapproved pair. */
function happyRoot(): FakeDir {
  const root = new FakeDir("test_processing");
  pairDir(root, DIR, AI,
    { [`${STEM}.svg`]: "<svg/>", [`${STEM}_v2.svg`]: "<svg/>" },
    sidecar(DIR, AI, [approved({ version: 1 }), approved({ version: 2 })]));
  const other = `${OUT}/mist_AI/split_01`;
  pairDir(root, other, "mist_AI.png",
    { "mist_AI.svg": "<svg/>" },
    sidecar(other, "mist_AI.png", [{ review: "pending", version: 1 }]));
  return root;
}

describe("discoverUploadSources — approved-only, one row per pair", () => {
  it("lists pairs with a valid approved SVG; the newest approved version is the export source", async () => {
    const found = await discoverUploadSources(happyRoot());
    expect(found.rows).toHaveLength(1);
    const row = found.rows[0];
    expect(row.id).toBe(found.rows[0].id);
    expect(row.dirPath).toBe(DIR);
    expect(row.version).toBe(2);
    expect(row.svgPath).toBe(`${DIR}/${STEM}_v2.svg`);
    expect(row.svgName).toBe(`${STEM}_v2.svg`);
    expect(row.fingerprint).toBe("6:3400"); // "<svg/>".length : mtime
    expect(row.aiPath).toBe(`${DIR}/${AI}`);
    expect(row.metaPath).toBe(`${DIR}/${STEM}.svg.json`);
    expect(row.approvedValid).toBe(2);
  });

  it("reports the unapproved pair, never lists it", async () => {
    const found = await discoverUploadSources(happyRoot());
    expect(found.excluded).toHaveLength(1);
    expect(found.excluded[0]).toMatchObject({ kind: "no-approved-svg" });
    expect(found.excluded[0].reason).toContain("approve");
  });

  it("skips an approved version that is invalid or missing on disk", async () => {
    const root = new FakeDir("test_processing");
    pairDir(root, DIR, AI,
      { [`${STEM}.svg`]: "<svg/>" },
      sidecar(DIR, AI, [approved({ version: 1 }), approved({ version: 2, valid: false }), approved({ version: 3 })]));
    const found = await discoverUploadSources(root);
    expect(found.rows).toHaveLength(1);
    expect(found.rows[0].version).toBe(1); // v2 invalid, v3's file missing; v1 stands
    expect(found.excluded).toHaveLength(0);
  });

  it("excludes a pair whose only approved version failed validation", async () => {
    const root = new FakeDir("test_processing");
    pairDir(root, DIR, AI,
      { [`${STEM}.svg`]: "<svg/>" },
      sidecar(DIR, AI, [approved({ version: 1, valid: false })]));
    const found = await discoverUploadSources(root);
    expect(found.rows).toHaveLength(0);
    expect(found.excluded[0]).toMatchObject({ kind: "no-valid-svg" });
  });

  it("excludes AI-named SVGs with no pair file (unapproved)", async () => {
    const root = new FakeDir("test_processing");
    pairDir(root, DIR, AI, { [`${STEM}.svg`]: "<svg/>" }, "not json at all");
    const orphanDir = `${OUT}/lost_AI/split_01`;
    const orphanNode = pairDir(root, orphanDir, "lost_AI.png", { "lost_AI.svg": "<svg/>" }, "{}");
    orphanNode.children.delete("lost_AI.svg.json"); // the orphan has NO pair file
    const found = await discoverUploadSources(root);
    expect(found.rows).toHaveLength(0);
    expect(found.corruptFiles).toEqual([`${DIR}/${STEM}.svg.json`]);
    const orphan = found.excluded.find((e) => e.kind === "no-sidecar");
    expect(orphan?.relPath).toBe(`${orphanDir}/lost_AI.svg`);
  });

  it("never discovers export outputs (no export loops)", async () => {
    const root = happyRoot();
    const exportDir = `${DIR}/export`;
    pairDir(root, exportDir, "fog_AI.png",
      { "fog_AI.svg": "<svg/>" },
      sidecar(exportDir, "fog_AI.png", [approved({ version: 1 })]));
    const found = await discoverUploadSources(root);
    expect(found.rows).toHaveLength(1); // only the real pair
    expect(found.rows[0].svgPath).not.toContain("export");
    expect(found.audit.files).not.toContain(0);
  });

  it("hides pairs outside the split scope when the tree holds a split output", async () => {
    const root = new FakeDir("test_processing");
    const mainDir = "main-folder/fog_AI/split_01"; // not a split-output path
    pairDir(root, mainDir, AI, { [`${STEM}.svg`]: "<svg/>" }, sidecar(mainDir, AI, [approved({ version: 1 })]));
    pairDir(root, DIR, AI, { [`${STEM}.svg`]: "<svg/>" }, sidecar(DIR, AI, [approved({ version: 1 })]));
    const found = await discoverUploadSources(root);
    expect(found.rows).toHaveLength(1);
    expect(found.rows[0].dirPath).toBe(DIR);
    expect(found.excluded.some((e) => e.kind === "outside-split")).toBe(true);
  });

  it("is deterministic: path order, then id", async () => {
    const a = await discoverUploadSources(happyRoot());
    const b = await discoverUploadSources(happyRoot());
    expect(a.rows).toEqual(b.rows);
    expect(a.excluded).toEqual(b.excluded);
  });

  it("audits the whole picture", async () => {
    const found: UploadDiscovery = await discoverUploadSources(happyRoot());
    expect(found.audit.rows).toBe(1);
    expect(found.audit.excluded).toBe(1);
    expect(found.audit.svgFiles).toBe(3); // fog v1+v2, mist v1
    expect(found.audit.sidecars).toBe(2);
    expect(found.audit.unreadable).toBe(0);
  });
});
